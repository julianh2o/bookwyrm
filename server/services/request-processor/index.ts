import { prisma } from '../../db';
import { getInstanceById, type ReadarrInstance } from '../../config/readarr';
import { ReadarrClient, type ReadarrBook, type ReadarrAuthor } from '../readarr';
import { ReadarrTimeoutError } from '../readarr/client';
import { recordEvent } from '../tracker/events';
import { authorsOverlap, normalizeTitle } from '../tracker/state';

/** Adding an author makes Readarr fetch all of their metadata, which can take minutes */
const ADD_TIMEOUT_MS = 180000;

/**
 * Extract ISBN from Readarr book editions
 */
function getIsbnFromBook(book: ReadarrBook): string | undefined {
	if (!book.editions || book.editions.length === 0) {
		return undefined;
	}
	for (const edition of book.editions) {
		if (edition.isbn13) {
			return edition.isbn13;
		}
	}
	return undefined;
}

export interface ProcessResult {
	success: boolean;
	status: 'searching' | 'error';
	externalId?: string;
	externalSlug?: string;
	errorMessage?: string;
}

export interface RequestProcessorOptions {
	/** Override the Readarr client factory (for testing) */
	createClient?: (instance: ReadarrInstance) => ReadarrClient;
}

/**
 * Service for processing book requests to Readarr instances.
 * Handles searching, adding, and triggering downloads.
 */
export class RequestProcessor {
	private createClient: (instance: ReadarrInstance) => ReadarrClient;

	constructor(options: RequestProcessorOptions = {}) {
		this.createClient =
			options.createClient ??
			((instance) =>
				new ReadarrClient({
					url: instance.url,
					apiKey: instance.apiKey,
					timeout: ADD_TIMEOUT_MS,
					rreadingGlassesUrl: process.env.RREADING_GLASSES_URL,
				}));
	}

	/**
	 * Process a single book request.
	 * Searches Readarr for the book, adds it if found, and triggers a search.
	 */
	async processRequest(requestId: string): Promise<ProcessResult> {
		// Get the request with book details
		const request = await prisma.bookRequest.findUnique({
			where: { id: requestId },
			include: { book: true },
		});

		if (!request) {
			return {
				success: false,
				status: 'error',
				errorMessage: 'Request not found',
			};
		}

		// Get the Readarr instance config
		const instance = getInstanceById(request.instanceId);
		if (!instance) {
			await this.updateRequestStatus(requestId, 'error', null, null, `Instance ${request.instanceId} not found`);
			return {
				success: false,
				status: 'error',
				errorMessage: `Instance ${request.instanceId} not found`,
			};
		}

		if (!instance.enabled) {
			await this.updateRequestStatus(requestId, 'error', null, null, `Instance ${request.instanceId} is disabled`);
			return {
				success: false,
				status: 'error',
				errorMessage: `Instance ${request.instanceId} is disabled`,
			};
		}

		const client = this.createClient(instance);
		await prisma.bookRequest.update({
			where: { id: requestId },
			data: { status: 'adding', phase: 'add', errorMessage: null, attempts: { increment: 1 } },
		});
		await recordEvent(requestId, 'add', 'info', `Adding to ${instance.name}`);

		try {
			const metadataId = request.book.metadataId;

			// Already in Readarr (e.g. added there by hand, or an earlier add that timed out on our side)?
			const library = await client.getBooks();
			const inLibrary =
				(metadataId ? library.find((b) => b.foreignBookId === metadataId) : undefined) ??
				library.find((b) => normalizeTitle(b.title) === normalizeTitle(request.book.title) && b.monitored);
			if (inLibrary?.id) {
				if (!inLibrary.monitored) {
					inLibrary.monitored = true;
					await client.updateBook(inLibrary);
				}
				await client.searchBook([inLibrary.id]);
				return this.succeed(requestId, inLibrary.id, inLibrary.titleSlug, 'Already in Readarr; search triggered');
			}

			// Look it up: by work id first (exact), then by title + author
			let searchResults: ReadarrBook[] = [];
			if (metadataId && /^\d+$/.test(metadataId)) {
				searchResults = await client.searchBooks(`work:${metadataId}`);
			}
			let book = this.findBestMatch(searchResults, request.book.title, request.book.author, metadataId);
			if (!book) {
				searchResults = await client.searchBooks(`${request.book.title} ${request.book.author}`);
				book = this.findBestMatch(searchResults, request.book.title, request.book.author, metadataId);
			}
			if (!book) {
				return this.fail(
					requestId,
					searchResults.length === 0
						? `Readarr's metadata search found nothing for "${request.book.title}"`
						: `Readarr's search didn't return a match for "${request.book.title}" by ${request.book.author}`,
				);
			}

			// Get Readarr configuration for adding author
			const [qualityProfiles, metadataProfiles, rootFolders] = await Promise.all([
				client.getQualityProfiles(),
				client.getMetadataProfiles(),
				client.getRootFolders(),
			]);

			if (qualityProfiles.length === 0 || metadataProfiles.length === 0 || rootFolders.length === 0) {
				return this.fail(requestId, 'Readarr instance not properly configured (missing profiles or root folder)');
			}

			// Prefer Readarr's author data, then authorTitle ("Author Name - Book Title"), then our DB
			let authorName: string = request.book.author;
			if (book.author?.authorName) {
				authorName = book.author.authorName;
			} else if (book.authorTitle) {
				const dashIndex = book.authorTitle.indexOf(' - ');
				if (dashIndex > 0) {
					authorName = book.authorTitle.substring(0, dashIndex).trim();
				}
			}

			let foreignAuthorId = book.author?.foreignAuthorId;
			if (!foreignAuthorId) {
				const authorResults = await client.searchAuthors(authorName);
				let matchingAuthor = authorResults.find(
					(a) => a.authorName.toLowerCase() === authorName.toLowerCase() && a.foreignAuthorId,
				);
				if (!matchingAuthor) {
					const normalizedSearch = authorName.toLowerCase();
					matchingAuthor = authorResults.find((a) => {
						const normalizedAuthor = a.authorName.toLowerCase();
						return (
							a.foreignAuthorId &&
							(normalizedAuthor.includes(normalizedSearch) || normalizedSearch.includes(normalizedAuthor))
						);
					});
				}
				if (!matchingAuthor) {
					return this.fail(requestId, `Could not find author "${authorName}" in Readarr`);
				}
				foreignAuthorId = matchingAuthor.foreignAuthorId;
				authorName = matchingAuthor.authorName;
			}

			// Get ISBN - prefer our database, fallback to Readarr search result
			let isbn = request.book.isbn;
			if (!isbn) {
				isbn = getIsbnFromBook(book) ?? null;
				if (isbn) {
					await prisma.book.update({ where: { id: request.book.id }, data: { isbn } });
				}
			}

			const result = await client.addAndSearchBook(
				book.foreignBookId,
				foreignAuthorId,
				authorName,
				qualityProfiles[0].id,
				metadataProfiles[0].id,
				rootFolders[0].path,
				isbn,
				book.title,
			);

			return this.succeed(requestId, result.book.id!, result.book.titleSlug, 'Added to Readarr; search triggered');
		} catch (error) {
			let errorMessage = error instanceof Error ? error.message : 'Unknown error';
			if (error instanceof ReadarrTimeoutError) {
				errorMessage += '. It may still finish in Readarr; the next check will pick it up.';
			}
			console.error(`[RequestProcessor] Failed to add "${request.book.title}" to ${instance.id}:`, errorMessage);
			return this.fail(requestId, errorMessage);
		}
	}

	private async succeed(
		requestId: string,
		readarrBookId: number,
		slug: string | undefined,
		message: string,
	): Promise<ProcessResult> {
		await prisma.bookRequest.update({
			where: { id: requestId },
			data: {
				status: 'searching',
				phase: 'search',
				externalId: String(readarrBookId),
				externalSlug: slug ?? null,
				errorMessage: null,
				lastSearchAt: new Date(),
				lastChecked: new Date(),
			},
		});
		await recordEvent(requestId, 'search', 'info', message);
		return { success: true, status: 'searching', externalId: String(readarrBookId), externalSlug: slug };
	}

	private async fail(requestId: string, errorMessage: string): Promise<ProcessResult> {
		await this.updateRequestStatus(requestId, 'error', null, null, errorMessage);
		return { success: false, status: 'error', errorMessage };
	}

	/**
	 * Process all pending requests for a book.
	 */
	async processBookRequests(bookId: string): Promise<Map<string, ProcessResult>> {
		const requests = await prisma.bookRequest.findMany({
			where: {
				bookId,
				status: 'pending',
			},
		});

		const results = new Map<string, ProcessResult>();

		for (const request of requests) {
			const result = await this.processRequest(request.id);
			results.set(request.instanceId, result);
		}

		return results;
	}

	/**
	 * Process all pending requests across all books.
	 */
	async processAllPendingRequests(): Promise<{ processed: number; errors: number }> {
		const requests = await prisma.bookRequest.findMany({
			where: { status: 'pending' },
		});

		let processed = 0;
		let errors = 0;

		for (const request of requests) {
			const result = await this.processRequest(request.id);
			processed++;
			if (!result.success) {
				errors++;
			}
		}

		return { processed, errors };
	}

	/**
	 * Find the best matching book from search results.
	 */
	private findBestMatch(
		results: ReadarrBook[],
		title: string,
		author: string,
		metadataId?: string | null,
	): (ReadarrBook & { author?: ReadarrAuthor }) | null {
		if (metadataId) {
			const exact = results.find((b) => b.foreignBookId === metadataId);
			if (exact) return exact;
		}
		// Same title (exact, then ignoring subtitles/punctuation) by an overlapping author.
		// Never fall back to "first result": that's how omnibuses and namesakes get added.
		const sameAuthor = (b: ReadarrBook & { author?: ReadarrAuthor }) => {
			const name = b.author?.authorName ?? (b.authorTitle?.includes(' - ') ? b.authorTitle.split(' - ')[0] : '');
			return !name || authorsOverlap(name, author);
		};
		const exactTitle = title.toLowerCase().trim();
		const loose = normalizeTitle(title);
		return (
			results.find((b) => b.title.toLowerCase().trim() === exactTitle && sameAuthor(b)) ??
			results.find((b) => normalizeTitle(b.title) === loose && sameAuthor(b)) ??
			null
		);
	}

	/**
	 * Update request status in database.
	 */
	private async updateRequestStatus(
		requestId: string,
		status: string,
		externalId: string | null,
		externalSlug: string | null,
		errorMessage: string | null,
	): Promise<void> {
		await prisma.bookRequest.update({
			where: { id: requestId },
			data: {
				status,
				phase: 'add',
				externalId,
				externalSlug,
				errorMessage,
				lastChecked: new Date(),
				...(status === 'error' ? { lastErrorAt: new Date() } : {}),
			},
		});
		if (errorMessage) {
			await recordEvent(requestId, 'add', 'error', errorMessage);
		}
	}
}

// Default singleton instance
let defaultProcessor: RequestProcessor | null = null;

export function getRequestProcessor(): RequestProcessor {
	if (!defaultProcessor) {
		defaultProcessor = new RequestProcessor();
	}
	return defaultProcessor;
}

export function resetRequestProcessor(): void {
	defaultProcessor = null;
}
