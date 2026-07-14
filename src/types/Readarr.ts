/**
 * Readarr instance types for the frontend
 */

export type ReadarrType = 'audio' | 'ebook';
export type BookCategory = 'fiction' | 'nonfiction';

/**
 * Readarr instance configuration (API response, apiKey hidden)
 */
export interface ReadarrInstance {
	id: string;
	name: string;
	url: string;
	type: ReadarrType;
	category: BookCategory;
	enabled: boolean;
}

/**
 * Response from GET /api/settings/readarr
 */
export interface ReadarrInstancesResponse {
	instances: ReadarrInstance[];
}

/**
 * Response from POST /api/settings/readarr/:id/test
 */
export interface TestConnectionResponse {
	success: boolean;
	version?: string;
	appName?: string;
	error?: string;
}
