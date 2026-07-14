import { prisma } from '../../db';
import { getInstanceById, type ReadarrInstance } from '../../config/readarr';
import { ReadarrClient } from '../readarr';

export interface SyncResult {
	requestId: string;
	instanceId: string;
	previousStatus: string;
	newStatus: string;
	changed: boolean;
	error?: string;
}

export interface StatusSyncOptions {
	/** Override the Readarr client factory (for testing) */
	createClient?: (instance: ReadarrInstance) => ReadarrClient;
}

/**
 * Service for syncing book request statuses with Readarr.
 * Checks if books have been downloaded and updates statuses accordingly.
 */
export class StatusSyncService {
	private createClient: (instance: ReadarrInstance) => ReadarrClient;

	constructor(options: StatusSyncOptions = {}) {
		this.createClient =
			options.createClient ??
			((instance) =>
				new ReadarrClient({
					url: instance.url,
					apiKey: instance.apiKey,
				}));
	}

	/**
	 * Sync status for a single request.
	 * Checks if the book has files in Readarr and updates status.
	 */
	async syncRequest(requestId: string): Promise<SyncResult> {
		const request = await prisma.bookRequest.findUnique({
			where: { id: requestId },
		});

		if (!request) {
			return {
				requestId,
				instanceId: '',
				previousStatus: 'unknown',
				newStatus: 'unknown',
				changed: false,
				error: 'Request not found',
			};
		}

		// Only sync requests that are searching or downloading
		if (!['searching', 'downloading'].includes(request.status)) {
			return {
				requestId,
				instanceId: request.instanceId,
				previousStatus: request.status,
				newStatus: request.status,
				changed: false,
			};
		}

		// Need external ID to check status
		if (!request.externalId) {
			return {
				requestId,
				instanceId: request.instanceId,
				previousStatus: request.status,
				newStatus: request.status,
				changed: false,
				error: 'No external ID to check',
			};
		}

		const instance = getInstanceById(request.instanceId);
		if (!instance || !instance.enabled) {
			return {
				requestId,
				instanceId: request.instanceId,
				previousStatus: request.status,
				newStatus: request.status,
				changed: false,
				error: instance ? 'Instance disabled' : 'Instance not found',
			};
		}

		const client = this.createClient(instance);

		try {
			const bookId = parseInt(request.externalId, 10);
			const isAvailable = await client.isBookAvailable(bookId);

			const newStatus = isAvailable ? 'available' : request.status;
			const changed = newStatus !== request.status;

			if (changed) {
				await prisma.bookRequest.update({
					where: { id: requestId },
					data: {
						status: newStatus,
						lastChecked: new Date(),
					},
				});
			} else {
				// Update lastChecked even if status didn't change
				await prisma.bookRequest.update({
					where: { id: requestId },
					data: { lastChecked: new Date() },
				});
			}

			return {
				requestId,
				instanceId: request.instanceId,
				previousStatus: request.status,
				newStatus,
				changed,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			// Update lastChecked and record error
			await prisma.bookRequest.update({
				where: { id: requestId },
				data: {
					lastChecked: new Date(),
					errorMessage,
				},
			});

			return {
				requestId,
				instanceId: request.instanceId,
				previousStatus: request.status,
				newStatus: request.status,
				changed: false,
				error: errorMessage,
			};
		}
	}

	/**
	 * Sync statuses for all requests of a specific book.
	 */
	async syncBookRequests(bookId: string): Promise<SyncResult[]> {
		const requests = await prisma.bookRequest.findMany({
			where: {
				bookId,
				status: { in: ['searching', 'downloading'] },
			},
		});

		const results: SyncResult[] = [];
		for (const request of requests) {
			const result = await this.syncRequest(request.id);
			results.push(result);
		}

		return results;
	}

	/**
	 * Sync statuses for all in-progress requests.
	 * Returns summary of changes.
	 */
	async syncAllInProgress(): Promise<{
		total: number;
		changed: number;
		nowAvailable: number;
		errors: number;
	}> {
		const requests = await prisma.bookRequest.findMany({
			where: {
				status: { in: ['searching', 'downloading'] },
			},
		});

		let total = 0;
		let changed = 0;
		let nowAvailable = 0;
		let errors = 0;

		for (const request of requests) {
			const result = await this.syncRequest(request.id);
			total++;

			if (result.error) {
				errors++;
			} else if (result.changed) {
				changed++;
				if (result.newStatus === 'available') {
					nowAvailable++;
				}
			}
		}

		return { total, changed, nowAvailable, errors };
	}

	/**
	 * Get all requests that need status sync.
	 */
	async getRequestsNeedingSync(): Promise<
		Array<{
			id: string;
			bookId: string;
			instanceId: string;
			status: string;
			lastChecked: Date | null;
		}>
	> {
		const requests = await prisma.bookRequest.findMany({
			where: {
				status: { in: ['searching', 'downloading'] },
				externalId: { not: null },
			},
			select: {
				id: true,
				bookId: true,
				instanceId: true,
				status: true,
				lastChecked: true,
			},
			orderBy: { lastChecked: 'asc' },
		});

		return requests;
	}
}

// Default singleton instance
let defaultService: StatusSyncService | null = null;

export function getStatusSyncService(): StatusSyncService {
	if (!defaultService) {
		defaultService = new StatusSyncService();
	}
	return defaultService;
}

export function resetStatusSyncService(): void {
	defaultService = null;
}
