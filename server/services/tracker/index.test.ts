import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../db';
import { LibraryTracker } from './index';
import type { ReadarrClient } from '../readarr';
import type { ReadarrBook, ReadarrQueueItem, ReadarrHistoryItem } from '../readarr/types';

// Uses the throwaway test database (see server/test-setup.ts) and the fixture instances.

function rb(id: number, title: string, overrides: Partial<ReadarrBook> = {}): ReadarrBook {
	return {
		id,
		title,
		authorTitle: '',
		seriesTitle: '',
		disambiguation: '',
		authorId: 1,
		foreignBookId: `w${id}`,
		titleSlug: `slug-${id}`,
		monitored: true,
		anyEditionOk: true,
		ratings: { votes: 0, value: 0, popularity: 0 },
		pageCount: 0,
		genres: [],
		images: [],
		links: [],
		added: '',
		statistics: { bookFileCount: 0 } as ReadarrBook['statistics'],
		...overrides,
	};
}

function fakeClient(data: {
	books: ReadarrBook[];
	queue?: ReadarrQueueItem[];
	grabs?: Partial<ReadarrHistoryItem>[];
	authors?: Array<{ id: number; authorName: string }>;
}) {
	return {
		getBooks: async () => data.books,
		getAuthors: async () => data.authors ?? [{ id: 1, authorName: 'Susanna Clarke' }],
		getQueue: async () => data.queue ?? [],
		getHistory: async () => data.grabs ?? [],
	} as unknown as ReadarrClient;
}

describe('LibraryTracker', () => {
	beforeEach(async () => {
		await prisma.requestEvent.deleteMany();
		await prisma.bookRequest.deleteMany();
		await prisma.book.deleteMany();
	});

	afterAll(async () => {
		await prisma.requestEvent.deleteMany();
		await prisma.bookRequest.deleteMany();
		await prisma.book.deleteMany();
	});

	const instance = {
		id: 'fiction-audio',
		name: 'Fiction Audiobooks',
		url: 'http://x',
		apiKey: 'k',
		type: 'audio' as const,
		category: 'fiction' as const,
		enabled: true,
	};

	it('imports monitored/downloaded books, skips the unmonitored backlog, and is idempotent', async () => {
		const client = fakeClient({
			books: [
				rb(1, 'Piranesi', { statistics: { bookFileCount: 1 } as ReadarrBook['statistics'] }),
				rb(2, 'Jonathan Strange & Mr Norrell'),
				rb(3, 'The Ladies of Grace Adieu', { monitored: false }),
			],
		});
		const tracker = new LibraryTracker({ createClient: () => client });

		const first = await tracker.pollInstance(instance);
		expect(first).toMatchObject({ booksCreated: 2, requestsCreated: 2 });
		const second = await tracker.pollInstance(instance);
		expect(second).toMatchObject({ booksCreated: 0, requestsCreated: 0, requestsChanged: 0 });

		const requests = await prisma.bookRequest.findMany({ include: { book: true }, orderBy: { externalId: 'asc' } });
		expect(requests.map((r) => [r.book.title, r.status, r.phase])).toEqual([
			['Piranesi', 'available', 'available'],
			['Jonathan Strange & Mr Norrell', 'wanted', 'search'],
		]);
	});

	it('ties an unmatched queue item to its book through the grab history', async () => {
		const client = fakeClient({
			books: [rb(2, 'Jonathan Strange & Mr Norrell')],
			queue: [
				{
					id: 5,
					bookId: null,
					title: 'Susanna Clarke - JS&MN',
					size: 100,
					sizeleft: 0,
					status: 'completed',
					trackedDownloadStatus: 'warning',
					trackedDownloadState: 'importFailed',
					statusMessages: [{ title: 'x.m4b', messages: ["Couldn't find similar book"] }],
					downloadId: 'DL1',
					outputPath: '/downloads/jsmn',
				},
				{
					id: 6,
					bookId: null,
					title: 'Someone else’s download',
					size: 1,
					sizeleft: 0,
					status: 'completed',
					downloadId: 'OTHER',
				},
			],
			grabs: [{ downloadId: 'DL1', bookId: 2, eventType: 'grabbed' }],
		});
		const tracker = new LibraryTracker({ createClient: () => client });
		await tracker.pollInstance(instance);

		const request = await prisma.bookRequest.findFirstOrThrow();
		expect(request).toMatchObject({
			status: 'error',
			phase: 'import',
			queueId: 5,
			outputPath: '/downloads/jsmn',
			errorMessage: "Couldn't find similar book",
		});
		expect(tracker.getHealth().find((h) => h.instanceId === 'fiction-audio')?.foreignQueueItems).toBe(1);
	});

	it('links a request whose add timed out once the book shows up in Readarr', async () => {
		const book = await prisma.book.create({
			data: { title: 'Piranesi', author: 'Susanna Clarke', category: 'fiction', metadataId: 'w1' },
		});
		const request = await prisma.bookRequest.create({
			data: { bookId: book.id, instanceId: 'fiction-audio', status: 'error', phase: 'add', errorMessage: 'timed out' },
		});
		const tracker = new LibraryTracker({ createClient: () => fakeClient({ books: [rb(1, 'Piranesi: A Novel')] }) });

		const result = await tracker.pollInstance(instance);

		expect(result).toMatchObject({ requestsLinked: 1, booksCreated: 0 });
		const after = await prisma.bookRequest.findUniqueOrThrow({ where: { id: request.id } });
		expect(after).toMatchObject({ externalId: '1', status: 'wanted', phase: 'search', errorMessage: null });
		const events = await prisma.requestEvent.findMany({ where: { requestId: request.id } });
		expect(events.map((e) => e.message)).toContain('Found it in Readarr');
	});

	it('reports an unreachable instance in health without throwing', async () => {
		const tracker = new LibraryTracker({
			createClient: () =>
				({
					getBooks: async () => {
						throw new Error("Couldn't reach Readarr at http://x: fetch failed");
					},
					getAuthors: async () => [],
					getQueue: async () => [],
					getHistory: async () => [],
				}) as unknown as ReadarrClient,
		});
		const result = await tracker.pollInstance(instance);
		expect(result.error).toContain("Couldn't reach Readarr");
		expect(tracker.getHealth().find((h) => h.instanceId === 'fiction-audio')).toMatchObject({ ok: false });
	});
});
