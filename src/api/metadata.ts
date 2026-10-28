import { get } from './client';

/**
 * Search result from metadata provider
 */
export interface MetadataSearchResult {
	id: string;
	title: string;
	authors: string[];
	coverUrl?: string;
	year?: number;
	provider: string;
}

/**
 * Full book metadata
 */
export interface BookMetadata {
	id: string;
	title: string;
	authors: Array<{ id: string; name: string; description?: string }>;
	description?: string;
	isbn?: string;
	coverUrl?: string;
	year?: number;
	genres?: string[];
	rating?: number;
	ratingsCount?: number;
	series?: {
		id: string;
		name: string;
		position?: number;
	};
	provider: string;
	/** Fiction/nonfiction guess from the genres (null when there's nothing to go on) */
	suggestedCategory?: { category: 'fiction' | 'nonfiction'; confident: boolean; reason: string } | null;
}

interface SearchResponse {
	results: MetadataSearchResult[];
	error?: string;
}

/**
 * Search for books by title/author
 */
export async function searchBooks(query: string, limit: number = 10): Promise<MetadataSearchResult[]> {
	if (!query || query.trim().length < 2) {
		return [];
	}

	const response = await get<SearchResponse>(`/api/metadata/search?q=${encodeURIComponent(query)}&limit=${limit}`);
	return response.results;
}

/**
 * Get full book details by ID
 */
export async function getBookMetadata(id: string): Promise<BookMetadata> {
	return get<BookMetadata>(`/api/metadata/book/${encodeURIComponent(id)}`);
}
