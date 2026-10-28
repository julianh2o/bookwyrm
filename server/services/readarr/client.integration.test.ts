/**
 * Integration tests for ReadarrClient
 *
 * These tests connect to real Readarr instances to verify API behavior.
 * Skipped by default (they talk to the real instances in config/readarr.json).
 * Run with: READARR_INTEGRATION=1 yarn test:server --run client.integration
 *
 * To run the addAndSearchBook test:
 *   RUN_ADD_BOOK_TEST=1 yarn test:server --run client.integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ReadarrClient } from './client';
import fs from 'fs';
import path from 'path';
import type { ReadarrConfig } from '../../config/readarr';
import type { ReadarrBook, ReadarrAuthor } from './types';

// Test book configuration - change these to test with different books
const TEST_BOOK = {
	title: 'Verbal Judo, Updated Edition',
	author: 'George J. Thompson',
	// foreignBookId from Readarr/GoodReads - find via search results
	foreignBookId: '', // Will be populated from search
	// Optional: ISBN for more precise matching
	isbn: '',
};

describe.skipIf(!process.env.READARR_INTEGRATION)('ReadarrClient Integration', () => {
	let client: ReadarrClient;
	let baseUrl: string;
	let apiKey: string;

	beforeAll(() => {
		const config = JSON.parse(
			fs.readFileSync(path.join(process.cwd(), 'config', 'readarr.json'), 'utf-8'),
		) as ReadarrConfig;
		const instance = config.instances.find((i) => i.enabled);

		if (!instance) {
			throw new Error('No enabled Readarr instance found for integration tests');
		}

		baseUrl = instance.url.replace(/\/$/, '');
		apiKey = instance.apiKey;
		client = new ReadarrClient({
			url: instance.url,
			apiKey: instance.apiKey,
			rreadingGlassesUrl: process.env.RREADING_GLASSES_URL,
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

	/**
	 * Test that verifies edition fetching prioritizes ASINs
	 * Run with: RUN_TRACE_TEST=1 yarn test:server --run client.integration
	 */
	it.skipIf(!process.env.RUN_TRACE_TEST)(
		'should verify rreading-glasses returns editions with ASINs',
		async () => {
			const rrgUrl = process.env.RREADING_GLASSES_URL;
			if (!rrgUrl) {
				console.log('RREADING_GLASSES_URL not set');
				return;
			}

			// Test with Never Split the Difference (has 20+ editions, only 1 with ASIN)
			const workId = '429888';
			const response = await fetch(`${rrgUrl}/work/${workId}`);
			const work = await response.json();

			console.log(`Work: ${work.Title}`);
			console.log(`Total editions: ${work.Books?.length || 0}`);

			const editionsWithAsin = work.Books?.filter((b: any) => b.Asin) || [];
			console.log(`Editions with ASIN: ${editionsWithAsin.length}`);

			if (editionsWithAsin.length > 0) {
				console.log(
					'ASINs:',
					editionsWithAsin.map((b: any) => `${b.Asin} (${b.Format})`),
				);
			}

			expect(work.Books?.length).toBeGreaterThan(0);
		},
		30000,
	);

	/**
	 * Test searching by different ID types
	 * Run with: RUN_ADD_BOOK_TEST=1 yarn test:server --run client.integration
	 */
	it.skipIf(!process.env.RUN_ADD_BOOK_TEST)('should test search by hardcover ID', { timeout: 30000 }, async () => {
		// Test searching by hardcover:{id}
		const hardcoverId = '2450389'; // Verbal Judo
		console.log(`\nSearching by hardcover:${hardcoverId}`);
		const hardcoverResults = await client.searchBooks(`hardcover:${hardcoverId}`);
		console.log(`hardcover: search returned ${hardcoverResults.length} results`);
		if (hardcoverResults.length > 0) {
			console.log(
				`  First result: "${hardcoverResults[0].title}" (foreignBookId: ${hardcoverResults[0].foreignBookId})`,
			);
		}

		// Test searching by grid:{id} (GRID is the underlying ID system)
		console.log(`\nSearching by grid:${hardcoverId}`);
		const gridResults = await client.searchBooks(`grid:${hardcoverId}`);
		console.log(`grid: search returned ${gridResults.length} results`);
		if (gridResults.length > 0) {
			console.log(`  First result: "${gridResults[0].title}" (foreignBookId: ${gridResults[0].foreignBookId})`);
		}

		// Test searching by just the ID
		console.log(`\nSearching by raw ID: ${hardcoverId}`);
		const rawResults = await client.searchBooks(hardcoverId);
		console.log(`raw ID search returned ${rawResults.length} results`);
		if (rawResults.length > 0) {
			console.log(`  First result: "${rawResults[0].title}" (foreignBookId: ${rawResults[0].foreignBookId})`);
		}

		// Test searching by edition:{id}
		const editionId = '32729916'; // foreignEditionId from earlier test
		console.log(`\nSearching by edition:${editionId}`);
		const editionResults = await client.searchBooks(`edition:${editionId}`);
		console.log(`edition: search returned ${editionResults.length} results`);
		if (editionResults.length > 0) {
			const book = editionResults[0];
			console.log(`  First result: "${book.title}" (foreignBookId: ${book.foreignBookId})`);
			console.log(`  Has editions: ${book.editions?.length ?? 0}`);
			console.log(`  Full book:`, JSON.stringify(book, null, 2));
		}

		// Test searching by work:{id} (foreignBookId might be work ID)
		console.log(`\nSearching by work:${hardcoverId}`);
		const workResults = await client.searchBooks(`work:${hardcoverId}`);
		console.log(`work: search returned ${workResults.length} results`);
		if (workResults.length > 0) {
			console.log(`  First result: "${workResults[0].title}" (foreignBookId: ${workResults[0].foreignBookId})`);
		}

		// Test searching by book:{id}
		console.log(`\nSearching by book:${hardcoverId}`);
		const bookResults = await client.searchBooks(`book:${hardcoverId}`);
		console.log(`book: search returned ${bookResults.length} results`);
		if (bookResults.length > 0) {
			console.log(`  First result: "${bookResults[0].title}" (foreignBookId: ${bookResults[0].foreignBookId})`);
		}

		// Test searching by asin (common ID type)
		console.log(`\nSearching by asin:B01N4IM634`);
		const asinResults = await client.searchBooks(`asin:B01N4IM634`);
		console.log(`asin: search returned ${asinResults.length} results`);
		if (asinResults.length > 0) {
			console.log(`  First result: "${asinResults[0].title}"`);
		}

		// Check the author situation
		console.log(`\n=== Author Analysis ===`);
		const authors = await client.getAuthors();
		console.log(`Total authors in library: ${authors.length}`);

		// Find author by the authorId from book search
		if (editionResults.length > 0 && editionResults[0].authorId) {
			const bookAuthorId = editionResults[0].authorId;
			const authorById = authors.find((a) => a.id === bookAuthorId);
			console.log(
				`Author with id ${bookAuthorId}: ${authorById ? `"${authorById.authorName}" (foreignAuthorId: ${authorById.foreignAuthorId})` : 'NOT FOUND'}`,
			);

			if (authorById) {
				const authorBooks = await client.getBooksByAuthor(authorById.id!);
				console.log(`Books for this author: ${authorBooks.length}`);
				if (authorBooks.length > 0) {
					authorBooks.slice(0, 5).forEach((b) => {
						console.log(`  - "${b.title}" (foreignBookId: ${b.foreignBookId})`);
					});
				}
			}
		}

		// Find George J. Thompson by name
		const georgeAuthors = authors.filter((a) => a.authorName.toLowerCase().includes('thompson'));
		console.log(`Authors with "thompson" in name: ${georgeAuthors.length}`);
		georgeAuthors.forEach((a) => {
			console.log(`  - "${a.authorName}" (id: ${a.id}, foreignAuthorId: ${a.foreignAuthorId})`);
		});

		// Search for author externally to see their books
		console.log(`\n=== Author Search (external lookup) ===`);
		const authorSearchResults = await client.searchAuthors('George J. Thompson');
		const matchingAuthor = authorSearchResults.find((a) => a.foreignAuthorId === '251987');
		if (matchingAuthor) {
			console.log(`Found author in search: "${matchingAuthor.authorName}"`);
			console.log(`  foreignAuthorId: ${matchingAuthor.foreignAuthorId}`);
			console.log(`  Has books array: ${matchingAuthor.books ? matchingAuthor.books.length : 'undefined'}`);
			console.log(`  Full author:`, JSON.stringify(matchingAuthor, null, 2).slice(0, 1000));
		}
	});

	/**
	 * Test for addAndSearchBook - skipped by default since it modifies Readarr library.
	 * Run with: RUN_ADD_BOOK_TEST=1 yarn test:server --run client.integration
	 */
	it.skipIf(!process.env.RUN_ADD_BOOK_TEST)(
		'should add a book and trigger search',
		async () => {
			const config = JSON.parse(
				fs.readFileSync(path.join(process.cwd(), 'config', 'readarr.json'), 'utf-8'),
			) as ReadarrConfig;
			const instance = config.instances.find((i) => i.enabled);
			if (!instance) throw new Error('No enabled instance');

			// Get required configuration
			const [qualityProfiles, metadataProfiles, rootFolders] = await Promise.all([
				client.getQualityProfiles(),
				client.getMetadataProfiles(),
				client.getRootFolders(),
			]);

			expect(qualityProfiles.length).toBeGreaterThan(0);
			expect(metadataProfiles.length).toBeGreaterThan(0);
			expect(rootFolders.length).toBeGreaterThan(0);

			const qualityProfileId = qualityProfiles[0].id;
			const metadataProfileId = metadataProfiles[0].id;
			const rootFolderPath = rootFolders[0].path;

			// Search for the book
			const searchTerm = `${TEST_BOOK.title} ${TEST_BOOK.author}`;
			console.log(`Searching for: "${searchTerm}"`);
			const searchResults = await client.searchBooks(searchTerm);

			console.log(`Found ${searchResults.length} results`);
			expect(searchResults.length).toBeGreaterThan(0);

			// Log all results to help find the right foreignBookId
			searchResults.slice(0, 5).forEach((book, i) => {
				console.log(`  [${i}] "${book.title}" by ${book.author?.authorName ?? 'unknown'}`);
				console.log(`      foreignBookId: ${book.foreignBookId}`);
				console.log(`      foreignAuthorId: ${book.author?.foreignAuthorId}`);
				console.log(`      authorId: ${book.authorId}`);
				console.log(`      editions: ${book.editions?.length ?? 0}`);
				console.log(`      Full book object:`, JSON.stringify(book, null, 2));
			});

			// Use the first result
			const book = searchResults[0];
			const foreignBookId = TEST_BOOK.foreignBookId || book.foreignBookId;
			let foreignAuthorId = book.author?.foreignAuthorId;
			let authorName = book.author?.authorName ?? TEST_BOOK.author;

			// If book search didn't include foreignAuthorId, search for author separately
			if (!foreignAuthorId) {
				console.log(`\nBook search didn't include foreignAuthorId, searching for author: "${TEST_BOOK.author}"`);
				const authorResults = await client.searchAuthors(TEST_BOOK.author);
				console.log(`Found ${authorResults.length} author results`);
				authorResults.slice(0, 3).forEach((a, i) => {
					console.log(`  [${i}] "${a.authorName}" - foreignAuthorId: ${a.foreignAuthorId}`);
				});

				// Find matching author
				const matchingAuthor = authorResults.find((a) =>
					a.authorName.toLowerCase().includes(TEST_BOOK.author.toLowerCase().split(' ')[0]),
				);
				if (!matchingAuthor) {
					throw new Error(`Could not find author "${TEST_BOOK.author}" in search results`);
				}
				foreignAuthorId = matchingAuthor.foreignAuthorId;
				authorName = matchingAuthor.authorName;
				console.log(`Using author: "${authorName}" (${foreignAuthorId})`);
			}

			// Check if book already exists by fetching all books
			const allBooks = await client.getBooks();
			const existingBook = allBooks.find((b) => b.foreignBookId === foreignBookId);
			console.log(
				`\nExisting book in library: ${existingBook ? `YES (id: ${existingBook.id}, monitored: ${existingBook.monitored})` : 'NO'}`,
			);
			if (book.authorId) {
				const authorBooks = await client.getBooksByAuthor(book.authorId);
				console.log(`Books for authorId ${book.authorId}: ${authorBooks.length}`);
			}

			console.log(`\nAttempting to add book:`);
			console.log(`  Title: ${book.title}`);
			console.log(`  Author: ${book.author?.authorName}`);
			console.log(`  foreignBookId: ${foreignBookId}`);
			console.log(`  foreignAuthorId: ${foreignAuthorId}`);
			console.log(`  authorId from search: ${book.authorId}`);
			console.log(`  ISBN: ${TEST_BOOK.isbn || 'none'}`);

			// Call addAndSearchBook
			const result = await client.addAndSearchBook(
				foreignBookId,
				foreignAuthorId,
				authorName,
				qualityProfileId,
				metadataProfileId,
				rootFolderPath,
				TEST_BOOK.isbn || null,
				book.title,
			);

			console.log(`\nResult:`);
			console.log(`  Author ID: ${result.author.id}`);
			console.log(`  Book ID: ${result.book.id}`);
			console.log(`  Command ID: ${result.commandId}`);

			expect(result.author.id).toBeDefined();
			expect(result.book.id).toBeDefined();
			expect(result.commandId).toBeDefined();
		},
		120000, // 2 minutes - includes time for author refresh
	);
});
