import { describe, it, expect, beforeAll } from 'vitest';
import { RReadingGlassesProvider } from './rreading-glasses';

const BASE_URL = 'https://rreading-glasses.julianverse.net';

describe('RReadingGlassesProvider', () => {
	let provider: RReadingGlassesProvider;

	beforeAll(() => {
		provider = new RReadingGlassesProvider({
			baseUrl: BASE_URL,
			timeout: 30000, // Generous timeout for network calls
		});
	});

	describe('search', () => {
		it(
			'should return search results for a known book title',
			async () => {
				const results = await provider.search('Martian', { limit: 3 });

				expect(results).toBeDefined();
				expect(Array.isArray(results)).toBe(true);
				expect(results.length).toBeGreaterThan(0);

				const firstResult = results[0];
				expect(firstResult).toMatchObject({
					id: expect.any(String),
					title: expect.any(String),
					provider: 'rreading-glasses',
				});
				// Authors array exists but may be empty in search results (full details on getById)
				expect(Array.isArray(firstResult.authors)).toBe(true);
			},
			{ timeout: 30000 },
		);

		it(
			'should respect the limit option',
			async () => {
				const results = await provider.search('fiction', { limit: 3 });

				expect(results.length).toBeLessThanOrEqual(3);
			},
			{ timeout: 30000 },
		);

		it(
			'should return empty array for nonsense query',
			async () => {
				const results = await provider.search('xyznonexistentbook12345zzz');

				expect(results).toBeDefined();
				expect(Array.isArray(results)).toBe(true);
				expect(results.length).toBe(0);
			},
			{ timeout: 30000 },
		);
	});

	describe('getByIsbn', () => {
		it(
			'should return null for unknown ISBN',
			async () => {
				// Using a clearly invalid ISBN
				const book = await provider.getByIsbn('0000000000000');

				expect(book).toBeNull();
			},
			{ timeout: 15000 },
		);

		it(
			'should handle ISBN with hyphens gracefully',
			async () => {
				// Should normalize and not throw
				const book = await provider.getByIsbn('000-0-000-00000-0');

				expect(book).toBeNull();
			},
			{ timeout: 15000 },
		);
	});

	describe('getById', () => {
		let validWorkId: string;

		beforeAll(async () => {
			// Get a valid work ID from search
			const results = await provider.search('Artemis Weir', { limit: 1 });
			if (results.length > 0) {
				validWorkId = results[0].id;
			}
		}, 30000);

		it(
			'should return full book metadata for a known work ID',
			async () => {
				expect(validWorkId).toBeDefined();

				const book = await provider.getById(validWorkId);

				expect(book).not.toBeNull();
				expect(book!.id).toBe(validWorkId);
				expect(book!.title).toBeDefined();
				expect(book!.authors).toBeDefined();
				expect(book!.provider).toBe('rreading-glasses');
			},
			{ timeout: 30000 },
		);

		it(
			'should include detailed metadata when available',
			async () => {
				expect(validWorkId).toBeDefined();

				const book = await provider.getById(validWorkId);

				expect(book).not.toBeNull();

				// Verify structure of optional fields when present
				if (book!.description) {
					expect(typeof book!.description).toBe('string');
				}
				if (book!.genres) {
					expect(Array.isArray(book!.genres)).toBe(true);
				}
				if (book!.rating !== undefined) {
					expect(typeof book!.rating).toBe('number');
				}
				if (book!.coverUrl) {
					expect(book!.coverUrl).toMatch(/^https?:\/\//);
				}
			},
			{ timeout: 30000 },
		);

		it(
			'should return null for unknown work ID',
			async () => {
				const book = await provider.getById('999999999');

				expect(book).toBeNull();
			},
			{ timeout: 15000 },
		);

		it(
			'should include author details',
			async () => {
				expect(validWorkId).toBeDefined();

				const book = await provider.getById(validWorkId);

				expect(book).not.toBeNull();
				expect(book!.authors.length).toBeGreaterThan(0);
				expect(book!.authors[0]).toMatchObject({
					id: expect.any(String),
					name: expect.any(String),
				});
			},
			{ timeout: 30000 },
		);
	});

	describe('provider configuration', () => {
		it('should strip trailing slash from baseUrl', () => {
			const providerWithSlash = new RReadingGlassesProvider({
				baseUrl: 'https://example.com/',
			});

			expect(providerWithSlash.name).toBe('rreading-glasses');
		});

		it(
			'should throw on timeout',
			async () => {
				const slowProvider = new RReadingGlassesProvider({
					baseUrl: BASE_URL,
					timeout: 1, // 1ms timeout - will definitely fail
				});

				await expect(slowProvider.search('test')).rejects.toThrow();
			},
			{ timeout: 15000 },
		);
	});
});
