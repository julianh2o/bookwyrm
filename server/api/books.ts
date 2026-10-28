import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../db';
import { createBookSchema, updateBookSchema, listBooksQuerySchema } from '../validation';
import { getInstancesFor, getInstanceById } from '../config/readarr';
import { ZodError } from 'zod';
import { createRReadingGlassesProvider } from '../services/metadata';
import { guessCategory } from '../services/metadata/category';
import { getTracker } from '../services/tracker';
import { enqueueAdd, retryRequest, RetryError } from '../services/tracker/actions';

const router = Router();

type Row = Record<string, unknown>;

/** Dates → ISO strings, recursively for requests */
function serialize<T extends Row>(row: T): Row {
	const out: Row = {};
	for (const [key, value] of Object.entries(row)) {
		if (value instanceof Date) out[key] = value.toISOString();
		else if (key === 'requests' && Array.isArray(value)) out[key] = value.map((r) => serialize(r as Row));
		else out[key] = value;
	}
	return out;
}

function formatBook(book: Row) {
	return serialize(book);
}

const withRequests = { requests: { orderBy: { instanceId: 'asc' as const } } };

async function loadBook(id: string) {
	return prisma.book.findUnique({ where: { id }, include: withRequests });
}

/**
 * Error handler for async routes
 */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
	return (req: Request, res: Response, next: NextFunction) => {
		Promise.resolve(fn(req, res, next)).catch(next);
	};
}

/**
 * GET /api/books
 * List all books with their request statuses
 */
router.get(
	'/',
	asyncHandler(async (req, res) => {
		const query = listBooksQuerySchema.parse(req.query);

		const where: Record<string, unknown> = {};

		if (query.category) {
			where.category = query.category;
		}

		if (query.search) {
			where.OR = [
				{ title: { contains: query.search } },
				{ author: { contains: query.search } },
				{ isbn: { contains: query.search } },
			];
		}

		if (query.status) {
			where.requests = { some: { status: query.status } };
		}

		const orderBy =
			query.sort === 'title'
				? { title: 'asc' as const }
				: query.sort === 'author'
					? { author: 'asc' as const }
					: query.sort === 'activity'
						? { updatedAt: 'desc' as const }
						: { createdAt: 'desc' as const };

		let books = await prisma.book.findMany({
			where,
			include: withRequests,
			orderBy,
			take: query.sort === 'activity' ? undefined : query.limit,
			skip: query.sort === 'activity' ? undefined : query.offset,
		});

		if (query.sort === 'activity') {
			// Most recently changed request first (a book's own updatedAt doesn't move when its requests do)
			const latest = (b: (typeof books)[number]) => Math.max(0, ...b.requests.map((r) => r.updatedAt.getTime()));
			books = books.sort((a, b) => latest(b) - latest(a)).slice(query.offset, query.offset + query.limit);
		}

		const total = await prisma.book.count({ where });

		res.json({
			books: books.map(formatBook),
			total,
			limit: query.limit,
			offset: query.offset,
		});
	}),
);

/**
 * POST /api/books
 * Create a new book and optionally create requests to Readarr instances
 */
router.post(
	'/',
	asyncHandler(async (req, res) => {
		const parsed = createBookSchema.parse(req.body);

		// No category given: guess it from the book's genres
		let category = parsed.category;
		if (!category && parsed.metadataId && (parsed.metadataProvider ?? 'rreading-glasses') === 'rreading-glasses') {
			try {
				const meta = await createRReadingGlassesProvider().getById(parsed.metadataId);
				category = guessCategory(meta?.genres)?.category;
			} catch {
				// fall through to the error below
			}
		}
		if (!category) {
			res.status(400).json({ error: "Couldn't tell if this is fiction or nonfiction; pass category" });
			return;
		}
		const input = { ...parsed, category };

		// Same book already tracked? Reuse it and just add any missing instances.
		const existing =
			(input.metadataId
				? await prisma.book.findFirst({ where: { metadataId: input.metadataId }, include: { requests: true } })
				: null) ??
			(await prisma.book.findFirst({
				where: { title: input.title, author: input.author },
				include: { requests: true },
			}));

		const book =
			existing ??
			(await prisma.book.create({
				data: {
					title: input.title,
					author: input.author,
					isbn: input.isbn ?? null,
					category: input.category,
					coverUrl: input.coverUrl ?? null,
					notes: input.notes ?? null,
					metadataId: input.metadataId ?? null,
					metadataProvider: input.metadataProvider ?? null,
				},
			}));

		// Create pending requests for the chosen instances (default: audio + ebook for the category)
		const created: Array<{ id: string; instanceId: string }> = [];
		try {
			const instanceIds = input.instanceIds ?? getInstancesFor(input.category).map((i) => i.id);
			const have = new Set((existing?.requests ?? []).map((r) => r.instanceId));
			for (const instanceId of instanceIds) {
				const instance = getInstanceById(instanceId);
				if (!instance || !instance.enabled || have.has(instanceId)) continue;
				const request = await prisma.bookRequest.create({
					data: { bookId: book.id, instanceId, status: 'pending', phase: 'add' },
				});
				created.push(request);
			}
		} catch {
			// Config not available (test environments): book is still created
		}

		if (input.autoRequest !== false) {
			for (const request of created) enqueueAdd(request.id, request.instanceId);
		}

		const bookWithRequests = await loadBook(book.id);
		res.status(existing ? 200 : 201).json({ ...formatBook(bookWithRequests!), existing: !!existing });
	}),
);

/**
 * GET /api/books/:id
 * Get a single book with all its requests
 */
router.get(
	'/:id',
	asyncHandler(async (req, res) => {
		const { id } = req.params;

		const book = await loadBook(id);

		if (!book) {
			res.status(404).json({ error: 'Book not found' });
			return;
		}

		res.json(formatBook(book));
	}),
);

/**
 * PATCH /api/books/:id
 * Update a book's metadata
 */
router.patch(
	'/:id',
	asyncHandler(async (req, res) => {
		const { id } = req.params;
		const input = updateBookSchema.parse(req.body);

		// Check if book exists
		const existing = await prisma.book.findUnique({ where: { id } });
		if (!existing) {
			res.status(404).json({ error: 'Book not found' });
			return;
		}

		// Build update data, only including defined fields
		const updateData: Record<string, unknown> = {};
		if (input.title !== undefined) updateData.title = input.title;
		if (input.author !== undefined) updateData.author = input.author;
		if (input.isbn !== undefined) updateData.isbn = input.isbn;
		if (input.category !== undefined) updateData.category = input.category;
		if (input.coverUrl !== undefined) updateData.coverUrl = input.coverUrl;
		if (input.notes !== undefined) updateData.notes = input.notes;
		if (input.metadataId !== undefined) updateData.metadataId = input.metadataId;
		if (input.metadataProvider !== undefined) updateData.metadataProvider = input.metadataProvider;

		const book = await prisma.book.update({
			where: { id },
			data: updateData,
			include: withRequests,
		});

		res.json(formatBook(book));
	}),
);

/**
 * DELETE /api/books/:id
 * Delete a book and all associated requests
 */
router.delete(
	'/:id',
	asyncHandler(async (req, res) => {
		const { id } = req.params;

		// Check if book exists
		const existing = await prisma.book.findUnique({ where: { id } });
		if (!existing) {
			res.status(404).json({ error: 'Book not found' });
			return;
		}

		// Delete book (requests are cascaded due to onDelete: Cascade)
		await prisma.book.delete({ where: { id } });

		res.status(204).send();
	}),
);

/**
 * POST /api/books/:id/request
 * Send this book's pending requests to Readarr (runs in the background)
 */
router.post(
	'/:id/request',
	asyncHandler(async (req, res) => {
		const { id } = req.params;
		const book = await loadBook(id);
		if (!book) {
			res.status(404).json({ error: 'Book not found' });
			return;
		}
		for (const r of book.requests.filter((r) => r.status === 'pending')) enqueueAdd(r.id, r.instanceId);
		res.status(202).json({ book: formatBook((await loadBook(id))!) });
	}),
);

/**
 * POST /api/books/:id/sync
 * Re-check this book's instances against Readarr now
 */
router.post(
	'/:id/sync',
	asyncHandler(async (req, res) => {
		const { id } = req.params;
		const book = await loadBook(id);
		if (!book) {
			res.status(404).json({ error: 'Book not found' });
			return;
		}
		const tracker = getTracker();
		const results = await Promise.all(
			[...new Set(book.requests.map((r) => r.instanceId))]
				.map((instanceId) => getInstanceById(instanceId))
				.filter((i): i is NonNullable<typeof i> => !!i && i.enabled)
				.map((instance) => tracker.pollInstance(instance)),
		);
		res.json({ book: formatBook((await loadBook(id))!), results });
	}),
);

/**
 * POST /api/books/:id/instances/:instanceId
 * Request this book from one more Readarr instance (runs in the background)
 */
router.post(
	'/:id/instances/:instanceId',
	asyncHandler(async (req, res) => {
		const { id, instanceId } = req.params;
		const book = await loadBook(id);
		if (!book) {
			res.status(404).json({ error: 'Book not found' });
			return;
		}

		const instance = getInstanceById(instanceId);
		if (!instance) {
			res.status(404).json({ error: 'Instance not found' });
			return;
		}
		if (!instance.enabled) {
			res.status(400).json({ error: 'Instance is not enabled' });
			return;
		}

		const existingRequest = book.requests.find((r) => r.instanceId === instanceId);
		if (existingRequest) {
			res.status(400).json({
				error: 'Request already exists for this instance',
				requestId: existingRequest.id,
				status: existingRequest.status,
			});
			return;
		}

		const request = await prisma.bookRequest.create({
			data: { bookId: id, instanceId, status: 'pending', phase: 'add' },
		});
		enqueueAdd(request.id, instanceId);

		res.status(202).json({ book: formatBook((await loadBook(id))!), requestId: request.id });
	}),
);

/**
 * POST /api/books/requests/:requestId/retry
 * Retry the phase this request is stuck in: add, search, download (blocklist + re-search) or import (force import)
 */
router.post(
	'/requests/:requestId/retry',
	asyncHandler(async (req, res) => {
		const { requestId } = req.params;
		try {
			const result = await retryRequest(requestId);
			const request = await prisma.bookRequest.findUnique({ where: { id: requestId } });
			res.json({ book: formatBook((await loadBook(request!.bookId))!), ...result });
		} catch (error) {
			if (error instanceof RetryError) {
				const request = await prisma.bookRequest.findUnique({ where: { id: requestId } });
				const book = request ? await loadBook(request.bookId) : null;
				res.status(error.httpStatus).json({ error: error.message, book: book ? formatBook(book) : undefined });
				return;
			}
			throw error;
		}
	}),
);

/**
 * GET /api/books/requests/:requestId/events
 * What happened to this request, newest first
 */
router.get(
	'/requests/:requestId/events',
	asyncHandler(async (req, res) => {
		const events = await prisma.requestEvent.findMany({
			where: { requestId: req.params.requestId },
			orderBy: { createdAt: 'desc' },
			take: 25,
		});
		res.json({ events: events.map((e) => serialize(e)) });
	}),
);

/**
 * Error handling middleware for this router
 */
router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
	if (err instanceof ZodError) {
		res.status(400).json({
			error: 'Validation error',
			details: err.issues,
		});
		return;
	}

	console.error('Books API error:', err);
	res.status(500).json({ error: 'Internal server error' });
});

export default router;
