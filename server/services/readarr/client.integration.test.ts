/**
 * Integration tests for ReadarrClient
 *
 * These tests connect to real Readarr instances to verify API behavior.
 * Run with: yarn test:server --run client.integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ReadarrClient } from './client';
import { loadReadarrConfig } from '../../config/readarr';
import type { ReadarrBook } from './types';

describe('ReadarrClient Integration', () => {
	let client: ReadarrClient;
	let baseUrl: string;
	let apiKey: string;

	beforeAll(() => {
		const config = loadReadarrConfig();
		const instance = config.instances.find((i) => i.enabled);

		if (!instance) {
			throw new Error('No enabled Readarr instance found for integration tests');
		}

		baseUrl = instance.url.replace(/\/$/, '');
		apiKey = instance.apiKey;
		client = new ReadarrClient({
			url: instance.url,
			apiKey: instance.apiKey,
		});
	});

	it('should connect to Readarr and get system status', async () => {
		const status = await client.testConnection();

		expect(status.appName).toBe('Readarr');
		expect(status.version).toBeDefined();
	});

	it('should fetch books from library', async () => {
		const books = await client.getBooks();

		expect(Array.isArray(books)).toBe(true);
	});

	it('should fetch editions for a book (required for ISBN data)', async () => {
		const books = await client.getBooks();
		if (books.length === 0) {
			console.log('Skipping - no books in library');
			return;
		}

		const bookId = books[0].id!;
		const editions = await client.getEditions(bookId);

		expect(Array.isArray(editions)).toBe(true);
		// Verify edition structure if any exist
		if (editions.length > 0) {
			expect(editions[0]).toHaveProperty('bookId');
			expect(editions[0]).toHaveProperty('title');
		}
	});

	it('should verify getBooks does NOT include editions (known API limitation)', async () => {
		const books = await client.getBooks();
		if (books.length === 0) return;

		// This is a documentation/verification test - the API doesn't include editions
		const booksWithEditions = books.filter((b) => b.editions && b.editions.length > 0);
		expect(booksWithEditions.length).toBe(0);
	});
});
