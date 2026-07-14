/**
 * Book metadata types - shared across all metadata providers
 */

export interface AuthorMetadata {
	id: string;
	name: string;
	description?: string;
}

export interface BookMetadata {
	/** Provider-specific ID (e.g., workId for rreading-glasses) */
	id: string;
	title: string;
	authors: AuthorMetadata[];
	description?: string;
	/** ISBN-13 preferred, ISBN-10 acceptable */
	isbn?: string;
	/** Cover image URL */
	coverUrl?: string;
	/** Publication year */
	year?: number;
	/** Genre/category tags */
	genres?: string[];
	/** Average rating (0-5 scale) */
	rating?: number;
	/** Number of ratings */
	ratingsCount?: number;
	/** Series information if part of a series */
	series?: {
		id: string;
		name: string;
		position?: number;
	};
	/** Provider name for attribution */
	provider: string;
	/** Raw provider-specific data for debugging/extension */
	raw?: unknown;
}

export interface SearchResult {
	id: string;
	title: string;
	authors: string[];
	/** Cover thumbnail URL */
	coverUrl?: string;
	year?: number;
	/** Provider name */
	provider: string;
}

export interface SearchOptions {
	/** Maximum number of results to return */
	limit?: number;
}
