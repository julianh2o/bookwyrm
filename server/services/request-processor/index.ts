import { prisma } from '../../db';
import { getInstanceById, type ReadarrInstance } from '../../config/readarr';
import { ReadarrClient, type ReadarrBook, type ReadarrAuthor } from '../readarr';

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
	status: 'searching' | 'not_found' | 'error';
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

		try {
			// Search for the book in Readarr
			const searchTerm = `${request.book.title} ${request.book.author}`;
			const searchResults = await client.searchBooks(searchTerm);

			if (searchResults.length === 0) {
				await this.updateRequestStatus(requestId, 'not_found', null, null, 'Book not found in Readarr search');
				return {
					success: true,
					status: 'not_found',
				};
			}

			// Find the best match (exact title match preferred)
			const book = this.findBestMatch(searchResults, request.book.title, request.book.author);
			if (!book) {
				await this.updateRequestStatus(requestId, 'not_found', null, null, 'No matching book found in search results');
				return {
					success: true,
					status: 'not_found',
				};
			}

			// Get Readarr configuration for adding author
			const [qualityProfiles, metadataProfiles, rootFolders] = await Promise.all([
				client.getQualityProfiles(),
				client.getMetadataProfiles(),
				client.getRootFolders(),
			]);

			if (qualityProfiles.length === 0 || metadataProfiles.length === 0 || rootFolders.length === 0) {
				await this.updateRequestStatus(requestId, 'error', null, null, 'Readarr instance not properly configured');
				return {
					success: false,
					status: 'error',
					errorMessage: 'Readarr instance not properly configured (missing profiles or root folder)',
				};
			}

			// Get author foreignAuthorId - search for author if not present in book result
			// Prefer Readarr's author data, then try extracting from authorTitle, then fallback to our DB
			let authorName: string = request.book.author; // Default to our database value
			if (book.author?.authorName) {
				authorName = book.author.authorName;
			} else if (book.authorTitle) {
				// authorTitle is "Author Name - Book Title", extract just the author
				const dashIndex = book.authorTitle.indexOf(' - ');
				if (dashIndex > 0) {
					authorName = book.authorTitle.substring(0, dashIndex).trim();
				}
			}

			let foreignAuthorId = book.author?.foreignAuthorId;

			if (!foreignAuthorId) {
				// Search for the author to get their foreignAuthorId
				const authorResults = await client.searchAuthors(authorName);

				// Try exact match first
				let matchingAuthor = authorResults.find(
					(a) => a.authorName.toLowerCase() === authorName.toLowerCase() && a.foreignAuthorId,
				);

				// If no exact match, try partial match (author name contains or is contained)
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

				if (matchingAuthor) {
					foreignAuthorId = matchingAuthor.foreignAuthorId;
					authorName = matchingAuthor.authorName; // Use the canonical name from Readarr
				} else {
					await this.updateRequestStatus(
						requestId,
						'error',
						null,
						null,
						`Could not find author "${authorName}" in Readarr`,
					);
					return {
						success: false,
						status: 'error',
						errorMessage: `Could not find author "${authorName}" in Readarr`,
					};
				}
			}

			// Get ISBN - prefer our database, fallback to Readarr search result
			let isbn = request.book.isbn;
			if (!isbn) {
				isbn = getIsbnFromBook(book) ?? null;
				// Update our database with the ISBN if we found one
				if (isbn) {
					await prisma.book.update({
						where: { id: request.book.id },
						data: { isbn },
					});
				}
			}

			// Add the book and trigger search
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

			// Update request status to searching
			await this.updateRequestStatus(
				requestId,
				'searching',
				result.book.id?.toString() ?? null,
				result.book.titleSlug ?? null,
				null,
			);

			return {
				success: true,
				status: 'searching',
				externalId: result.book.id?.toString(),
				externalSlug: result.book.titleSlug,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error(
				`[RequestProcessor] Failed to process request for "${request.book.title}" by ${request.book.author}:`,
				errorMessage,
			);
			if (error instanceof Error && error.stack) {
				console.error(`[RequestProcessor] Stack trace:`, error.stack);
			}
			await this.updateRequestStatus(requestId, 'error', null, null, errorMessage);
			return {
				success: false,
				status: 'error',
				errorMessage,
			};
		}
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
	): (ReadarrBook & { author?: ReadarrAuthor }) | null {
		const normalizedTitle = title.toLowerCase().trim();
		const normalizedAuthor = author.toLowerCase().trim();

		// First try exact title match
		for (const book of results) {
			if (book.title.toLowerCase().trim() === normalizedTitle) {
				return book;
			}
		}

		// Then try title contains match with author check
		for (const book of results) {
			const bookTitle = book.title.toLowerCase();
			const bookAuthor = book.author?.authorName?.toLowerCase() ?? '';

			if (
				(bookTitle.includes(normalizedTitle) || normalizedTitle.includes(bookTitle)) &&
				(bookAuthor.includes(normalizedAuthor) || normalizedAuthor.includes(bookAuthor))
			) {
				return book;
			}
		}

		// Finally, just return the first result if no better match
		return results[0] ?? null;
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
				externalId,
				externalSlug,
				errorMessage,
				lastChecked: new Date(),
			},
		});
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
