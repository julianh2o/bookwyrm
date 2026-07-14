import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../db';
import { createBookSchema, updateBookSchema, listBooksQuerySchema } from '../validation';
import { getInstancesFor, getInstanceById } from '../config/readarr';
import { ZodError } from 'zod';
import { RequestProcessor } from '../services/request-processor';
import { StatusSyncService } from '../services/status-sync';

const router = Router();

/**
 * Helper to format Prisma dates to ISO strings
 */
function formatBook(book: {
	id: string;
	title: string;
	author: string;
	isbn: string | null;
	category: string;
	coverUrl: string | null;
	notes: string | null;
	metadataId: string | null;
	metadataProvider: string | null;
	createdAt: Date;
	updatedAt: Date;
	requests?: Array<{
		id: string;
		bookId: string;
		instanceId: string;
		status: string;
		externalId: string | null;
		externalSlug: string | null;
		errorMessage: string | null;
		createdAt: Date;
		updatedAt: Date;
		lastChecked: Date | null;
	}>;
}) {
	return {
		...book,
		createdAt: book.createdAt.toISOString(),
		updatedAt: book.updatedAt.toISOString(),
		requests: book.requests?.map((r) => ({
			...r,
			createdAt: r.createdAt.toISOString(),
			updatedAt: r.updatedAt.toISOString(),
			lastChecked: r.lastChecked?.toISOString() ?? null,
		})),
	};
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

		// If filtering by status, we need to filter after fetching
		const books = await prisma.book.findMany({
			where,
			include: { requests: true },
			orderBy: { createdAt: 'desc' },
			take: query.limit,
			skip: query.offset,
		});

		// Filter by request status if specified
		let filteredBooks = books;
		if (query.status) {
			filteredBooks = books.filter((book) => book.requests.some((r) => r.status === query.status));
		}

		const total = await prisma.book.count({ where });

		res.json({
			books: filteredBooks.map(formatBook),
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
		const input = createBookSchema.parse(req.body);

		// Create the book
		const book = await prisma.book.create({
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
		});

		// Get matching Readarr instances and create pending requests
		try {
			const instances = getInstancesFor(input.category);
			if (instances.length > 0) {
				await prisma.bookRequest.createMany({
					data: instances.map((instance) => ({
						bookId: book.id,
						instanceId: instance.id,
						status: 'pending',
					})),
				});
			}
		} catch {
			// Config not available - skip creating requests
			// This can happen in test environments
		}

		// Fetch the book with requests
		const bookWithRequests = await prisma.book.findUnique({
			where: { id: book.id },
			include: { requests: true },
		});

		res.status(201).json(formatBook(bookWithRequests!));
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

		const book = await prisma.book.findUnique({
			where: { id },
			include: { requests: true },
		});

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
			include: { requests: true },
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
 * Process pending Readarr requests for a book
 */
router.post(
	'/:id/request',
	asyncHandler(async (req, res) => {
		const { id } = req.params;

		// Check if book exists
		const book = await prisma.book.findUnique({
			where: { id },
			include: { requests: true },
		});

		if (!book) {
			res.status(404).json({ error: 'Book not found' });
			return;
		}

		const processor = new RequestProcessor();
		const results = await processor.processBookRequests(id);

		// Convert Map to plain object for JSON response
		const resultsObj: Record<string, unknown> = {};
		results.forEach((value, key) => {
			resultsObj[key] = value;
		});

		// Fetch updated book with requests
		const updatedBook = await prisma.book.findUnique({
			where: { id },
			include: { requests: true },
		});

		res.json({
			book: formatBook(updatedBook!),
			results: resultsObj,
		});
	}),
);

/**
 * POST /api/books/:id/sync
 * Sync status with Readarr for a book's requests
 */
router.post(
	'/:id/sync',
	asyncHandler(async (req, res) => {
		const { id } = req.params;

		// Check if book exists
		const book = await prisma.book.findUnique({ where: { id } });

		if (!book) {
			res.status(404).json({ error: 'Book not found' });
			return;
		}

		const syncService = new StatusSyncService();
		const results = await syncService.syncBookRequests(id);

		// Fetch updated book with requests
		const updatedBook = await prisma.book.findUnique({
			where: { id },
			include: { requests: true },
		});

		res.json({
			book: formatBook(updatedBook!),
			results,
		});
	}),
);

/**
 * POST /api/books/:id/instances/:instanceId
 * Add a book to a specific Readarr instance and begin search
 */
router.post(
	'/:id/instances/:instanceId',
	asyncHandler(async (req, res) => {
		const { id, instanceId } = req.params;

		// Check if book exists
		const book = await prisma.book.findUnique({
			where: { id },
			include: { requests: true },
		});

		if (!book) {
			res.status(404).json({ error: 'Book not found' });
			return;
		}

		// Check if instance exists and is enabled
		const instance = getInstanceById(instanceId);
		if (!instance) {
			res.status(404).json({ error: 'Instance not found' });
			return;
		}

		if (!instance.enabled) {
			res.status(400).json({ error: 'Instance is not enabled' });
			return;
		}

		// Check if request already exists for this instance
		const existingRequest = book.requests.find((r) => r.instanceId === instanceId);
		if (existingRequest) {
			res.status(400).json({
				error: 'Request already exists for this instance',
				requestId: existingRequest.id,
				status: existingRequest.status,
			});
			return;
		}

		// Create the request with pending status
		const request = await prisma.bookRequest.create({
			data: {
				bookId: id,
				instanceId,
				status: 'pending',
			},
		});

		// Process the request immediately
		const processor = new RequestProcessor();
		const result = await processor.processRequest(request.id);

		// Fetch updated book with requests
		const updatedBook = await prisma.book.findUnique({
			where: { id },
			include: { requests: true },
		});

		res.status(201).json({
			book: formatBook(updatedBook!),
			result,
		});
	}),
);

/**
 * POST /api/books/requests/:requestId/retry
 * Retry a failed or not_found request
 */
router.post(
	'/requests/:requestId/retry',
	asyncHandler(async (req, res) => {
		const { requestId } = req.params;

		// Get the request
		const request = await prisma.bookRequest.findUnique({
			where: { id: requestId },
			include: { book: true },
		});

		if (!request) {
			res.status(404).json({ error: 'Request not found' });
			return;
		}

		// Only allow retry for error or not_found status
		if (!['error', 'not_found'].includes(request.status)) {
			res.status(400).json({
				error: 'Can only retry requests with error or not_found status',
				currentStatus: request.status,
			});
			return;
		}

		// Reset status to pending
		await prisma.bookRequest.update({
			where: { id: requestId },
			data: {
				status: 'pending',
				errorMessage: null,
			},
		});

		// Process the request
		const processor = new RequestProcessor();
		const result = await processor.processRequest(requestId);

		// Fetch updated book with requests
		const updatedBook = await prisma.book.findUnique({
			where: { id: request.bookId },
			include: { requests: true },
		});

		res.json({
			book: formatBook(updatedBook!),
			result,
		});
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
