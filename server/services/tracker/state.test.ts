import { describe, it, expect } from 'vitest';
import { computeState, normalizeTitle, authorsOverlap, SEARCH_GRACE_MS } from './state';
import type { ReadarrBook, ReadarrQueueItem } from '../readarr/types';

const book = (overrides: Partial<ReadarrBook> = {}): ReadarrBook =>
	({
		id: 64,
		title: 'Never Split the Difference',
		monitored: true,
		statistics: { bookFileCount: 0 },
		...overrides,
	}) as ReadarrBook;

const queue = (overrides: Partial<ReadarrQueueItem> = {}): ReadarrQueueItem => ({
	id: 9,
	title: 'Never Split the Difference - Chris Voss',
	size: 1000,
	sizeleft: 250,
	status: 'downloading',
	trackedDownloadStatus: 'ok',
	trackedDownloadState: 'downloading',
	downloadId: 'ABC',
	outputPath: '/downloads/x',
	...overrides,
});

describe('computeState', () => {
	it('is available once Readarr has a file', () => {
		expect(computeState(book({ statistics: { bookFileCount: 1 } } as Partial<ReadarrBook>), queue())).toMatchObject({
			status: 'available',
			phase: 'available',
		});
	});

	it('reports download progress', () => {
		expect(computeState(book(), queue())).toMatchObject({
			status: 'downloading',
			phase: 'download',
			progress: 0.75,
			queueId: 9,
		});
	});

	it('turns a failed import into an import-phase error with Readarr’s reasons (real payload shape)', () => {
		const state = computeState(
			book(),
			queue({
				sizeleft: 0,
				status: 'completed',
				trackedDownloadStatus: 'warning',
				trackedDownloadState: 'importFailed',
				statusMessages: [
					{ title: 'a.azw3', messages: ['Failed to import book.'] },
					{ title: 'a.epub', messages: ['Book has already been imported'] },
					{ title: 'a.mobi', messages: ['Failed to import book.'] },
				],
			}),
		);
		expect(state).toMatchObject({ status: 'error', phase: 'import', outputPath: '/downloads/x', downloadId: 'ABC' });
		expect(state.errorMessage).toBe('Failed to import book. · Book has already been imported');
	});

	it('treats a pending import as in progress, not an error', () => {
		expect(
			computeState(book(), queue({ sizeleft: 0, status: 'completed', trackedDownloadState: 'importPending' })),
		).toMatchObject({ status: 'importing', phase: 'import', errorMessage: null });
	});

	it('flags a failed download', () => {
		expect(
			computeState(
				book(),
				queue({ status: 'failed', trackedDownloadStatus: 'error', errorMessage: 'Unpacking failed' }),
			),
		).toMatchObject({ status: 'error', phase: 'download', errorMessage: 'Unpacking failed' });
	});

	it('is "searching" right after a search, then "wanted"', () => {
		const now = new Date('2026-10-28T12:00:00Z');
		const recent = new Date(now.getTime() - 60_000);
		const old = new Date(now.getTime() - SEARCH_GRACE_MS - 1);
		expect(computeState(book(), undefined, { lastSearchAt: recent, now }).status).toBe('searching');
		expect(computeState(book(), undefined, { lastSearchAt: old, now }).status).toBe('wanted');
	});

	it('calls out an unmonitored book, since Readarr will never look for it', () => {
		expect(computeState(book({ monitored: false }), undefined)).toMatchObject({ status: 'error', phase: 'search' });
	});
});

describe('matching helpers', () => {
	it('ignores subtitles, series info and leading articles', () => {
		expect(normalizeTitle('Unlearning Shame: How We Can Reject Self-Blame Culture')).toBe('unlearning shame');
		expect(normalizeTitle('The Martian (Classroom Edition)')).toBe('martian');
	});

	it('matches co-authored and duplicated author strings', () => {
		expect(authorsOverlap('Kate Bornstein, Kate Bornstein', 'Kate Bornstein')).toBe(true);
		expect(authorsOverlap('Roger Fisher, William Ury', 'Roger Fisher')).toBe(true);
		expect(authorsOverlap('Nicholas Penny', 'Susanna Clarke')).toBe(false);
	});
});
