import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequestProcessor } from './index';
import { prisma } from '../../db';
import type { ReadarrInstance } from '../../config/readarr';
import type { ReadarrClient } from '../readarr';

// Mock the config module
vi.mock('../../config/readarr', () => ({
	getInstanceById: vi.fn(),
}));

// Mock prisma
vi.mock('../../db', () => ({
	prisma: {
		bookRequest: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			update: vi.fn(),
		},
	},
}));

import { getInstanceById } from '../../config/readarr';

describe('RequestProcessor', () => {
	let processor: RequestProcessor;
	let mockClient: Partial<ReadarrClient>;

	const mockInstance: ReadarrInstance = {
		id: 'fiction-audio',
		name: 'Fiction Audiobooks',
		url: 'https://readarr.example.com',
		apiKey: 'test-key',
		type: 'audio',
		category: 'fiction',
		enabled: true,
	};

	const mockBook = {
		id: 'book-1',
		title: 'The Martian',
		author: 'Andy Weir',
		isbn: null,
		category: 'fiction',
		coverUrl: null,
		notes: null,
		metadataId: null,
		metadataProvider: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockRequest = {
		id: 'request-1',
		bookId: 'book-1',
		instanceId: 'fiction-audio',
		status: 'pending',
		externalId: null,
		errorMessage: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		lastChecked: null,
		book: mockBook,
	};

	beforeEach(() => {
		vi.clearAllMocks();

		mockClient = {
			searchBooks: vi.fn(),
			searchAuthors: vi.fn(),
			getQualityProfiles: vi.fn(),
			getMetadataProfiles: vi.fn(),
			getRootFolders: vi.fn(),
			addAndSearchBook: vi.fn(),
		};

		processor = new RequestProcessor({
			createClient: () => mockClient as ReadarrClient,
		});
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('processRequest', () => {
		it('should return error if request not found', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(null);

			const result = await processor.processRequest('non-existent');

			expect(result.success).toBe(false);
			expect(result.status).toBe('error');
			expect(result.errorMessage).toBe('Request not found');
		});

		it('should return error if instance not found', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue(undefined);

			const result = await processor.processRequest('request-1');

			expect(result.success).toBe(false);
			expect(result.status).toBe('error');
			expect(result.errorMessage).toContain('not found');
			expect(prisma.bookRequest.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'request-1' },
					data: expect.objectContaining({ status: 'error' }),
				}),
			);
		});

		it('should return error if instance is disabled', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue({ ...mockInstance, enabled: false });

			const result = await processor.processRequest('request-1');

			expect(result.success).toBe(false);
			expect(result.status).toBe('error');
			expect(result.errorMessage).toContain('disabled');
		});

		it('should return not_found if book not in Readarr', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue(mockInstance);
			vi.mocked(mockClient.searchBooks).mockResolvedValue([]);

			const result = await processor.processRequest('request-1');

			expect(result.success).toBe(true);
			expect(result.status).toBe('not_found');
			expect(prisma.bookRequest.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ status: 'not_found' }),
				}),
			);
		});

		it('should successfully process a request and trigger search', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue(mockInstance);

			vi.mocked(mockClient.searchBooks).mockResolvedValue([
				{
					id: 123,
					title: 'The Martian',
					foreignBookId: 'book-foreign-123',
					author: {
						authorName: 'Andy Weir',
						foreignAuthorId: 'author-foreign-456',
					},
				} as any,
			]);

			vi.mocked(mockClient.getQualityProfiles).mockResolvedValue([{ id: 1, name: 'Any' }]);
			vi.mocked(mockClient.getMetadataProfiles).mockResolvedValue([{ id: 1, name: 'Standard' }]);
			vi.mocked(mockClient.getRootFolders).mockResolvedValue([
				{ id: 1, path: '/books', accessible: true, freeSpace: 1000000 },
			]);

			vi.mocked(mockClient.addAndSearchBook).mockResolvedValue({
				author: { id: 1 } as any,
				book: { id: 123 } as any,
				commandId: 456,
			});

			const result = await processor.processRequest('request-1');

			expect(result.success).toBe(true);
			expect(result.status).toBe('searching');
			expect(result.externalId).toBe('123');

			expect(mockClient.searchBooks).toHaveBeenCalledWith('The Martian Andy Weir');
			expect(mockClient.addAndSearchBook).toHaveBeenCalledWith(
				'book-foreign-123',
				'author-foreign-456',
				'Andy Weir',
				1,
				1,
				'/books',
				null, // isbn
			);

			expect(prisma.bookRequest.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						status: 'searching',
						externalId: '123',
					}),
				}),
			);
		});

		it('should handle Readarr API errors gracefully', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue(mockInstance);
			vi.mocked(mockClient.searchBooks).mockRejectedValue(new Error('Connection refused'));

			const result = await processor.processRequest('request-1');

			expect(result.success).toBe(false);
			expect(result.status).toBe('error');
			expect(result.errorMessage).toBe('Connection refused');

			expect(prisma.bookRequest.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						status: 'error',
						errorMessage: 'Connection refused',
					}),
				}),
			);
		});

		it('should return error if Readarr not configured properly', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue(mockInstance);

			vi.mocked(mockClient.searchBooks).mockResolvedValue([
				{
					id: 123,
					title: 'The Martian',
					foreignBookId: 'book-foreign-123',
				} as any,
			]);

			vi.mocked(mockClient.getQualityProfiles).mockResolvedValue([]);
			vi.mocked(mockClient.getMetadataProfiles).mockResolvedValue([]);
			vi.mocked(mockClient.getRootFolders).mockResolvedValue([]);

			const result = await processor.processRequest('request-1');

			expect(result.success).toBe(false);
			expect(result.status).toBe('error');
			expect(result.errorMessage).toContain('not properly configured');
		});

		it('should search for author when book result has no foreignAuthorId', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue(mockInstance);

			// Book search returns result without author foreignAuthorId
			vi.mocked(mockClient.searchBooks).mockResolvedValue([
				{
					id: 123,
					title: 'The Martian',
					foreignBookId: 'book-foreign-123',
					author: {
						authorName: 'Andy Weir',
						foreignAuthorId: '', // Empty!
					},
				} as any,
			]);

			// Author search finds the author with foreignAuthorId
			vi.mocked(mockClient.searchAuthors).mockResolvedValue([
				{
					id: 456,
					authorName: 'Andy Weir',
					foreignAuthorId: 'author-foreign-789',
				} as any,
			]);

			vi.mocked(mockClient.getQualityProfiles).mockResolvedValue([{ id: 1, name: 'Any' }]);
			vi.mocked(mockClient.getMetadataProfiles).mockResolvedValue([{ id: 1, name: 'Standard' }]);
			vi.mocked(mockClient.getRootFolders).mockResolvedValue([
				{ id: 1, path: '/books', accessible: true, freeSpace: 1000000 },
			]);

			vi.mocked(mockClient.addAndSearchBook).mockResolvedValue({
				author: { id: 456 } as any,
				book: { id: 123 } as any,
				commandId: 789,
			});

			const result = await processor.processRequest('request-1');

			expect(result.success).toBe(true);
			expect(result.status).toBe('searching');

			// Should have searched for the author
			expect(mockClient.searchAuthors).toHaveBeenCalledWith('Andy Weir');

			// Should have used the found author's foreignAuthorId
			expect(mockClient.addAndSearchBook).toHaveBeenCalledWith(
				'book-foreign-123',
				'author-foreign-789',
				'Andy Weir',
				1,
				1,
				'/books',
				null, // isbn
			);
		});

		it('should return error when author foreignAuthorId is missing and author search fails', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue(mockInstance);

			// Book search returns result without author foreignAuthorId
			vi.mocked(mockClient.searchBooks).mockResolvedValue([
				{
					id: 123,
					title: 'The Martian',
					foreignBookId: 'book-foreign-123',
					author: {
						authorName: 'Andy Weir',
						// No foreignAuthorId at all
					},
				} as any,
			]);

			// Author search returns no results
			vi.mocked(mockClient.searchAuthors).mockResolvedValue([]);

			vi.mocked(mockClient.getQualityProfiles).mockResolvedValue([{ id: 1, name: 'Any' }]);
			vi.mocked(mockClient.getMetadataProfiles).mockResolvedValue([{ id: 1, name: 'Standard' }]);
			vi.mocked(mockClient.getRootFolders).mockResolvedValue([
				{ id: 1, path: '/books', accessible: true, freeSpace: 1000000 },
			]);

			const result = await processor.processRequest('request-1');

			expect(result.success).toBe(false);
			expect(result.status).toBe('error');
			expect(result.errorMessage).toContain('Could not find author');
		});

		it('should extract author from authorTitle when author object is missing', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue(mockInstance);

			// Book search returns result with authorTitle but no author object
			vi.mocked(mockClient.searchBooks).mockResolvedValue([
				{
					id: 123,
					title: 'The Martian',
					foreignBookId: 'book-foreign-123',
					authorTitle: 'Andy Weir - The Martian', // Combined author-title format
					// No author object!
				} as any,
			]);

			// Author search finds the author
			vi.mocked(mockClient.searchAuthors).mockResolvedValue([
				{
					id: 456,
					authorName: 'Andy Weir',
					foreignAuthorId: 'author-foreign-789',
				} as any,
			]);

			vi.mocked(mockClient.getQualityProfiles).mockResolvedValue([{ id: 1, name: 'Any' }]);
			vi.mocked(mockClient.getMetadataProfiles).mockResolvedValue([{ id: 1, name: 'Standard' }]);
			vi.mocked(mockClient.getRootFolders).mockResolvedValue([
				{ id: 1, path: '/books', accessible: true, freeSpace: 1000000 },
			]);

			vi.mocked(mockClient.addAndSearchBook).mockResolvedValue({
				author: { id: 456 } as any,
				book: { id: 123 } as any,
				commandId: 789,
			});

			const result = await processor.processRequest('request-1');

			expect(result.success).toBe(true);
			expect(result.status).toBe('searching');

			// Should have searched for just "Andy Weir", extracted from authorTitle
			expect(mockClient.searchAuthors).toHaveBeenCalledWith('Andy Weir');

			// Should have used the found author's foreignAuthorId
			expect(mockClient.addAndSearchBook).toHaveBeenCalledWith(
				'book-foreign-123',
				'author-foreign-789',
				'Andy Weir',
				1,
				1,
				'/books',
				null, // isbn
			);
		});

		it('should use partial matching when searching for author', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue(mockInstance);

			// Book search returns result without author info
			vi.mocked(mockClient.searchBooks).mockResolvedValue([
				{
					id: 123,
					title: 'The Martian',
					foreignBookId: 'book-foreign-123',
					// No author or authorTitle
				} as any,
			]);

			// Author search returns author with name containing our search term
			// (e.g., Readarr has "Andy Weir (Author)" which contains "Andy Weir")
			vi.mocked(mockClient.searchAuthors).mockResolvedValue([
				{
					id: 456,
					authorName: 'Andy Weir (Author)', // Contains our search term "Andy Weir"
					foreignAuthorId: 'author-foreign-789',
				} as any,
			]);

			vi.mocked(mockClient.getQualityProfiles).mockResolvedValue([{ id: 1, name: 'Any' }]);
			vi.mocked(mockClient.getMetadataProfiles).mockResolvedValue([{ id: 1, name: 'Standard' }]);
			vi.mocked(mockClient.getRootFolders).mockResolvedValue([
				{ id: 1, path: '/books', accessible: true, freeSpace: 1000000 },
			]);

			vi.mocked(mockClient.addAndSearchBook).mockResolvedValue({
				author: { id: 456 } as any,
				book: { id: 123 } as any,
				commandId: 789,
			});

			const result = await processor.processRequest('request-1');

			expect(result.success).toBe(true);
			expect(result.status).toBe('searching');

			// Should use the canonical name from Readarr, not our database
			expect(mockClient.addAndSearchBook).toHaveBeenCalledWith(
				'book-foreign-123',
				'author-foreign-789',
				'Andy Weir (Author)',
				1,
				1,
				'/books',
				null, // isbn
			);
		});
	});

	describe('findBestMatch', () => {
		it('should prefer exact title match', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue(mockInstance);

			vi.mocked(mockClient.searchBooks).mockResolvedValue([
				{
					id: 1,
					title: 'The Martian Chronicles',
					foreignBookId: 'wrong',
					author: { authorName: 'Ray Bradbury', foreignAuthorId: 'author-bradbury' },
				} as any,
				{
					id: 2,
					title: 'The Martian',
					foreignBookId: 'correct',
					author: { authorName: 'Andy Weir', foreignAuthorId: 'author-weir' },
				} as any,
			]);

			vi.mocked(mockClient.getQualityProfiles).mockResolvedValue([{ id: 1, name: 'Any' }]);
			vi.mocked(mockClient.getMetadataProfiles).mockResolvedValue([{ id: 1, name: 'Standard' }]);
			vi.mocked(mockClient.getRootFolders).mockResolvedValue([
				{ id: 1, path: '/books', accessible: true, freeSpace: 1000000 },
			]);
			vi.mocked(mockClient.addAndSearchBook).mockResolvedValue({
				author: { id: 1 } as any,
				book: { id: 2 } as any,
				commandId: 456,
			});

			await processor.processRequest('request-1');

			expect(mockClient.addAndSearchBook).toHaveBeenCalledWith(
				'correct',
				'author-weir',
				'Andy Weir',
				1,
				1,
				'/books',
				null, // isbn
			);
		});
	});

	describe('processBookRequests', () => {
		it('should process all pending requests for a book', async () => {
			vi.mocked(prisma.bookRequest.findMany).mockResolvedValue([
				{ ...mockRequest, id: 'req-1', instanceId: 'fiction-audio' },
				{ ...mockRequest, id: 'req-2', instanceId: 'fiction-ebook' },
			] as any);

			// Mock for each processRequest call
			vi.mocked(prisma.bookRequest.findUnique)
				.mockResolvedValueOnce({ ...mockRequest, id: 'req-1' } as any)
				.mockResolvedValueOnce({ ...mockRequest, id: 'req-2' } as any);

			vi.mocked(getInstanceById).mockReturnValue(mockInstance);
			vi.mocked(mockClient.searchBooks).mockResolvedValue([]);

			const results = await processor.processBookRequests('book-1');

			expect(results.size).toBe(2);
			expect(results.get('fiction-audio')).toBeDefined();
			expect(results.get('fiction-ebook')).toBeDefined();
		});
	});

	describe('processAllPendingRequests', () => {
		it('should process all pending requests and return counts', async () => {
			vi.mocked(prisma.bookRequest.findMany).mockResolvedValue([
				{ ...mockRequest, id: 'req-1' },
				{ ...mockRequest, id: 'req-2' },
				{ ...mockRequest, id: 'req-3' },
			] as any);

			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue(mockInstance);
			vi.mocked(mockClient.searchBooks).mockResolvedValue([]);

			const result = await processor.processAllPendingRequests();

			expect(result.processed).toBe(3);
			expect(result.errors).toBe(0);
		});

		it('should count errors correctly', async () => {
			vi.mocked(prisma.bookRequest.findMany).mockResolvedValue([
				{ ...mockRequest, id: 'req-1' },
				{ ...mockRequest, id: 'req-2' },
			] as any);

			vi.mocked(prisma.bookRequest.findUnique)
				.mockResolvedValueOnce(mockRequest as any)
				.mockResolvedValueOnce(null); // Second request not found = error

			vi.mocked(getInstanceById).mockReturnValue(mockInstance);
			vi.mocked(mockClient.searchBooks).mockResolvedValue([]);

			const result = await processor.processAllPendingRequests();

			expect(result.processed).toBe(2);
			expect(result.errors).toBe(1);
		});
	});
});
