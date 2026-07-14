import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReadarrClient } from './client';

describe('ReadarrClient', () => {
	let client: ReadarrClient;
	let mockFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		client = new ReadarrClient({
			url: 'https://readarr.example.com',
			apiKey: 'test-api-key',
			timeout: 5000,
		});

		mockFetch = vi.fn();
		vi.stubGlobal('fetch', mockFetch);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('testConnection', () => {
		it('should return system status on success', async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						version: '0.4.20.119',
						appName: 'Readarr',
						isDocker: true,
					}),
			});

			const status = await client.testConnection();

			expect(status.version).toBe('0.4.20.119');
			expect(status.appName).toBe('Readarr');
			expect(mockFetch).toHaveBeenCalledWith(
				'https://readarr.example.com/api/v1/system/status',
				expect.objectContaining({
					method: 'GET',
					headers: expect.objectContaining({
						'X-Api-Key': 'test-api-key',
					}),
				}),
			);
		});

		it('should throw on HTTP error', async () => {
			mockFetch.mockResolvedValue({
				ok: false,
				status: 401,
				statusText: 'Unauthorized',
				text: () => Promise.resolve('Invalid API key'),
			});

			await expect(client.testConnection()).rejects.toThrow('Readarr API error: 401 Unauthorized');
		});
	});

	describe('searchBooks', () => {
		it('should search for books by term', async () => {
			const mockBooks = [
				{ id: 1, title: 'The Martian', foreignBookId: '123', monitored: false },
				{ id: 2, title: 'Project Hail Mary', foreignBookId: '456', monitored: true },
			];

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockBooks),
			});

			const books = await client.searchBooks('martian');

			expect(books).toHaveLength(2);
			expect(books[0].title).toBe('The Martian');
			expect(mockFetch).toHaveBeenCalledWith(
				'https://readarr.example.com/api/v1/book/lookup?term=martian',
				expect.anything(),
			);
		});
	});

	describe('searchAuthors', () => {
		it('should search for authors by name', async () => {
			const mockAuthors = [{ id: 1, authorName: 'Andy Weir', foreignAuthorId: '123' }];

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockAuthors),
			});

			const authors = await client.searchAuthors('andy weir');

			expect(authors).toHaveLength(1);
			expect(authors[0].authorName).toBe('Andy Weir');
		});
	});

	describe('getBook', () => {
		it('should get a specific book by ID', async () => {
			const mockBook = {
				id: 1,
				title: 'The Martian',
				foreignBookId: '123',
				statistics: { bookFileCount: 1 },
			};

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockBook),
			});

			const book = await client.getBook(1);

			expect(book.title).toBe('The Martian');
			expect(mockFetch).toHaveBeenCalledWith('https://readarr.example.com/api/v1/book/1', expect.anything());
		});
	});

	describe('getBooksByAuthor', () => {
		it('should get books by author ID', async () => {
			const mockBooks = [
				{ id: 1, title: 'The Martian', authorId: 5 },
				{ id: 2, title: 'Project Hail Mary', authorId: 5 },
			];

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockBooks),
			});

			const books = await client.getBooksByAuthor(5);

			expect(books).toHaveLength(2);
			expect(mockFetch).toHaveBeenCalledWith('https://readarr.example.com/api/v1/book?authorId=5', expect.anything());
		});
	});

	describe('getEditions', () => {
		it('should get editions for a book', async () => {
			const mockEditions = [
				{ id: 1, bookId: 5, title: 'The Martian', isbn13: '9780553418026', format: 'Paperback' },
				{ id: 2, bookId: 5, title: 'The Martian', isbn13: '9781101903582', format: 'Hardcover' },
			];

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockEditions),
			});

			const editions = await client.getEditions(5);

			expect(editions).toHaveLength(2);
			expect(editions[0].isbn13).toBe('9780553418026');
			expect(mockFetch).toHaveBeenCalledWith('https://readarr.example.com/api/v1/edition?bookId=5', expect.anything());
		});

		it('should return empty array when no editions exist', async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve([]),
			});

			const editions = await client.getEditions(999);

			expect(editions).toHaveLength(0);
		});
	});

	describe('addAuthor', () => {
		it('should add an author to the library', async () => {
			const mockAuthor = {
				id: 1,
				authorName: 'Andy Weir',
				foreignAuthorId: '123',
			};

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockAuthor),
			});

			const author = await client.addAuthor({
				foreignAuthorId: '123',
				authorName: 'Andy Weir',
				qualityProfileId: 1,
				metadataProfileId: 1,
				path: '/books/Andy Weir',
				monitored: false,
				monitorNewItems: 'none',
				tags: [],
			});

			expect(author.id).toBe(1);
			expect(mockFetch).toHaveBeenCalledWith(
				'https://readarr.example.com/api/v1/author',
				expect.objectContaining({
					method: 'POST',
					body: expect.stringContaining('Andy Weir'),
				}),
			);
		});
	});

	describe('updateBook', () => {
		it('should update a book', async () => {
			const mockBook = {
				id: 1,
				title: 'The Martian',
				foreignBookId: '123',
				monitored: true,
			};

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockBook),
			});

			const book = await client.updateBook(mockBook as any);

			expect(book.monitored).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith(
				'https://readarr.example.com/api/v1/book/1',
				expect.objectContaining({
					method: 'PUT',
				}),
			);
		});
	});

	describe('searchBook', () => {
		it('should trigger a book search command', async () => {
			const mockCommand = {
				id: 123,
				name: 'BookSearch',
				status: 'queued',
			};

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockCommand),
			});

			const command = await client.searchBook([1, 2]);

			expect(command.id).toBe(123);
			expect(mockFetch).toHaveBeenCalledWith(
				'https://readarr.example.com/api/v1/command',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({ name: 'BookSearch', bookIds: [1, 2] }),
				}),
			);
		});
	});

	describe('isBookAvailable', () => {
		it('should return true when book has files', async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						id: 1,
						title: 'The Martian',
						statistics: { bookFileCount: 1 },
					}),
			});

			const available = await client.isBookAvailable(1);

			expect(available).toBe(true);
		});

		it('should return false when book has no files', async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						id: 1,
						title: 'The Martian',
						statistics: { bookFileCount: 0 },
					}),
			});

			const available = await client.isBookAvailable(1);

			expect(available).toBe(false);
		});

		it('should return false when statistics is missing', async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						id: 1,
						title: 'The Martian',
					}),
			});

			const available = await client.isBookAvailable(1);

			expect(available).toBe(false);
		});
	});

	describe('getQualityProfiles', () => {
		it('should get quality profiles', async () => {
			const mockProfiles = [
				{ id: 1, name: 'Any' },
				{ id: 2, name: 'Lossless' },
			];

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockProfiles),
			});

			const profiles = await client.getQualityProfiles();

			expect(profiles).toHaveLength(2);
			expect(profiles[0].name).toBe('Any');
		});
	});

	describe('getRootFolders', () => {
		it('should get root folders', async () => {
			const mockFolders = [{ id: 1, path: '/books', accessible: true, freeSpace: 1000000 }];

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockFolders),
			});

			const folders = await client.getRootFolders();

			expect(folders).toHaveLength(1);
			expect(folders[0].path).toBe('/books');
		});
	});

	describe('URL handling', () => {
		it('should strip trailing slash from base URL', async () => {
			const clientWithSlash = new ReadarrClient({
				url: 'https://readarr.example.com/',
				apiKey: 'test',
			});

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({}),
			});

			await clientWithSlash.testConnection();

			expect(mockFetch).toHaveBeenCalledWith('https://readarr.example.com/api/v1/system/status', expect.anything());
		});
	});
});
