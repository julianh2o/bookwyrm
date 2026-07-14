import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import booksRouter from './books';
import { prisma } from '../db';

// Create test app
const app = express();
app.use(express.json());
app.use('/api/books', booksRouter);

describe('Books API', () => {
	// Clean up database before all tests
	beforeAll(async () => {
		await prisma.bookRequest.deleteMany();
		await prisma.book.deleteMany();
	});

	// Clean up after all tests
	afterAll(async () => {
		await prisma.bookRequest.deleteMany();
		await prisma.book.deleteMany();
		await prisma.$disconnect();
	});

	// Clean between tests
	beforeEach(async () => {
		await prisma.bookRequest.deleteMany();
		await prisma.book.deleteMany();
	});

	describe('POST /api/books', () => {
		it('should create a book with required fields', async () => {
			const response = await request(app).post('/api/books').send({
				title: 'The Martian',
				author: 'Andy Weir',
				category: 'fiction',
			});

			expect(response.status).toBe(201);
			expect(response.body.id).toBeDefined();
			expect(response.body.title).toBe('The Martian');
			expect(response.body.author).toBe('Andy Weir');
			expect(response.body.category).toBe('fiction');
			expect(response.body.createdAt).toBeDefined();
			expect(response.body.updatedAt).toBeDefined();
		});

		it('should create a book with all fields', async () => {
			const response = await request(app).post('/api/books').send({
				title: 'Project Hail Mary',
				author: 'Andy Weir',
				category: 'fiction',
				isbn: '978-0593135204',
				coverUrl: 'https://example.com/cover.jpg',
				notes: 'Great sci-fi book',
				metadataId: '12345',
				metadataProvider: 'rreading-glasses',
			});

			expect(response.status).toBe(201);
			expect(response.body.isbn).toBe('978-0593135204');
			expect(response.body.coverUrl).toBe('https://example.com/cover.jpg');
			expect(response.body.notes).toBe('Great sci-fi book');
			expect(response.body.metadataId).toBe('12345');
			expect(response.body.metadataProvider).toBe('rreading-glasses');
		});

		it('should return 400 for missing required fields', async () => {
			const response = await request(app).post('/api/books').send({
				title: 'Test Book',
			});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe('Validation error');
		});

		it('should return 400 for invalid category', async () => {
			const response = await request(app).post('/api/books').send({
				title: 'Test Book',
				author: 'Test Author',
				category: 'invalid',
			});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe('Validation error');
		});

		it('should return 400 for invalid ISBN format', async () => {
			const response = await request(app).post('/api/books').send({
				title: 'Test Book',
				author: 'Test Author',
				category: 'fiction',
				isbn: 'not-valid!',
			});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe('Validation error');
		});
	});

	describe('GET /api/books', () => {
		beforeEach(async () => {
			// Create some test books
			await prisma.book.createMany({
				data: [
					{ title: 'Fiction Book 1', author: 'Author A', category: 'fiction' },
					{ title: 'Fiction Book 2', author: 'Author B', category: 'fiction' },
					{ title: 'Nonfiction Book', author: 'Author C', category: 'nonfiction' },
				],
			});
		});

		it('should return all books', async () => {
			const response = await request(app).get('/api/books');

			expect(response.status).toBe(200);
			expect(response.body.books).toHaveLength(3);
			expect(response.body.total).toBe(3);
			expect(response.body.limit).toBe(50);
			expect(response.body.offset).toBe(0);
		});

		it('should filter by category', async () => {
			const response = await request(app).get('/api/books?category=fiction');

			expect(response.status).toBe(200);
			expect(response.body.books).toHaveLength(2);
			expect(response.body.books.every((b: { category: string }) => b.category === 'fiction')).toBe(true);
		});

		it('should support pagination', async () => {
			const response = await request(app).get('/api/books?limit=2&offset=1');

			expect(response.status).toBe(200);
			expect(response.body.books).toHaveLength(2);
			expect(response.body.limit).toBe(2);
			expect(response.body.offset).toBe(1);
		});

		it('should search by title', async () => {
			const response = await request(app).get('/api/books?search=Book%201');

			expect(response.status).toBe(200);
			expect(response.body.books).toHaveLength(1);
			expect(response.body.books[0].title).toBe('Fiction Book 1');
		});

		it('should search by author', async () => {
			const response = await request(app).get('/api/books?search=Author%20C');

			expect(response.status).toBe(200);
			expect(response.body.books).toHaveLength(1);
			expect(response.body.books[0].author).toBe('Author C');
		});
	});

	describe('GET /api/books/:id', () => {
		it('should return a single book', async () => {
			const book = await prisma.book.create({
				data: { title: 'Test Book', author: 'Test Author', category: 'fiction' },
			});

			const response = await request(app).get(`/api/books/${book.id}`);

			expect(response.status).toBe(200);
			expect(response.body.id).toBe(book.id);
			expect(response.body.title).toBe('Test Book');
			expect(response.body.requests).toBeDefined();
		});

		it('should return 404 for non-existent book', async () => {
			const response = await request(app).get('/api/books/non-existent-id');

			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Book not found');
		});
	});

	describe('PATCH /api/books/:id', () => {
		it('should update book fields', async () => {
			const book = await prisma.book.create({
				data: { title: 'Original Title', author: 'Original Author', category: 'fiction' },
			});

			const response = await request(app).patch(`/api/books/${book.id}`).send({
				title: 'Updated Title',
				notes: 'Added some notes',
			});

			expect(response.status).toBe(200);
			expect(response.body.title).toBe('Updated Title');
			expect(response.body.author).toBe('Original Author'); // Unchanged
			expect(response.body.notes).toBe('Added some notes');
		});

		it('should update category', async () => {
			const book = await prisma.book.create({
				data: { title: 'Test Book', author: 'Test Author', category: 'fiction' },
			});

			const response = await request(app).patch(`/api/books/${book.id}`).send({
				category: 'nonfiction',
			});

			expect(response.status).toBe(200);
			expect(response.body.category).toBe('nonfiction');
		});

		it('should set fields to null', async () => {
			const book = await prisma.book.create({
				data: { title: 'Test Book', author: 'Test Author', category: 'fiction', notes: 'Some notes' },
			});

			const response = await request(app).patch(`/api/books/${book.id}`).send({
				notes: null,
			});

			expect(response.status).toBe(200);
			expect(response.body.notes).toBeNull();
		});

		it('should return 404 for non-existent book', async () => {
			const response = await request(app).patch('/api/books/non-existent-id').send({
				title: 'New Title',
			});

			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Book not found');
		});

		it('should return 400 for invalid update data', async () => {
			const book = await prisma.book.create({
				data: { title: 'Test Book', author: 'Test Author', category: 'fiction' },
			});

			const response = await request(app).patch(`/api/books/${book.id}`).send({
				category: 'invalid-category',
			});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe('Validation error');
		});
	});

	describe('DELETE /api/books/:id', () => {
		it('should delete a book', async () => {
			const book = await prisma.book.create({
				data: { title: 'Test Book', author: 'Test Author', category: 'fiction' },
			});

			const response = await request(app).delete(`/api/books/${book.id}`);

			expect(response.status).toBe(204);

			// Verify book is deleted
			const deleted = await prisma.book.findUnique({ where: { id: book.id } });
			expect(deleted).toBeNull();
		});

		it('should delete associated requests', async () => {
			const book = await prisma.book.create({
				data: { title: 'Test Book', author: 'Test Author', category: 'fiction' },
			});

			await prisma.bookRequest.create({
				data: { bookId: book.id, instanceId: 'fiction-audio', status: 'pending' },
			});

			const response = await request(app).delete(`/api/books/${book.id}`);

			expect(response.status).toBe(204);

			// Verify request is deleted
			const requests = await prisma.bookRequest.findMany({ where: { bookId: book.id } });
			expect(requests).toHaveLength(0);
		});

		it('should return 404 for non-existent book', async () => {
			const response = await request(app).delete('/api/books/non-existent-id');

			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Book not found');
		});
	});
});
