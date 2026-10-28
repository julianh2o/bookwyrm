/**
 * Shared Book types for client and server
 * These types mirror the Zod schemas in server/validation/book.ts
 */

export type BookCategory = 'fiction' | 'nonfiction';

export type BookRequestStatus =
	| 'pending'
	| 'adding'
	| 'searching'
	| 'wanted'
	| 'downloading'
	| 'importing'
	| 'available'
	| 'error'
	// legacy, from before the phase model
	| 'found'
	| 'not_found';

/** Where a request is in its life: add → search → download → import → available */
export type BookRequestPhase = 'add' | 'search' | 'download' | 'import' | 'available';

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
	/** Readarr instances to request; defaults to audio + ebook for the category */
	instanceIds?: string[];
	/** Send to Readarr right away (default true) */
	autoRequest?: boolean;
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
	phase: BookRequestPhase;
	progress: number | null;
	attempts: number;
	lastSearchAt: string | null;
	lastErrorAt: string | null;
}

export interface RequestEvent {
	id: string;
	requestId: string;
	phase: BookRequestPhase;
	level: 'info' | 'warn' | 'error';
	message: string;
	createdAt: string;
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
	sort?: 'recent' | 'title' | 'author' | 'activity';
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
