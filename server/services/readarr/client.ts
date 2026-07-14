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

export interface ReadarrClientConfig {
	url: string;
	apiKey: string;
	timeout?: number;
}

export class ReadarrClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly timeout: number;

	constructor(config: ReadarrClientConfig) {
		this.baseUrl = config.url.replace(/\/$/, '');
		this.apiKey = config.apiKey;
		this.timeout = config.timeout ?? 30000;
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
	): Promise<{ author: ReadarrAuthor; book: ReadarrBook; commandId: number }> {
		// Check if author exists in library
		let author: ReadarrAuthor | undefined;
		const authors = await this.getAuthors();
		author = authors.find((a) => a.foreignAuthorId === foreignAuthorId);

		// If not, add the author
		if (!author) {
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
					monitored: false,
					searchForMissingBooks: false,
				},
			} as Partial<ReadarrAuthor> & { foreignAuthorId: string });
		}

		// Get books for this author
		const books = await this.getBooksByAuthor(author.id!);
		let book = books.find((b) => b.foreignBookId === foreignBookId);

		if (!book) {
			// Book not in library yet - search for it by ISBN
			if (!isbn) {
				throw new Error(`Book with foreignId ${foreignBookId} not found and no ISBN provided`);
			}
			const searchResults = await this.searchBooks(`isbn:${isbn}`);
			book = searchResults.find((b) => b.foreignBookId === foreignBookId);

			if (!book) {
				throw new Error(`Book with ISBN ${isbn} not found in Readarr`);
			}
		}

		// Monitor the book if not already
		if (!book.monitored) {
			book.monitored = true;
			book = await this.updateBook(book);
		}

		// Trigger search
		const command = await this.searchBook([book.id!]);

		return { author, book, commandId: command.id };
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
				throw new Error(`Readarr API error: ${response.status} ${response.statusText} - ${text}`);
			}

			return response;
		} finally {
			clearTimeout(timeoutId);
		}
	}
}
