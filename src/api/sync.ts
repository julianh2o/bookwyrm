import { get, post, del } from './client';

export interface LibrarySyncResult {
	instanceId: string;
	booksCreated: number;
	requestsCreated: number;
	requestsLinked: number;
	requestsChanged: number;
	pendingQueued: number;
	error?: string;
}

export interface InstanceHealth {
	instanceId: string;
	instanceName: string;
	ok: boolean;
	lastPollAt: string | null;
	lastSuccessAt: string | null;
	durationMs: number | null;
	error: string | null;
	booksInLibrary: number;
	booksTracked: number;
	queueItems: number;
	foreignQueueItems: number;
}

export interface LibrarySyncResponse {
	summary: {
		totalInstances: number;
		totalBooksCreated: number;
		totalRequestsCreated: number;
		totalRequestsLinked: number;
		totalRequestsChanged: number;
		totalErrors: number;
	};
	results: LibrarySyncResult[];
	health: InstanceHealth[];
}

export interface SyncStatusSummary {
	instances: InstanceHealth[];
	counts: Array<{ instanceId: string; status: string; count: number }>;
}

/**
 * Background checker health per instance
 */
export async function getSyncStatus(): Promise<SyncStatusSummary> {
	return get<SyncStatusSummary>('/api/sync/status');
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
