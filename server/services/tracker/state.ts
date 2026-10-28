import type { ReadarrBook, ReadarrQueueItem } from '../readarr/types';

export type RequestPhase = 'add' | 'search' | 'download' | 'import' | 'available';

export type RequestStatus =
	| 'pending' // created, not yet sent to Readarr
	| 'adding' // being added to Readarr right now
	| 'searching' // a search was just triggered
	| 'wanted' // monitored in Readarr, nothing grabbed yet (Readarr keeps watching RSS)
	| 'downloading'
	| 'importing'
	| 'available'
	| 'error';

export interface RequestState {
	status: RequestStatus;
	phase: RequestPhase;
	errorMessage: string | null;
	progress: number | null;
	queueId: number | null;
	downloadId: string | null;
	outputPath: string | null;
}

/** How long after triggering a search we still call it "searching" rather than "wanted" */
export const SEARCH_GRACE_MS = 15 * 60 * 1000;

const IMPORT_STATES = new Set(['importPending', 'importing', 'importBlocked', 'importFailed', 'imported']);
const BAD_IMPORT_STATES = new Set(['importBlocked', 'importFailed']);

/** Flatten Readarr's statusMessages into one short, readable line */
export function summarizeQueueMessages(item: ReadarrQueueItem): string | null {
	const messages: string[] = [];
	if (item.errorMessage) messages.push(item.errorMessage);
	for (const group of item.statusMessages ?? []) {
		for (const message of group.messages ?? []) {
			if (!messages.includes(message)) messages.push(message);
		}
	}
	if (messages.length === 0) return null;
	const joined = messages.slice(0, 3).join(' · ');
	return messages.length > 3 ? `${joined} (+${messages.length - 3} more)` : joined;
}

export function hasFiles(book: ReadarrBook): boolean {
	return (book.statistics?.bookFileCount ?? 0) > 0;
}

/**
 * Work out where a request stands from what Readarr reports.
 * Pure: no I/O, so it can be unit-tested against recorded Readarr payloads.
 */
export function computeState(
	book: ReadarrBook,
	queueItem: ReadarrQueueItem | undefined,
	opts: { lastSearchAt?: Date | null; now?: Date } = {},
): RequestState {
	const now = opts.now ?? new Date();
	const base: RequestState = {
		status: 'wanted',
		phase: 'search',
		errorMessage: null,
		progress: null,
		queueId: null,
		downloadId: null,
		outputPath: null,
	};

	if (hasFiles(book)) {
		return { ...base, status: 'available', phase: 'available', progress: 1 };
	}

	if (queueItem) {
		const withQueue = {
			...base,
			queueId: queueItem.id,
			downloadId: queueItem.downloadId ?? null,
			outputPath: queueItem.outputPath ?? null,
		};
		const message = summarizeQueueMessages(queueItem);
		const state = queueItem.trackedDownloadState ?? '';
		const finishedDownloading = queueItem.status === 'completed' || IMPORT_STATES.has(state);

		if (finishedDownloading) {
			const bad = BAD_IMPORT_STATES.has(state) || queueItem.trackedDownloadStatus === 'error';
			const warned = queueItem.trackedDownloadStatus === 'warning';
			return {
				...withQueue,
				phase: 'import',
				status: bad || warned ? 'error' : 'importing',
				errorMessage: bad || warned ? (message ?? 'Readarr could not import the download') : null,
				progress: 1,
			};
		}

		const size = queueItem.size || 0;
		const progress = size > 0 ? Math.max(0, Math.min(1, 1 - queueItem.sizeleft / size)) : null;
		const failed =
			queueItem.status === 'failed' ||
			queueItem.trackedDownloadStatus === 'error' ||
			state === 'failed' ||
			state === 'failedPending';
		const warned = queueItem.status === 'warning' || queueItem.trackedDownloadStatus === 'warning';
		return {
			...withQueue,
			phase: 'download',
			status: failed || warned ? 'error' : 'downloading',
			errorMessage: failed || warned ? (message ?? `Download ${queueItem.status}`) : null,
			progress,
		};
	}

	if (!book.monitored) {
		return {
			...base,
			status: 'error',
			errorMessage: 'Not monitored in Readarr, so it will never be searched for',
		};
	}

	const lastSearchAt = opts.lastSearchAt ?? null;
	if (lastSearchAt && now.getTime() - lastSearchAt.getTime() < SEARCH_GRACE_MS) {
		return { ...base, status: 'searching' };
	}

	return base;
}

/** Lowercase, drop subtitles/series info and punctuation so "Piranesi: A Novel" matches "Piranesi" */
export function normalizeTitle(title: string): string {
	return title
		.toLowerCase()
		.replace(/\(.*?\)|\[.*?\]/g, ' ')
		.split(/[:–—]/)[0]
		.replace(/^(the|a|an)\s+/, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export function normalizeAuthor(author: string): string {
	return author
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export function bookKey(title: string, author: string): string {
	return `${normalizeTitle(title)}|${normalizeAuthor(author)}`;
}

/** "Kate Bornstein, Kate Bornstein" vs "Kate Bornstein", or "Roger Fisher" vs "Roger Fisher, William Ury" */
export function authorsOverlap(a: string, b: string): boolean {
	const split = (s: string) =>
		new Set(
			s
				.split(/,|&|\band\b/i)
				.map(normalizeAuthor)
				.filter(Boolean),
		);
	const left = split(a);
	for (const name of split(b)) if (left.has(name)) return true;
	return false;
}
