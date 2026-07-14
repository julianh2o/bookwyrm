import { prisma } from '../../db';
import { getEnabledInstances, type ReadarrInstance } from '../../config/readarr';
import { ReadarrClient, type ReadarrBook, type ReadarrEdition } from '../readarr';

export interface LibrarySyncResult {
	instanceId: string;
	instanceName: string;
	booksFound: number;
	booksImported: number;
	booksSkipped: number;
	booksCreated: number;
	booksUpdated: number;
	requestsCreated: number;
	requestsUpdated: number;
	errors: string[];
}

export interface LibrarySyncOptions {
	/** Override the Readarr client factory (for testing) */
	createClient?: (instance: ReadarrInstance) => ReadarrClient;
}

/**
 * Check if a book should be imported from Readarr.
 * Only import books that are monitored or have files downloaded.
 */
function shouldImportBook(book: ReadarrBook): boolean {
	const hasFiles = (book.statistics?.bookFileCount ?? 0) > 0;
	return book.monitored || hasFiles;
}

/**
 * Determine book request status from Readarr book data
 */
function determineStatus(book: ReadarrBook): string {
	const hasFiles = (book.statistics?.bookFileCount ?? 0) > 0;
	if (hasFiles) return 'available';
	if (book.grabbed) return 'downloading';
	if (book.monitored) return 'searching';
	return 'pending';
}

/**
 * Get cover URL from Readarr book images
 */
function getCoverUrl(book: ReadarrBook): string | undefined {
	const cover = book.images.find((img) => img.coverType === 'cover');
	return cover?.remoteUrl || cover?.url;
}

/**
 * Get ISBN from Readarr editions array
 * Prefers ISBN-13, returns first available ISBN
 */
function getIsbnFromEditions(editions: ReadarrEdition[]): string | undefined {
	for (const edition of editions) {
		if (edition.isbn13) {
			return edition.isbn13;
		}
	}
	return undefined;
}

/**
 * Service for syncing books from Readarr instances to the local database.
 */
export class LibrarySyncService {
	private createClient: (instance: ReadarrInstance) => ReadarrClient;

	constructor(options: LibrarySyncOptions = {}) {
		this.createClient =
			options.createClient ??
			((instance) =>
				new ReadarrClient({
					url: instance.url,
					apiKey: instance.apiKey,
				}));
	}

	/**
	 * Sync books from a single Readarr instance
	 */
	async syncInstance(instance: ReadarrInstance): Promise<LibrarySyncResult> {
		const result: LibrarySyncResult = {
			instanceId: instance.id,
			instanceName: instance.name,
			booksFound: 0,
			booksImported: 0,
			booksSkipped: 0,
			booksCreated: 0,
			booksUpdated: 0,
			requestsCreated: 0,
			requestsUpdated: 0,
			errors: [],
		};

		const client = this.createClient(instance);

		// Fetch books and authors in parallel
		let books: ReadarrBook[];
		let authorMap: Map<number, string>;
		try {
			const [booksResult, authors] = await Promise.all([client.getBooks(), client.getAuthors()]);
			books = booksResult;
			// Build a map of authorId -> authorName for quick lookup
			authorMap = new Map(authors.map((a) => [a.id!, a.authorName]));
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			result.errors.push(`Failed to fetch data: ${message}`);
			return result;
		}

		result.booksFound = books.length;

		// Only import books that are monitored or have files
		const booksToImport = books.filter(shouldImportBook);
		result.booksImported = booksToImport.length;
		result.booksSkipped = books.length - booksToImport.length;

		// Fetch editions for all books to get ISBN data
		// The /api/v1/book endpoint doesn't include editions, so we need to fetch them separately
		const isbnMap = new Map<number, string>();
		try {
			// Fetch editions in parallel (batched to avoid overwhelming the API)
			const BATCH_SIZE = 10;
			for (let i = 0; i < booksToImport.length; i += BATCH_SIZE) {
				const batch = booksToImport.slice(i, i + BATCH_SIZE);
				const editionResults = await Promise.all(
					batch.map(async (book) => {
						if (!book.id) return { bookId: 0, isbn: undefined };
						try {
							const editions = await client.getEditions(book.id);
							return { bookId: book.id, isbn: getIsbnFromEditions(editions) };
						} catch {
							// Silently ignore edition fetch errors
							return { bookId: book.id, isbn: undefined };
						}
					}),
				);
				for (const { bookId, isbn } of editionResults) {
					if (isbn) {
						isbnMap.set(bookId, isbn);
					}
				}
			}
		} catch (error) {
			// Non-fatal: we can still sync books without ISBNs
			const message = error instanceof Error ? error.message : 'Unknown error';
			result.errors.push(`Warning: Failed to fetch some edition data: ${message}`);
		}

		for (const readarrBook of booksToImport) {
			try {
				await this.syncBook(readarrBook, instance, result, authorMap, isbnMap);
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error';
				result.errors.push(`Failed to sync "${readarrBook.title}": ${message}`);
			}
		}

		return result;
	}

	/**
	 * Sync a single book from Readarr to the database
	 */
	private async syncBook(
		readarrBook: ReadarrBook,
		instance: ReadarrInstance,
		result: LibrarySyncResult,
		authorMap: Map<number, string>,
		isbnMap: Map<number, string>,
	): Promise<void> {
		const metadataId = readarrBook.foreignBookId;
		// Look up author name from our pre-fetched author map using the book's authorId
		const authorName = authorMap.get(readarrBook.authorId) ?? 'Unknown Author';
		// Look up ISBN from our pre-fetched editions map
		const isbn = readarrBook.id ? isbnMap.get(readarrBook.id) : undefined;
		const coverUrl = getCoverUrl(readarrBook);

		// Find or create the book
		let book = await prisma.book.findFirst({
			where: { metadataId },
		});

		if (book) {
			// Update existing book if needed (including ISBN if we have it and book doesn't)
			const needsUpdate =
				book.title !== readarrBook.title ||
				book.author !== authorName ||
				book.coverUrl !== coverUrl ||
				(!book.isbn && isbn);

			if (needsUpdate) {
				book = await prisma.book.update({
					where: { id: book.id },
					data: {
						title: readarrBook.title,
						author: authorName,
						coverUrl,
						isbn: book.isbn || isbn || null, // Keep existing ISBN if present
					},
				});
				result.booksUpdated++;
			}
		} else {
			// Create new book
			book = await prisma.book.create({
				data: {
					title: readarrBook.title,
					author: authorName,
					isbn: isbn || null,
					category: instance.category,
					coverUrl,
					metadataId,
					metadataProvider: 'readarr',
				},
			});
			result.booksCreated++;
		}

		// Find or create the book request for this instance
		const status = determineStatus(readarrBook);
		const externalId = readarrBook.id?.toString();
		const externalSlug = readarrBook.titleSlug;

		const existingRequest = await prisma.bookRequest.findUnique({
			where: {
				bookId_instanceId: {
					bookId: book.id,
					instanceId: instance.id,
				},
			},
		});

		if (existingRequest) {
			// Update if status, externalId, or externalSlug changed
			const needsUpdate =
				existingRequest.status !== status ||
				existingRequest.externalId !== externalId ||
				existingRequest.externalSlug !== externalSlug;

			if (needsUpdate) {
				await prisma.bookRequest.update({
					where: { id: existingRequest.id },
					data: {
						status,
						externalId,
						externalSlug,
						lastChecked: new Date(),
					},
				});
				result.requestsUpdated++;
			}
		} else {
			// Create new request
			await prisma.bookRequest.create({
				data: {
					bookId: book.id,
					instanceId: instance.id,
					status,
					externalId,
					externalSlug,
					lastChecked: new Date(),
				},
			});
			result.requestsCreated++;
		}
	}

	/**
	 * Sync books from all enabled Readarr instances
	 */
	async syncAll(): Promise<LibrarySyncResult[]> {
		const instances = getEnabledInstances();
		const results: LibrarySyncResult[] = [];

		for (const instance of instances) {
			const result = await this.syncInstance(instance);
			results.push(result);
		}

		return results;
	}
}

// Default singleton instance
let defaultService: LibrarySyncService | null = null;

export function getLibrarySyncService(): LibrarySyncService {
	if (!defaultService) {
		defaultService = new LibrarySyncService();
	}
	return defaultService;
}

export function resetLibrarySyncService(): void {
	defaultService = null;
}
