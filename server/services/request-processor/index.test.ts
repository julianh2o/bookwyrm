import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestProcessor, pickQualityProfile } from './index';
import { prisma } from '../../db';
import type { ReadarrInstance } from '../../config/readarr';
import type { ReadarrClient, ReadarrBook } from '../readarr';
import { ReadarrTimeoutError } from '../readarr/client';

vi.mock('../../config/readarr', () => ({
	getInstanceById: vi.fn(),
}));

vi.mock('../../db', () => ({
	prisma: {
		bookRequest: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
		book: { update: vi.fn() },
		requestEvent: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
	},
}));

import { getInstanceById } from '../../config/readarr';

const instance: ReadarrInstance = {
	id: 'fiction-audio',
	name: 'Fiction Audiobooks',
	url: 'https://readarr.example.com',
	apiKey: 'test-key',
	type: 'audio',
	category: 'fiction',
	enabled: true,
};

const baseBook = {
	id: 'book-1',
	title: 'The Martian',
	author: 'Andy Weir',
	isbn: null,
	category: 'fiction',
	coverUrl: null,
	notes: null,
	metadataId: null as string | null,
	metadataProvider: null as string | null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

function makeRequest(book = baseBook) {
	return {
		id: 'request-1',
		bookId: book.id,
		instanceId: 'fiction-audio',
		status: 'pending',
		phase: 'add',
		externalId: null,
		errorMessage: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		lastChecked: null,
		book,
	};
}

function readarrBook(overrides: Partial<ReadarrBook> = {}): ReadarrBook {
	return {
		id: 42,
		title: 'The Martian',
		authorTitle: 'Andy Weir - The Martian',
		seriesTitle: '',
		disambiguation: '',
		authorId: 7,
		foreignBookId: 'work-1',
		titleSlug: 'the-martian',
		monitored: true,
		anyEditionOk: true,
		ratings: { votes: 0, value: 0, popularity: 0 },
		pageCount: 0,
		genres: [],
		images: [],
		links: [],
		added: '',
		author: { authorName: 'Andy Weir', foreignAuthorId: 'author-weir' } as ReadarrBook['author'],
		...overrides,
	};
}

/** The last data written to the request */
function lastUpdate() {
	const calls = vi.mocked(prisma.bookRequest.update).mock.calls;
	return calls[calls.length - 1][0].data as Record<string, unknown>;
}

describe('RequestProcessor', () => {
	let processor: RequestProcessor;
	let client: Record<string, ReturnType<typeof vi.fn>>;

	beforeEach(() => {
		vi.clearAllMocks();
		client = {
			getBooks: vi.fn().mockResolvedValue([]),
			updateBook: vi.fn(),
			monitorBooks: vi.fn(),
			searchBook: vi.fn().mockResolvedValue({ id: 1 }),
			searchBooks: vi.fn().mockResolvedValue([]),
			searchAuthors: vi.fn().mockResolvedValue([]),
			getQualityProfiles: vi.fn().mockResolvedValue([{ id: 1, name: 'Any' }]),
			getMetadataProfiles: vi.fn().mockResolvedValue([{ id: 2, name: 'Standard' }]),
			getRootFolders: vi.fn().mockResolvedValue([{ id: 1, path: '/books', accessible: true, freeSpace: 0 }]),
			addAndSearchBook: vi.fn(),
		};
		processor = new RequestProcessor({ createClient: () => client as unknown as ReadarrClient });
		vi.mocked(getInstanceById).mockReturnValue(instance);
	});

	it('returns an error when the request does not exist', async () => {
		vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(null);
		const result = await processor.processRequest('missing');
		expect(result).toMatchObject({ success: false, status: 'error', errorMessage: 'Request not found' });
	});

	it('records an error when the instance is unknown or disabled', async () => {
		vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(makeRequest() as never);
		vi.mocked(getInstanceById).mockReturnValue({ ...instance, enabled: false });
		const result = await processor.processRequest('request-1');
		expect(result.status).toBe('error');
		expect(result.errorMessage).toContain('disabled');
		expect(lastUpdate()).toMatchObject({ status: 'error', phase: 'add' });
	});

	it('links to a book that is already in Readarr instead of adding it again', async () => {
		vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(
			makeRequest({ ...baseBook, metadataId: 'work-1', metadataProvider: 'rreading-glasses' }) as never,
		);
		client.getBooks.mockResolvedValue([readarrBook({ monitored: false })]);

		const result = await processor.processRequest('request-1');

		expect(result).toMatchObject({ success: true, status: 'searching', externalId: '42' });
		expect(client.monitorBooks).toHaveBeenCalledWith([42]);
		expect(client.updateBook).not.toHaveBeenCalled();
		expect(client.searchBook).toHaveBeenCalledWith([42]);
		expect(client.addAndSearchBook).not.toHaveBeenCalled();
		expect(lastUpdate()).toMatchObject({ status: 'searching', phase: 'search', externalId: '42' });
	});

	it('prefers the search result whose work id matches the metadata id', async () => {
		vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(
			makeRequest({ ...baseBook, metadataId: '123', metadataProvider: 'rreading-glasses' }) as never,
		);
		client.searchBooks.mockResolvedValue([
			readarrBook({ foreignBookId: '999', title: 'The Martian' }),
			readarrBook({ foreignBookId: '123', title: 'The Martian (Classroom Edition)' }),
		]);
		client.addAndSearchBook.mockResolvedValue({ book: { id: 77, titleSlug: 'x' }, author: {}, commandId: 1 });

		const result = await processor.processRequest('request-1');

		expect(client.searchBooks).toHaveBeenCalledWith('work:123');
		expect(client.addAndSearchBook.mock.calls[0][0]).toBe('123');
		expect(result).toMatchObject({ success: true, externalId: '77' });
	});

	it('does not add an unrelated book when nothing matches', async () => {
		vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(makeRequest() as never);
		client.searchBooks.mockResolvedValue([readarrBook({ title: 'Project Hail Mary', foreignBookId: 'other' })]);

		const result = await processor.processRequest('request-1');

		expect(result.status).toBe('error');
		expect(result.errorMessage).toContain("didn't return a match");
		expect(client.addAndSearchBook).not.toHaveBeenCalled();
	});

	it('looks up the author when the search result has no author id', async () => {
		vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(makeRequest() as never);
		client.searchBooks.mockResolvedValue([readarrBook({ author: undefined })]);
		client.searchAuthors.mockResolvedValue([{ authorName: 'Andy Weir', foreignAuthorId: 'author-weir' }]);
		client.addAndSearchBook.mockResolvedValue({ book: { id: 5, titleSlug: 's' }, author: {}, commandId: 1 });

		const result = await processor.processRequest('request-1');

		expect(client.searchAuthors).toHaveBeenCalledWith('Andy Weir');
		expect(client.addAndSearchBook.mock.calls[0][1]).toBe('author-weir');
		expect(result.success).toBe(true);
	});

	it('explains a timeout and says the next check may still find it', async () => {
		vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(makeRequest() as never);
		client.searchBooks.mockResolvedValue([readarrBook()]);
		client.addAndSearchBook.mockRejectedValue(
			new ReadarrTimeoutError("Readarr didn't answer within 180s (POST /api/v1/author)"),
		);

		const result = await processor.processRequest('request-1');

		expect(result.status).toBe('error');
		expect(result.errorMessage).toContain('next check will pick it up');
		expect(lastUpdate()).toMatchObject({ status: 'error', phase: 'add' });
		expect(prisma.requestEvent.create).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ level: 'error', phase: 'add' }) }),
		);
	});

	it('marks the request as adding before talking to Readarr', async () => {
		vi.mocked(prisma.bookRequest.findUnique).mockResolvedValue(makeRequest() as never);
		await processor.processRequest('request-1');
		expect(vi.mocked(prisma.bookRequest.update).mock.calls[0][0].data).toMatchObject({
			status: 'adding',
			phase: 'add',
		});
	});
});

describe('RequestProcessor matching', () => {
	it('never matches an omnibus or a namesake by another author', async () => {
		const processor = new RequestProcessor({ createClient: () => ({}) as ReadarrClient });
		const match = (
			processor as unknown as {
				findBestMatch: (r: ReadarrBook[], t: string, a: string, m?: string | null) => ReadarrBook | null;
			}
		).findBestMatch.bind(processor);
		const omnibus = readarrBook({ title: 'Project Hail Mary / Artemis/ The Martian' });
		const namesake = readarrBook({
			title: 'Piranesi',
			author: { authorName: 'Nicholas Penny' } as ReadarrBook['author'],
		});
		const right = readarrBook({
			title: 'Piranesi: A Novel',
			author: { authorName: 'Susanna Clarke' } as ReadarrBook['author'],
		});
		expect(match([omnibus], 'The Martian', 'Andy Weir')).toBeNull();
		expect(match([namesake, right], 'Piranesi', 'Susanna Clarke')).toBe(right);
	});
});

describe('pickQualityProfile', () => {
	const profiles = [
		{ id: 1, name: 'eBook' },
		{ id: 2, name: 'Spoken' },
	];
	it('uses the Spoken profile for audiobook instances and eBook for ebook ones', () => {
		expect(pickQualityProfile(profiles, 'audio').id).toBe(2);
		expect(pickQualityProfile(profiles, 'ebook').id).toBe(1);
	});
});
