import { describe, it, expect } from 'vitest';
import {
	createBookSchema,
	updateBookSchema,
	listBooksQuerySchema,
	bookCategorySchema,
	bookRequestStatusSchema,
} from './book';

describe('bookCategorySchema', () => {
	it('should accept valid categories', () => {
		expect(bookCategorySchema.parse('fiction')).toBe('fiction');
		expect(bookCategorySchema.parse('nonfiction')).toBe('nonfiction');
	});

	it('should reject invalid categories', () => {
		expect(() => bookCategorySchema.parse('invalid')).toThrow();
		expect(() => bookCategorySchema.parse('')).toThrow();
		expect(() => bookCategorySchema.parse(null)).toThrow();
	});
});

describe('bookRequestStatusSchema', () => {
	it('should accept all valid statuses', () => {
		const validStatuses = ['pending', 'searching', 'found', 'downloading', 'available', 'not_found', 'error'];
		for (const status of validStatuses) {
			expect(bookRequestStatusSchema.parse(status)).toBe(status);
		}
	});

	it('should reject invalid statuses', () => {
		expect(() => bookRequestStatusSchema.parse('invalid')).toThrow();
		expect(() => bookRequestStatusSchema.parse('complete')).toThrow();
	});
});

describe('createBookSchema', () => {
	const validBook = {
		title: 'The Martian',
		author: 'Andy Weir',
		category: 'fiction' as const,
	};

	it('should accept valid minimal book input', () => {
		const result = createBookSchema.parse(validBook);
		expect(result.title).toBe('The Martian');
		expect(result.author).toBe('Andy Weir');
		expect(result.category).toBe('fiction');
	});

	it('should accept valid full book input', () => {
		const fullBook = {
			...validBook,
			isbn: '978-0-553-41802-6',
			coverUrl: 'https://example.com/cover.jpg',
			notes: 'Great book about survival on Mars',
			metadataId: '12345',
			metadataProvider: 'rreading-glasses',
		};
		const result = createBookSchema.parse(fullBook);
		expect(result.isbn).toBe('978-0-553-41802-6');
		expect(result.coverUrl).toBe('https://example.com/cover.jpg');
		expect(result.notes).toBe('Great book about survival on Mars');
	});

	it('should accept null for optional fields', () => {
		const bookWithNulls = {
			...validBook,
			isbn: null,
			coverUrl: null,
			notes: null,
		};
		const result = createBookSchema.parse(bookWithNulls);
		expect(result.isbn).toBeNull();
		expect(result.coverUrl).toBeNull();
	});

	it('should reject missing required fields', () => {
		expect(() => createBookSchema.parse({})).toThrow();
		expect(() => createBookSchema.parse({ title: 'Test' })).toThrow();
		expect(() => createBookSchema.parse({ title: 'Test', author: 'Author' })).toThrow();
	});

	it('should reject empty title', () => {
		expect(() => createBookSchema.parse({ ...validBook, title: '' })).toThrow(/Title is required/);
	});

	it('should reject empty author', () => {
		expect(() => createBookSchema.parse({ ...validBook, author: '' })).toThrow(/Author is required/);
	});

	it('should reject invalid ISBN format', () => {
		expect(() => createBookSchema.parse({ ...validBook, isbn: 'not-an-isbn!' })).toThrow(/Invalid ISBN/);
	});

	it('should accept valid ISBN formats', () => {
		// ISBN-10
		expect(createBookSchema.parse({ ...validBook, isbn: '0553418025' }).isbn).toBe('0553418025');
		// ISBN-13 with hyphens
		expect(createBookSchema.parse({ ...validBook, isbn: '978-0-553-41802-6' }).isbn).toBe('978-0-553-41802-6');
		// ISBN with X check digit
		expect(createBookSchema.parse({ ...validBook, isbn: '0-8044-2957-X' }).isbn).toBe('0-8044-2957-X');
	});

	it('should reject invalid cover URL', () => {
		expect(() => createBookSchema.parse({ ...validBook, coverUrl: 'not-a-url' })).toThrow(/Invalid cover URL/);
	});

	it('should reject invalid category', () => {
		expect(() => createBookSchema.parse({ ...validBook, category: 'biography' })).toThrow();
	});

	it('should reject title exceeding max length', () => {
		const longTitle = 'A'.repeat(501);
		expect(() => createBookSchema.parse({ ...validBook, title: longTitle })).toThrow();
	});
});

describe('updateBookSchema', () => {
	it('should accept empty object (no updates)', () => {
		const result = updateBookSchema.parse({});
		expect(result).toEqual({});
	});

	it('should accept partial updates', () => {
		const result = updateBookSchema.parse({ title: 'New Title' });
		expect(result.title).toBe('New Title');
		expect(result.author).toBeUndefined();
	});

	it('should accept setting fields to null', () => {
		const result = updateBookSchema.parse({ isbn: null, notes: null });
		expect(result.isbn).toBeNull();
		expect(result.notes).toBeNull();
	});

	it('should still validate field formats', () => {
		expect(() => updateBookSchema.parse({ isbn: 'invalid!' })).toThrow(/Invalid ISBN/);
		expect(() => updateBookSchema.parse({ coverUrl: 'not-a-url' })).toThrow(/Invalid cover URL/);
	});
});

describe('listBooksQuerySchema', () => {
	it('should provide defaults for missing fields', () => {
		const result = listBooksQuerySchema.parse({});
		expect(result.limit).toBe(50);
		expect(result.offset).toBe(0);
	});

	it('should accept valid query parameters', () => {
		const result = listBooksQuerySchema.parse({
			category: 'fiction',
			status: 'available',
			search: 'martian',
			limit: 10,
			offset: 20,
		});
		expect(result.category).toBe('fiction');
		expect(result.status).toBe('available');
		expect(result.search).toBe('martian');
		expect(result.limit).toBe(10);
		expect(result.offset).toBe(20);
	});

	it('should coerce string numbers to integers', () => {
		const result = listBooksQuerySchema.parse({
			limit: '25',
			offset: '10',
		});
		expect(result.limit).toBe(25);
		expect(result.offset).toBe(10);
	});

	it('should reject limit outside valid range', () => {
		expect(() => listBooksQuerySchema.parse({ limit: 0 })).toThrow();
		expect(() => listBooksQuerySchema.parse({ limit: 101 })).toThrow();
	});

	it('should reject negative offset', () => {
		expect(() => listBooksQuerySchema.parse({ offset: -1 })).toThrow();
	});

	it('should reject invalid category', () => {
		expect(() => listBooksQuerySchema.parse({ category: 'invalid' })).toThrow();
	});

	it('should reject invalid status', () => {
		expect(() => listBooksQuerySchema.parse({ status: 'invalid' })).toThrow();
	});
});
