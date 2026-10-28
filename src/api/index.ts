export { ApiError } from './client';

export {
	getBooks,
	getBook,
	createBook,
	updateBook,
	deleteBook,
	processRequests,
	syncStatus,
	retryRequest,
	getRequestEvents,
	addToInstance,
	createBookWithInstances,
	getDefaultInstancesForCategory,
	type ProcessResult,
	type SyncResult,
	type ProcessRequestsResponse,
	type SyncStatusResponse,
	type RetryRequestResponse,
	type AddToInstanceResponse,
} from './books';

export { getInstances, testConnection, filterInstancesByCategory, filterInstancesByType } from './readarr';

export { searchBooks, getBookMetadata, type MetadataSearchResult, type BookMetadata } from './metadata';

export {
	syncLibrary,
	purgeLibrary,
	getSyncStatus,
	type InstanceHealth,
	type SyncStatusSummary,
	type LibrarySyncResponse,
	type LibrarySyncResult,
	type PurgeResponse,
} from './sync';
