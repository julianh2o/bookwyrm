import type { BookMetadataProvider } from './provider';
import type { BookMetadata, SearchResult, SearchOptions, AuthorMetadata } from './types';

const PROVIDER_NAME = 'rreading-glasses';

/**
 * Raw API response types from rreading-glasses
 * Note: API uses PascalCase for field names
 */
interface RRGSearchItem {
	bookId: number;
	workId: number;
	author: {
		id: number;
	};
}

interface RRGContributor {
	ForeignId: number;
	Role: string;
}

export interface RRGBook {
	ForeignId: number;
	Asin?: string;
	Description?: string;
	Title: string;
	FullTitle?: string;
	ShortTitle?: string;
	Language?: string;
	Format?: string;
	EditionInformation?: string;
	Publisher?: string;
	ImageUrl?: string;
	IsEbook?: boolean;
	NumPages?: number;
	RatingCount?: number;
	AverageRating?: number;
	Url?: string;
	ReleaseDate?: string;
	Contributors?: RRGContributor[];
	Isbn13?: string;
	Isbn?: string;
}

interface RRGSeries {
	ForeignId: number;
	Title: string;
	Description?: string;
	WorkCount?: number;
	PrimaryWorkCount?: number;
}

interface RRGSeriesLink {
	Series: RRGSeries;
	PositionInSeries?: string;
	IsPrimary?: boolean;
}

export interface RRGWork {
	ForeignId: number;
	Title: string;
	FullTitle?: string;
	ShortTitle?: string;
	Url?: string;
	ReleaseDate?: string;
	Genres?: string[];
	Books?: RRGBook[];
	Series?: RRGSeriesLink[];
	Authors?: RRGAuthor[];
}

interface RRGAuthor {
	ForeignId: number;
	Name: string;
	Description?: string;
	ImageUrl?: string;
	RatingCount?: number;
	AverageRating?: number;
	Works?: RRGWork[];
}

export interface RReadingGlassesConfig {
	baseUrl: string;
	/** Request timeout in milliseconds */
	timeout?: number;
}

export class RReadingGlassesProvider implements BookMetadataProvider {
	readonly name = PROVIDER_NAME;
	private readonly baseUrl: string;
	private readonly timeout: number;

	constructor(config: RReadingGlassesConfig) {
		this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Strip trailing slash
		this.timeout = config.timeout ?? 10000;
	}

	async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
		const limit = options?.limit ?? 20;
		const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}`;

		const response = await this.fetch(url);
		if (!response.ok) {
			throw new Error(`Search failed: ${response.status} ${response.statusText}`);
		}

		const searchItems = (await response.json()) as RRGSearchItem[];
		if (searchItems.length === 0) {
			return [];
		}

		// Search only returns IDs - fetch work details for first few results only
		// This is a tradeoff between speed and completeness
		const limitedItems = searchItems.slice(0, Math.min(limit, 5));

		// Fetch work and author details in parallel (limited batch)
		const results = await Promise.all(
			limitedItems.map(async (item): Promise<SearchResult | null> => {
				try {
					// Fetch work and author in parallel
					const [work, author] = await Promise.all([
						this.fetchWork(item.workId),
						item.author?.id ? this.fetchAuthor(item.author.id) : null,
					]);
					if (!work) return null;

					// Get primary book for cover image
					const primaryBook = work.Books?.[0];

					return {
						id: String(work.ForeignId),
						title: work.Title,
						authors: author ? [author.Name] : [],
						coverUrl: primaryBook?.ImageUrl,
						year: work.ReleaseDate ? parseInt(work.ReleaseDate.split('-')[0], 10) : undefined,
						provider: PROVIDER_NAME,
					};
				} catch {
					return null;
				}
			}),
		);

		return results.filter((r): r is SearchResult => r !== null);
	}

	async getByIsbn(isbn: string): Promise<BookMetadata | null> {
		// Normalize ISBN (remove hyphens/spaces)
		const normalizedIsbn = isbn.replace(/[-\s]/g, '');
		const url = `${this.baseUrl}/book/isbn/${encodeURIComponent(normalizedIsbn)}`;

		const response = await this.fetch(url);
		if (response.status === 404) {
			return null;
		}
		if (!response.ok) {
			// API returns 400 for invalid ISBNs
			if (response.status === 400) {
				return null;
			}
			throw new Error(`ISBN lookup failed: ${response.status} ${response.statusText}`);
		}

		// API returns edition ID, need to fetch via book endpoint
		const editionId = (await response.json()) as number;
		return this.getEditionById(editionId);
	}

	async getById(id: string): Promise<BookMetadata | null> {
		const work = await this.fetchWork(parseInt(id, 10));
		if (!work) return null;
		return this.mapWorkToMetadata(work);
	}

	/**
	 * Get raw work data including all editions
	 * Useful for getting edition details needed by Readarr
	 */
	async getWorkById(workId: number): Promise<RRGWork | null> {
		return this.fetchWork(workId);
	}

	/**
	 * Get edition details by book ID and map to BookMetadata
	 */
	private async getEditionById(editionId: number): Promise<BookMetadata | null> {
		const url = `${this.baseUrl}/book/${editionId}`;

		const response = await this.fetch(url);
		if (response.status === 404) {
			return null;
		}
		if (!response.ok) {
			throw new Error(`Edition lookup failed: ${response.status} ${response.statusText}`);
		}

		const work = (await response.json()) as RRGWork;
		return this.mapWorkToMetadata(work, editionId);
	}

	private async fetchWork(workId: number): Promise<RRGWork | null> {
		const url = `${this.baseUrl}/work/${workId}`;
		const response = await this.fetch(url);
		if (response.status === 404) return null;
		if (!response.ok) throw new Error(`Work fetch failed: ${response.status}`);
		return (await response.json()) as RRGWork;
	}

	private async fetchAuthor(authorId: number): Promise<RRGAuthor | null> {
		// Use editionId param for lighter payload
		const url = `${this.baseUrl}/author/${authorId}?editionId=0`;
		const response = await this.fetch(url);
		if (response.status === 404) return null;
		if (!response.ok) throw new Error(`Author fetch failed: ${response.status}`);
		return (await response.json()) as RRGAuthor;
	}

	private async mapWorkToMetadata(work: RRGWork, preferredEditionId?: number): Promise<BookMetadata> {
		// Find ISBN from editions if available
		let isbn: string | undefined;
		let coverUrl: string | undefined;
		let rating: number | undefined;
		let ratingsCount: number | undefined;

		if (work.Books && work.Books.length > 0) {
			// Prefer the specified edition, otherwise use first
			const edition = preferredEditionId
				? work.Books.find((b) => b.ForeignId === preferredEditionId) || work.Books[0]
				: work.Books[0];

			isbn = edition.Isbn13 || edition.Isbn;
			coverUrl = edition.ImageUrl;
			rating = edition.AverageRating;
			ratingsCount = edition.RatingCount;
		}

		// Fetch author details for full metadata
		const authors: AuthorMetadata[] = [];
		const contributorIds = new Set<number>();

		for (const book of work.Books || []) {
			for (const contributor of book.Contributors || []) {
				if (contributor.Role === 'Author' && !contributorIds.has(contributor.ForeignId)) {
					contributorIds.add(contributor.ForeignId);
					try {
						const author = await this.fetchAuthor(contributor.ForeignId);
						if (author) {
							authors.push({
								id: String(author.ForeignId),
								name: author.Name,
								description: author.Description,
							});
						}
					} catch {
						// Skip author on error
					}
				}
			}
		}

		// Get first series if available
		const seriesLink = work.Series?.[0];

		return {
			id: String(work.ForeignId),
			title: work.Title,
			authors,
			description: work.Books?.[0]?.Description,
			isbn,
			coverUrl,
			year: work.ReleaseDate ? parseInt(work.ReleaseDate.split('-')[0], 10) : undefined,
			genres: work.Genres,
			rating,
			ratingsCount,
			series: seriesLink
				? {
						id: String(seriesLink.Series.ForeignId),
						name: seriesLink.Series.Title,
						position: seriesLink.PositionInSeries ? parseFloat(seriesLink.PositionInSeries) : undefined,
					}
				: undefined,
			provider: PROVIDER_NAME,
			raw: work,
		};
	}

	private async fetch(url: string): Promise<Response> {
		const controller = new globalThis.AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			return await fetch(url, {
				signal: controller.signal,
				headers: {
					Accept: 'application/json',
				},
			});
		} finally {
			clearTimeout(timeoutId);
		}
	}
}

/**
 * Create a provider instance from environment variables
 */
export function createRReadingGlassesProvider(): RReadingGlassesProvider {
	const baseUrl = process.env.RREADING_GLASSES_URL;
	if (!baseUrl) {
		throw new Error('RREADING_GLASSES_URL environment variable is required');
	}

	return new RReadingGlassesProvider({
		baseUrl,
		timeout: process.env.RREADING_GLASSES_TIMEOUT ? parseInt(process.env.RREADING_GLASSES_TIMEOUT, 10) : undefined,
	});
}
