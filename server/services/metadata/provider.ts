import type { BookMetadata, SearchResult, SearchOptions } from './types';

/**
 * Interface for book metadata providers.
 *
 * Implementations fetch book information from external sources
 * (rreading-glasses, Open Library, Google Books, etc.)
 */
export interface BookMetadataProvider {
	/** Provider identifier (e.g., 'rreading-glasses', 'openlibrary') */
	readonly name: string;

	/**
	 * Search for books by title, author, or general query.
	 * @param query - Search string
	 * @param options - Optional search parameters
	 * @returns Array of search results (lightweight, for listing)
	 */
	search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

	/**
	 * Look up a book by ISBN (ISBN-10 or ISBN-13).
	 * @param isbn - ISBN string (hyphens are stripped automatically)
	 * @returns Full book metadata or null if not found
	 */
	getByIsbn(isbn: string): Promise<BookMetadata | null>;

	/**
	 * Get full book metadata by provider-specific ID.
	 * @param id - Provider-specific identifier
	 * @returns Full book metadata or null if not found
	 */
	getById(id: string): Promise<BookMetadata | null>;
}
