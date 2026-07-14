/**
 * Shared Book types for client and server
 * These types mirror the Zod schemas in server/validation/book.ts
 */

export type BookCategory = 'fiction' | 'nonfiction';

export type BookRequestStatus = 'pending' | 'searching' | 'found' | 'downloading' | 'available' | 'not_found' | 'error';

/**
 * Input for creating a new book
 */
export interface CreateBookInput {
	title: string;
	author: string;
	isbn?: string | null;
	category: BookCategory;
	coverUrl?: string | null;
	notes?: string | null;
	metadataId?: string | null;
	metadataProvider?: string | null;
}

/**
 * Input for updating a book
 */
export interface UpdateBookInput {
	title?: string;
	author?: string;
	isbn?: string | null;
	category?: BookCategory;
	coverUrl?: string | null;
	notes?: string | null;
	metadataId?: string | null;
	metadataProvider?: string | null;
}

/**
 * Book response from API
 */
export interface BookResponse {
	id: string;
	title: string;
	author: string;
	isbn: string | null;
	category: BookCategory;
	coverUrl: string | null;
	notes: string | null;
	metadataId: string | null;
	metadataProvider: string | null;
	createdAt: string;
	updatedAt: string;
}

/**
 * Book request (to Readarr) response from API
 */
export interface BookRequestResponse {
	id: string;
	bookId: string;
	instanceId: string;
	status: BookRequestStatus;
	externalId: string | null;
	externalSlug: string | null;
	errorMessage: string | null;
	createdAt: string;
	updatedAt: string;
	lastChecked: string | null;
}

/**
 * Book with its Readarr requests
 */
export interface BookWithRequests extends BookResponse {
	requests: BookRequestResponse[];
}

/**
 * Query parameters for listing books
 */
export interface ListBooksQuery {
	category?: BookCategory;
	status?: BookRequestStatus;
	search?: string;
	limit?: number;
	offset?: number;
}

/**
 * Paginated list response
 */
export interface BookListResponse {
	books: BookWithRequests[];
	total: number;
	limit: number;
	offset: number;
}
