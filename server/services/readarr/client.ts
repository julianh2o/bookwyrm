import type {
	ReadarrBook,
	ReadarrAuthor,
	ReadarrEdition,
	ReadarrCommand,
	ReadarrCommandResponse,
	ReadarrSystemStatus,
	ReadarrQualityProfile,
	ReadarrMetadataProfile,
	ReadarrRootFolder,
} from './types';
import { RReadingGlassesProvider, type RRGWork, type RRGBook } from '../metadata/rreading-glasses';

export interface ReadarrClientConfig {
	url: string;
	apiKey: string;
	timeout?: number;
	/** rreading-glasses base URL for fetching edition data */
	rreadingGlassesUrl?: string;
}

export class ReadarrClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly timeout: number;
	private readonly rreadingGlasses: RReadingGlassesProvider | null;

	constructor(config: ReadarrClientConfig) {
		this.baseUrl = config.url.replace(/\/$/, '');
		this.apiKey = config.apiKey;
		this.timeout = config.timeout ?? 30000;
		this.rreadingGlasses = config.rreadingGlassesUrl
			? new RReadingGlassesProvider({ baseUrl: config.rreadingGlassesUrl })
			: null;
	}

	/**
	 * Test connection to Readarr instance
	 */
	async testConnection(): Promise<ReadarrSystemStatus> {
		return this.get<ReadarrSystemStatus>('/api/v1/system/status');
	}

	/**
	 * Search for books by title/author
	 */
	async searchBooks(term: string): Promise<ReadarrBook[]> {
		return this.get<ReadarrBook[]>('/api/v1/book/lookup', { term });
	}

	/**
	 * Search for authors by name
	 */
	async searchAuthors(term: string): Promise<ReadarrAuthor[]> {
		return this.get<ReadarrAuthor[]>('/api/v1/author/lookup', { term });
	}

	/**
	 * Get all books in library
	 */
	async getBooks(): Promise<ReadarrBook[]> {
		return this.get<ReadarrBook[]>('/api/v1/book');
	}

	/**
	 * Get books by author ID
	 */
	async getBooksByAuthor(authorId: number): Promise<ReadarrBook[]> {
		return this.get<ReadarrBook[]>('/api/v1/book', { authorId: authorId.toString() });
	}

	/**
	 * Get a specific book by ID
	 */
	async getBook(id: number): Promise<ReadarrBook> {
		return this.get<ReadarrBook>(`/api/v1/book/${id}`);
	}

	/**
	 * Get all authors in library
	 */
	async getAuthors(): Promise<ReadarrAuthor[]> {
		return this.get<ReadarrAuthor[]>('/api/v1/author');
	}

	/**
	 * Get a specific author by ID
	 */
	async getAuthor(id: number): Promise<ReadarrAuthor> {
		return this.get<ReadarrAuthor>(`/api/v1/author/${id}`);
	}

	/**
	 * Get all editions for a specific book
	 * This is required to get ISBN data as the /api/v1/book endpoint doesn't include editions
	 */
	async getEditions(bookId: number): Promise<ReadarrEdition[]> {
		return this.get<ReadarrEdition[]>('/api/v1/edition', { bookId: bookId.toString() });
	}

	/**
	 * Add an author to the library
	 */
	async addAuthor(author: Partial<ReadarrAuthor> & { foreignAuthorId: string }): Promise<ReadarrAuthor> {
		return this.post<ReadarrAuthor>('/api/v1/author', author);
	}

	/**
	 * Delete an author from the library
	 */
	async deleteAuthor(authorId: number, deleteFiles: boolean = false): Promise<void> {
		await this.delete(`/api/v1/author/${authorId}?deleteFiles=${deleteFiles}`);
	}

	/**
	 * Add a book to the library (from a lookup result)
	 */
	async addBook(book: ReadarrBook): Promise<ReadarrBook> {
		console.log(`[Readarr] POST /api/v1/book payload:`, JSON.stringify(book, null, 2));
		return this.post<ReadarrBook>('/api/v1/book', book);
	}

	/**
	 * Update a book (e.g., set monitored=true)
	 */
	async updateBook(book: ReadarrBook): Promise<ReadarrBook> {
		return this.put<ReadarrBook>(`/api/v1/book/${book.id}`, book);
	}

	/**
	 * Trigger a book search command
	 */
	async searchBook(bookIds: number[]): Promise<ReadarrCommandResponse> {
		return this.post<ReadarrCommandResponse>('/api/v1/command', {
			name: 'BookSearch',
			bookIds,
		} as ReadarrCommand);
	}

	/**
	 * Trigger an author search (searches for all monitored books)
	 */
	async searchAuthor(authorId: number): Promise<ReadarrCommandResponse> {
		return this.post<ReadarrCommandResponse>('/api/v1/command', {
			name: 'AuthorSearch',
			authorId,
		} as ReadarrCommand);
	}

	/**
	 * Refresh author metadata (fetches books from metadata provider)
	 */
	async refreshAuthor(authorId: number): Promise<ReadarrCommandResponse> {
		return this.post<ReadarrCommandResponse>('/api/v1/command', {
			name: 'RefreshAuthor',
			authorId,
		} as ReadarrCommand);
	}

	/**
	 * Get command status
	 */
	async getCommand(commandId: number): Promise<ReadarrCommandResponse> {
		return this.get<ReadarrCommandResponse>(`/api/v1/command/${commandId}`);
	}

	/**
	 * Wait for a command to complete
	 */
	async waitForCommand(commandId: number, timeoutMs: number = 30000): Promise<ReadarrCommandResponse> {
		const startTime = Date.now();
		while (Date.now() - startTime < timeoutMs) {
			const command = await this.getCommand(commandId);
			if (command.status === 'completed' || command.status === 'failed') {
				return command;
			}
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
		throw new Error(`Command ${commandId} timed out after ${timeoutMs}ms`);
	}

	/**
	 * Get quality profiles
	 */
	async getQualityProfiles(): Promise<ReadarrQualityProfile[]> {
		return this.get<ReadarrQualityProfile[]>('/api/v1/qualityprofile');
	}

	/**
	 * Get metadata profiles
	 */
	async getMetadataProfiles(): Promise<ReadarrMetadataProfile[]> {
		return this.get<ReadarrMetadataProfile[]>('/api/v1/metadataprofile');
	}

	/**
	 * Get root folders
	 */
	async getRootFolders(): Promise<ReadarrRootFolder[]> {
		return this.get<ReadarrRootFolder[]>('/api/v1/rootfolder');
	}

	/**
	 * Check if a book has files (is available)
	 */
	async isBookAvailable(bookId: number): Promise<boolean> {
		const book = await this.getBook(bookId);
		return (book.statistics?.bookFileCount ?? 0) > 0;
	}

	/**
	 * Find or add an author, then find or add a book, monitor it, and trigger search
	 */
	async addAndSearchBook(
		foreignBookId: string,
		foreignAuthorId: string,
		authorName: string,
		qualityProfileId: number,
		metadataProfileId: number,
		rootFolderPath: string,
		isbn?: string | null,
		title?: string | null,
	): Promise<{ author: ReadarrAuthor; book: ReadarrBook; commandId: number }> {
		// Check if author exists in library
		let author: ReadarrAuthor | undefined;
		let authorWasAdded = false;
		const authors = await this.getAuthors();
		author = authors.find((a) => a.foreignAuthorId === foreignAuthorId);

		console.log(
			`[Readarr] Looking for author with foreignAuthorId: ${foreignAuthorId}, found: ${author ? `"${author.authorName}" (id: ${author.id})` : 'none'}`,
		);
		if (!author && authors.length > 0) {
			// Log existing authors to help debug ID mismatches
			const similar = authors.filter((a) =>
				a.authorName.toLowerCase().includes(authorName.toLowerCase().split(' ')[0]),
			);
			if (similar.length > 0) {
				console.log(
					`[Readarr] Similar authors in library:`,
					similar.map((a) => `"${a.authorName}" (${a.foreignAuthorId})`),
				);
			}
		}

		// If not, add the author with the specific book we want to monitor
		if (!author) {
			console.log(`[Readarr] Adding author: "${authorName}" with book ${foreignBookId}`);
			author = await this.addAuthor({
				foreignAuthorId,
				authorName,
				qualityProfileId,
				metadataProfileId,
				path: `${rootFolderPath}/${authorName}`,
				monitored: false,
				monitorNewItems: 'none',
				tags: [],
				addOptions: {
					monitor: 'none',
					booksToMonitor: [foreignBookId],
					monitored: true,
					searchForMissingBooks: true,
				},
			} as Partial<ReadarrAuthor> & { foreignAuthorId: string });
			authorWasAdded = true;
			console.log(`[Readarr] Author added with id: ${author.id}`);
		}

		// Get books for this author
		let books = await this.getBooksByAuthor(author.id!);
		let book = books.find((b) => b.foreignBookId === foreignBookId);

		// If book not found and author was just added, refresh and try again
		// (author metadata fetch might still be in progress)
		if (!book && authorWasAdded) {
			console.log(`[Readarr] Book not found after adding author, refreshing author metadata...`);
			const refreshCmd = await this.refreshAuthor(author.id!);
			await this.waitForCommand(refreshCmd.id, 30000);
			console.log(`[Readarr] Author refresh complete, re-fetching books...`);
			books = await this.getBooksByAuthor(author.id!);
			book = books.find((b) => b.foreignBookId === foreignBookId);
		}

		// If still not found, try refreshing anyway (metadata might be stale)
		if (!book) {
			console.log(`[Readarr] Book not found in author's library, refreshing author metadata...`);
			const refreshCmd = await this.refreshAuthor(author.id!);
			await this.waitForCommand(refreshCmd.id, 30000);
			console.log(`[Readarr] Author refresh complete, re-fetching books...`);
			books = await this.getBooksByAuthor(author.id!);
			book = books.find((b) => b.foreignBookId === foreignBookId);
		}

		// If book still not found in author's library, search for it externally and try to add
		if (!book) {
			console.log(`[Readarr] Book not in author's library (${books.length} books), searching externally...`);

			// Search by work:{foreignBookId} first (most precise for Hardcover)
			console.log(`[Readarr] Searching by work:${foreignBookId}`);
			let searchResults = await this.searchBooks(`work:${foreignBookId}`);
			let searchBook = searchResults.find((b) => b.foreignBookId === foreignBookId);

			// Fall back to title search if work: search didn't find it
			if (!searchBook && title) {
				const searchTerm = `${title} ${authorName}`;
				console.log(`[Readarr] work: search failed, trying title search: "${searchTerm}"`);
				searchResults = await this.searchBooks(searchTerm);
				searchBook = searchResults.find((b) => b.foreignBookId === foreignBookId);
			}

			if (searchBook) {
				console.log(`[Readarr] Found book in search: "${searchBook.title}"`);
				// Set required fields
				searchBook.monitored = true;
				searchBook.authorId = author.id!;
				searchBook.anyEditionOk = true;
				searchBook.addOptions = {
					addType: 'manual',
					searchForNewBook: false, // We'll trigger the search separately
				};
				// Include minimal author with required profile IDs for Readarr validation
				searchBook.author = {
					id: author.id,
					authorMetadataId: author.authorMetadataId,
					authorName: author.authorName,
					authorNameLastFirst: author.authorNameLastFirst,
					foreignAuthorId: author.foreignAuthorId,
					titleSlug: author.titleSlug,
					qualityProfileId: author.qualityProfileId,
					metadataProfileId: author.metadataProfileId,
					monitored: author.monitored,
					monitorNewItems: author.monitorNewItems,
					status: author.status,
					ended: author.ended,
					path: author.path,
					cleanName: author.cleanName,
					sortName: author.sortName,
					sortNameLastFirst: author.sortNameLastFirst,
					tags: author.tags,
					added: author.added,
					ratings: author.ratings,
					links: [],
					images: [],
					genres: [],
				};

				// If no editions data, try to fetch from rreading-glasses
				if (!searchBook.editions || searchBook.editions.length === 0) {
					if (this.rreadingGlasses) {
						console.log(`[Readarr] No editions in search result, fetching from rreading-glasses...`);
						const editions = await this.fetchEditionsFromRReadingGlasses(parseInt(foreignBookId, 10), searchBook);
						if (editions.length > 0) {
							searchBook.editions = editions;
							console.log(`[Readarr] Added ${editions.length} editions from rreading-glasses`);
						}
					}
				}

				// Attempt to add if we have editions data
				if (searchBook.editions && searchBook.editions.length > 0) {
					try {
						book = await this.addBook(searchBook);
						console.log(`[Readarr] Book added with id: ${book.id}`);
					} catch (addError) {
						const errMsg = addError instanceof Error ? addError.message : String(addError);
						console.error(`[Readarr] Failed to add book via API: ${errMsg}`);

						// Check if it's a conflict error (book already exists)
						if (errMsg.includes('409') || errMsg.includes('Conflict') || errMsg.includes('UNIQUE constraint')) {
							// Book might already exist, try to find it
							const refreshedBooks = await this.getBooksByAuthor(author.id!);
							book = refreshedBooks.find((b) => b.foreignBookId === foreignBookId);
							if (book) {
								console.log(`[Readarr] Book already exists: ${book.id}`);
							} else {
								throw new Error(
									`Book "${title || foreignBookId}" appears to exist (conflict error) but couldn't be found. ` +
										`Error: ${errMsg.substring(0, 200)}`,
								);
							}
						} else {
							// Provide helpful info from editions for manual addition
							const edition = searchBook.editions[0];
							const identifiers: string[] = [];
							if (edition.asin) identifiers.push(`ASIN: ${edition.asin}`);
							if (edition.isbn13) identifiers.push(`ISBN: ${edition.isbn13}`);
							const idInfo = identifiers.length > 0 ? ` (${identifiers.join(', ')})` : '';

							// Include the actual error for debugging
							const shortErr = errMsg.length > 200 ? errMsg.substring(0, 200) + '...' : errMsg;
							throw new Error(
								`Book "${title || foreignBookId}"${idInfo} found but could not be added via API. ` +
									`Error: ${shortErr}`,
							);
						}
					}
				} else {
					// No editions data even after trying rreading-glasses
					const rrgNote = this.rreadingGlasses
						? ''
						: ' Configure RREADING_GLASSES_URL to enable automatic edition fetching.';
					console.error(`[Readarr] Book found but has no editions data.${rrgNote}`);
					throw new Error(
						`Book "${title || foreignBookId}" found in search but cannot be added automatically. ` +
							`No edition data available.${rrgNote} ` +
							`Please add the book manually in Readarr's UI.`,
					);
				}
			} else {
				console.error(`[Readarr] Book with foreignBookId ${foreignBookId} not found in search results`);
				const searchMethod = isbn ? `ISBN ${isbn}` : title ? `title "${title}"` : 'no search criteria';
				throw new Error(
					`Book "${title || foreignBookId}" not found in author "${authorName}"'s library or search (searched by ${searchMethod})`,
				);
			}
		}

		// Monitor the book if not already
		if (!book.monitored) {
			// Book exists in library but isn't monitored
			console.log(`[Readarr] Monitoring book: "${book.title}" (id: ${book.id})`);
			book.monitored = true;
			book = await this.updateBook(book);
		}

		// Trigger search
		console.log(`[Readarr] Triggering search for book: "${book.title}" (id: ${book.id})`);
		const command = await this.searchBook([book.id!]);

		return { author, book, commandId: command.id };
	}

	/**
	 * Fetch edition data from rreading-glasses and map to Readarr format.
	 * Prioritizes editions with ASINs (for audiobook searching) and limits to 5 editions max.
	 */
	private async fetchEditionsFromRReadingGlasses(workId: number, searchBook: ReadarrBook): Promise<ReadarrEdition[]> {
		if (!this.rreadingGlasses) return [];

		try {
			const work = await this.rreadingGlasses.getWorkById(workId);
			if (!work || !work.Books || work.Books.length === 0) {
				console.log(`[Readarr] No editions found in rreading-glasses for work ${workId}`);
				return [];
			}

			const targetEditionId = searchBook.foreignEditionId;
			console.log(`[Readarr] Found ${work.Books.length} editions in rreading-glasses for work ${workId}`);

			// Sort editions: prioritize those with ASIN, then those with ISBN, then target edition
			const sortedBooks = [...work.Books].sort((a, b) => {
				// Target edition first
				if (targetEditionId) {
					if (String(a.ForeignId) === targetEditionId) return -1;
					if (String(b.ForeignId) === targetEditionId) return 1;
				}
				// Then by ASIN presence
				if (a.Asin && !b.Asin) return -1;
				if (!a.Asin && b.Asin) return 1;
				// Then by ISBN presence
				if (a.Isbn13 && !b.Isbn13) return -1;
				if (!a.Isbn13 && b.Isbn13) return 1;
				return 0;
			});

			// Limit to 5 editions to avoid overwhelming Readarr
			const limitedBooks = sortedBooks.slice(0, 5);

			const mapEdition = (rrgBook: RRGBook, isTarget: boolean): ReadarrEdition => ({
				bookId: 0, // Will be set by Readarr
				foreignEditionId: String(rrgBook.ForeignId),
				titleSlug: String(rrgBook.ForeignId),
				title: rrgBook.Title,
				// Use undefined instead of empty string for optional fields
				isbn13: rrgBook.Isbn13 || undefined,
				asin: rrgBook.Asin || undefined,
				overview: rrgBook.Description || undefined,
				format: rrgBook.Format || undefined,
				isEbook: rrgBook.IsEbook,
				publisher: rrgBook.Publisher || undefined,
				pageCount: rrgBook.NumPages || 0,
				releaseDate: rrgBook.ReleaseDate || undefined,
				images: rrgBook.ImageUrl
					? [
							{
								url: rrgBook.ImageUrl,
								coverType: 'cover',
								extension: '.jpg',
								remoteUrl: rrgBook.ImageUrl,
							},
						]
					: searchBook.images || [],
				links: searchBook.links || [],
				ratings: {
					votes: rrgBook.RatingCount ?? 0,
					value: rrgBook.AverageRating ?? 0,
					popularity: 0,
				},
				// Only the target edition should be monitored
				monitored: isTarget,
				manualAdd: true,
			});

			// Map editions, marking the target (or first) as monitored
			const editions = limitedBooks.map((book, index) => {
				const isTarget = targetEditionId ? String(book.ForeignId) === targetEditionId : index === 0;
				return mapEdition(book, isTarget);
			});

			// Log which editions we're using
			editions.forEach((e, i) => {
				console.log(
					`[Readarr]   Edition ${i + 1}: ${e.foreignEditionId} (ASIN: ${e.asin || 'none'}, ISBN: ${e.isbn13 || 'none'}, monitored: ${e.monitored})`,
				);
			});

			// Ensure at least one edition is monitored
			if (!editions.some((e) => e.monitored) && editions.length > 0) {
				editions[0].monitored = true;
			}

			return editions;
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error);
			console.error(`[Readarr] Failed to fetch editions from rreading-glasses: ${errMsg}`);
			return [];
		}
	}

	private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
		const url = new URL(`${this.baseUrl}${path}`);
		if (params) {
			Object.entries(params).forEach(([key, value]) => {
				url.searchParams.append(key, value);
			});
		}

		const response = await this.fetch(url.toString(), { method: 'GET' });
		return response.json() as Promise<T>;
	}

	private async post<T>(path: string, body: unknown): Promise<T> {
		const response = await this.fetch(`${this.baseUrl}${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		return response.json() as Promise<T>;
	}

	private async put<T>(path: string, body: unknown): Promise<T> {
		const response = await this.fetch(`${this.baseUrl}${path}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		return response.json() as Promise<T>;
	}

	private async delete(path: string): Promise<void> {
		await this.fetch(`${this.baseUrl}${path}`, { method: 'DELETE' });
	}

	private async fetch(
		url: string,
		options: { method: string; headers?: Record<string, string>; body?: string },
	): Promise<Response> {
		const controller = new globalThis.AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal,
				headers: {
					...options.headers,
					'X-Api-Key': this.apiKey,
					Accept: 'application/json',
				},
			});

			if (!response.ok) {
				const text = await response.text();
				console.error(`[Readarr] API error: ${options.method} ${url} - ${response.status} ${response.statusText}`);
				console.error(`[Readarr] Response body:`, text);
				throw new Error(`Readarr API error: ${response.status} ${response.statusText} - ${text}`);
			}

			return response;
		} finally {
			clearTimeout(timeoutId);
		}
	}
}
