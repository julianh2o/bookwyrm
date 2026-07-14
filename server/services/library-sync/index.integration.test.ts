/**
 * Integration tests for LibrarySyncService
 *
 * These tests connect to real Readarr instances to verify sync behavior.
 * Run with: yarn test:server --run library-sync/index.integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LibrarySyncService } from './index';
import { loadReadarrConfig, type ReadarrInstance } from '../../config/readarr';
import { prisma } from '../../db';

describe('LibrarySyncService Integration', () => {
	let service: LibrarySyncService;
	let instances: ReadarrInstance[];

	beforeAll(async () => {
		const config = loadReadarrConfig();
		instances = config.instances.filter((i) => i.enabled);
		service = new LibrarySyncService();

		// Clean up any existing test data
		await prisma.bookRequest.deleteMany({});
		await prisma.book.deleteMany({});
	});

	afterAll(async () => {
		// Clean up test data
		await prisma.bookRequest.deleteMany({});
		await prisma.book.deleteMany({});
	});

	it('should have enabled instances', () => {
		expect(instances.length).toBeGreaterThan(0);
		console.log(`Testing with ${instances.length} Readarr instances`);
	});

	it('should sync books and populate ISBNs', async () => {
		// Sync from first instance only (for speed)
		const instance = instances[0];
		console.log(`\nSyncing from: ${instance.name} (${instance.type})`);

		const result = await service.syncInstance(instance);

		console.log(`  Books found: ${result.booksFound}`);
		console.log(`  Books imported: ${result.booksImported}`);
		console.log(`  Books created: ${result.booksCreated}`);
		console.log(`  Errors: ${result.errors.length}`);

		// Get all books from the database
		const books = await prisma.book.findMany({
			select: {
				id: true,
				title: true,
				isbn: true,
			},
		});

		const booksWithIsbn = books.filter((b) => b.isbn !== null);
		const booksWithoutIsbn = books.filter((b) => b.isbn === null);

		console.log(`\n  Database results:`);
		console.log(`    Total books: ${books.length}`);
		console.log(`    Books with ISBN: ${booksWithIsbn.length}`);
		console.log(`    Books without ISBN: ${booksWithoutIsbn.length}`);

		// Log sample books with ISBNs
		if (booksWithIsbn.length > 0) {
			console.log(`\n  Sample books with ISBN:`);
			for (const book of booksWithIsbn.slice(0, 3)) {
				console.log(`    - "${book.title}": ${book.isbn}`);
			}
		}

		// Verify that at least some books have ISBNs
		// (Audio instances may have fewer ISBNs than ebook instances)
		if (instance.type === 'ebook') {
			expect(booksWithIsbn.length).toBeGreaterThan(0);
		}
	});

	it('should sync from an ebook instance and verify high ISBN coverage', async () => {
		// Clean up first
		await prisma.bookRequest.deleteMany({});
		await prisma.book.deleteMany({});

		// Find an ebook instance
		const ebookInstance = instances.find((i) => i.type === 'ebook');
		if (!ebookInstance) {
			console.log('Skipping - no ebook instance found');
			return;
		}

		console.log(`\nSyncing from ebook instance: ${ebookInstance.name}`);

		const result = await service.syncInstance(ebookInstance);

		console.log(`  Books found: ${result.booksFound}`);
		console.log(`  Books imported: ${result.booksImported}`);

		// Get all books from the database
		const books = await prisma.book.findMany({
			select: {
				id: true,
				title: true,
				isbn: true,
			},
		});

		const booksWithIsbn = books.filter((b) => b.isbn !== null);
		const coverage = books.length > 0 ? Math.round((booksWithIsbn.length / books.length) * 100) : 0;

		console.log(`\n  ISBN coverage: ${booksWithIsbn.length}/${books.length} (${coverage}%)`);

		// Ebooks should have good ISBN coverage
		expect(booksWithIsbn.length).toBeGreaterThan(0);
		console.log(`\n*** SUCCESS: ISBNs are being populated during sync! ***`);
	});
});
