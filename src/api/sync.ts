import { post, del } from './client';

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

export interface LibrarySyncResponse {
	summary: {
		totalInstances: number;
		totalBooksFound: number;
		totalBooksImported: number;
		totalBooksSkipped: number;
		totalBooksCreated: number;
		totalBooksUpdated: number;
		totalRequestsCreated: number;
		totalRequestsUpdated: number;
		totalErrors: number;
	};
	results: LibrarySyncResult[];
}

export interface PurgeResponse {
	deletedBooks: number;
	deletedRequests: number;
}

/**
 * Trigger a full library sync from all Readarr instances
 */
export async function syncLibrary(): Promise<LibrarySyncResponse> {
	return post<LibrarySyncResponse>('/api/sync/library');
}

/**
 * Purge all books and requests from the database
 */
export async function purgeLibrary(): Promise<PurgeResponse> {
	return del<PurgeResponse>('/api/sync/purge');
}
