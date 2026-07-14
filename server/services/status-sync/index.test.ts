import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatusSyncService } from './index';
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

describe('StatusSyncService', () => {
	let service: StatusSyncService;
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

	const mockRequest = {
		id: 'request-1',
		bookId: 'book-1',
		instanceId: 'fiction-audio',
		status: 'searching',
		externalId: '123',
		errorMessage: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		lastChecked: null,
	};

	beforeEach(() => {
		vi.clearAllMocks();

		mockClient = {
			isBookAvailable: vi.fn(),
		};

		service = new StatusSyncService({
			createClient: () => mockClient as ReadarrClient,
		});
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('syncRequest', () => {
		it('should return error if request not found', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(null);

			const result = await service.syncRequest('non-existent');

			expect(result.changed).toBe(false);
			expect(result.error).toBe('Request not found');
		});

		it('should skip requests not in searching/downloading status', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue({
				...mockRequest,
				status: 'available',
			} as any);

			const result = await service.syncRequest('request-1');

			expect(result.changed).toBe(false);
			expect(result.previousStatus).toBe('available');
			expect(result.newStatus).toBe('available');
			expect(mockClient.isBookAvailable).not.toHaveBeenCalled();
		});

		it('should skip requests without external ID', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue({
				...mockRequest,
				externalId: null,
			} as any);

			const result = await service.syncRequest('request-1');

			expect(result.changed).toBe(false);
			expect(result.error).toBe('No external ID to check');
		});

		it('should update status to available when book has files', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue(mockInstance);
			vi.mocked(mockClient.isBookAvailable).mockResolvedValue(true);

			const result = await service.syncRequest('request-1');

			expect(result.changed).toBe(true);
			expect(result.previousStatus).toBe('searching');
			expect(result.newStatus).toBe('available');

			expect(prisma.bookRequest.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: 'request-1' },
					data: expect.objectContaining({
						status: 'available',
						lastChecked: expect.any(Date),
					}),
				}),
			);
		});

		it('should not change status when book has no files', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue(mockInstance);
			vi.mocked(mockClient.isBookAvailable).mockResolvedValue(false);

			const result = await service.syncRequest('request-1');

			expect(result.changed).toBe(false);
			expect(result.previousStatus).toBe('searching');
			expect(result.newStatus).toBe('searching');

			// Should still update lastChecked
			expect(prisma.bookRequest.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						lastChecked: expect.any(Date),
					}),
				}),
			);
		});

		it('should handle API errors gracefully', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue(mockInstance);
			vi.mocked(mockClient.isBookAvailable).mockRejectedValue(new Error('Connection timeout'));

			const result = await service.syncRequest('request-1');

			expect(result.changed).toBe(false);
			expect(result.error).toBe('Connection timeout');

			expect(prisma.bookRequest.update).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						lastChecked: expect.any(Date),
						errorMessage: 'Connection timeout',
					}),
				}),
			);
		});

		it('should handle disabled instance', async () => {
			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue({ ...mockInstance, enabled: false });

			const result = await service.syncRequest('request-1');

			expect(result.changed).toBe(false);
			expect(result.error).toBe('Instance disabled');
		});
	});

	describe('syncBookRequests', () => {
		it('should sync all in-progress requests for a book', async () => {
			vi.mocked(prisma.bookRequest.findMany).mockResolvedValue([
				{ ...mockRequest, id: 'req-1' },
				{ ...mockRequest, id: 'req-2' },
			] as any);

			vi.mocked(prisma.bookRequest.findUnique)
				.mockResolvedValueOnce({ ...mockRequest, id: 'req-1' } as any)
				.mockResolvedValueOnce({ ...mockRequest, id: 'req-2' } as any);

			vi.mocked(getInstanceById).mockReturnValue(mockInstance);
			vi.mocked(mockClient.isBookAvailable).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

			const results = await service.syncBookRequests('book-1');

			expect(results).toHaveLength(2);
			expect(results[0].newStatus).toBe('available');
			expect(results[1].newStatus).toBe('searching');
		});
	});

	describe('syncAllInProgress', () => {
		it('should return correct summary', async () => {
			vi.mocked(prisma.bookRequest.findMany).mockResolvedValue([
				{ ...mockRequest, id: 'req-1' },
				{ ...mockRequest, id: 'req-2' },
				{ ...mockRequest, id: 'req-3' },
			] as any);

			vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(mockRequest as any);
			vi.mocked(getInstanceById).mockReturnValue(mockInstance);

			vi.mocked(mockClient.isBookAvailable)
				.mockResolvedValueOnce(true) // req-1 becomes available
				.mockResolvedValueOnce(false) // req-2 stays searching
				.mockRejectedValueOnce(new Error('Network error')); // req-3 errors

			const summary = await service.syncAllInProgress();

			expect(summary.total).toBe(3);
			expect(summary.changed).toBe(1);
			expect(summary.nowAvailable).toBe(1);
			expect(summary.errors).toBe(1);
		});
	});

	describe('getRequestsNeedingSync', () => {
		it('should return requests with external IDs in searching/downloading status', async () => {
			const requests = [
				{ id: 'req-1', bookId: 'book-1', instanceId: 'fiction-audio', status: 'searching', lastChecked: null },
			];

			vi.mocked(prisma.bookRequest.findMany).mockResolvedValue(requests as any);

			const result = await service.getRequestsNeedingSync();

			expect(result).toEqual(requests);
			expect(prisma.bookRequest.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: {
						status: { in: ['searching', 'downloading'] },
						externalId: { not: null },
					},
				}),
			);
		});
	});
});
