import { get, post, patch, del } from './client';
import type {
	BookWithRequests,
	BookListResponse,
	CreateBookInput,
	UpdateBookInput,
	ListBooksQuery,
	BookCategory,
	RequestEvent,
} from '../types';

/**
 * Result from processing book requests
 */
export interface ProcessResult {
	success: boolean;
	status: 'searching' | 'error';
	externalId?: string;
	errorMessage?: string;
}

/**
 * Result from syncing status
 */
export interface SyncResult {
	requestId: string;
	instanceId: string;
	previousStatus: string;
	newStatus: string;
	changed: boolean;
	error?: string;
}

/**
 * Response from processing requests
 */
export interface ProcessRequestsResponse {
	book: BookWithRequests;
	results: Record<string, ProcessResult>;
}

/**
 * Response from syncing status
 */
export interface SyncStatusResponse {
	book: BookWithRequests;
	results: SyncResult[];
}

/**
 * Response from retrying a request
 */
export interface RetryRequestResponse {
	book: BookWithRequests;
	/** What the retry did: add, search, redownload or import */
	action: string;
}

/**
 * Response from adding to an instance
 */
export interface AddToInstanceResponse {
	book: BookWithRequests;
	requestId: string;
}

/**
 * Build query string from params
 */
function buildQueryString(params: ListBooksQuery): string {
	const searchParams = new URLSearchParams();

	if (params.category) searchParams.set('category', params.category);
	if (params.status) searchParams.set('status', params.status);
	if (params.search) searchParams.set('search', params.search);
	if (params.sort) searchParams.set('sort', params.sort);
	if (params.limit !== undefined) searchParams.set('limit', params.limit.toString());
	if (params.offset !== undefined) searchParams.set('offset', params.offset.toString());

	const qs = searchParams.toString();
	return qs ? `?${qs}` : '';
}

/**
 * Get all books with optional filtering
 */
export async function getBooks(params: ListBooksQuery = {}): Promise<BookListResponse> {
	const qs = buildQueryString(params);
	return get<BookListResponse>(`/api/books${qs}`);
}

/**
 * Get a single book by ID
 */
export async function getBook(id: string): Promise<BookWithRequests> {
	return get<BookWithRequests>(`/api/books/${id}`);
}

/**
 * Create a new book
 */
export async function createBook(input: CreateBookInput): Promise<BookWithRequests & { existing?: boolean }> {
	return post<BookWithRequests & { existing?: boolean }>('/api/books', input);
}

/**
 * What happened to a request, newest first
 */
export async function getRequestEvents(requestId: string): Promise<RequestEvent[]> {
	const response = await get<{ events: RequestEvent[] }>(`/api/books/requests/${requestId}/events`);
	return response.events;
}

/**
 * Update a book
 */
export async function updateBook(id: string, input: UpdateBookInput): Promise<BookWithRequests> {
	return patch<BookWithRequests>(`/api/books/${id}`, input);
}

/**
 * Delete a book
 */
export async function deleteBook(id: string): Promise<void> {
	return del<void>(`/api/books/${id}`);
}

/**
 * Process pending Readarr requests for a book
 */
export async function processRequests(bookId: string): Promise<ProcessRequestsResponse> {
	return post<ProcessRequestsResponse>(`/api/books/${bookId}/request`);
}

/**
 * Sync status with Readarr for a book
 */
export async function syncStatus(bookId: string): Promise<SyncStatusResponse> {
	return post<SyncStatusResponse>(`/api/books/${bookId}/sync`);
}

/**
 * Retry a failed request
 */
export async function retryRequest(requestId: string): Promise<RetryRequestResponse> {
	return post<RetryRequestResponse>(`/api/books/requests/${requestId}/retry`);
}

/**
 * Add a book to a specific Readarr instance and begin search
 */
export async function addToInstance(bookId: string, instanceId: string): Promise<AddToInstanceResponse> {
	return post<AddToInstanceResponse>(`/api/books/${bookId}/instances/${instanceId}`);
}

/**
 * Create a book with specific instance selections
 * (Creates book then manages requests based on selected instances)
 */
export async function createBookWithInstances(
	input: CreateBookInput,
	_selectedInstances: string[],
): Promise<BookWithRequests> {
	// For now, just create the book - the server auto-creates requests
	// based on category. Instance selection will be handled via update
	return createBook(input);
}

/**
 * Get default instance IDs for a category
 */
export function getDefaultInstancesForCategory(category: BookCategory): string[] {
	if (category === 'fiction') {
		return ['fiction-audio', 'fiction-ebook'];
	} else {
		return ['nonfiction-audio', 'nonfiction-ebook'];
	}
}
