import { prisma } from '../../db';
import { getInstanceById, type ReadarrInstance } from '../../config/readarr';
import { ReadarrClient } from '../readarr';
import type { ReadarrManualImportItem } from '../readarr/types';
import { RequestProcessor } from '../request-processor';
import { applyState, recordEvent } from './events';
import { getTracker } from './index';

const AUDIO_EXT = /\.(m4b|m4a|mp3|flac|ogg|opus|aac|wma)$/i;
const EBOOK_PREFERENCE = ['.epub', '.azw3', '.mobi', '.pdf', '.azw', '.cbz', '.txt'];
/** Rejections that mean "this file is fine to import, Readarr just couldn't match it by name" */
const MATCHING_REJECTION = /couldn't find similar book|unknown author|unknown book|not parse|matched to/i;

export class RetryError extends Error {
	constructor(
		message: string,
		public readonly httpStatus = 400,
	) {
		super(message);
	}
}

let createClient = (instance: ReadarrInstance) =>
	new ReadarrClient({ url: instance.url, apiKey: instance.apiKey, timeout: 60000 });
let processor = new RequestProcessor();

/** Test hooks */
export function setActionDeps(deps: {
	createClient?: (instance: ReadarrInstance) => ReadarrClient;
	processor?: RequestProcessor;
}) {
	if (deps.createClient) createClient = deps.createClient;
	if (deps.processor) processor = deps.processor;
}

// ---- Add queue: one add at a time per instance, so we don't stack slow author adds on Readarr ----

const addChains = new Map<string, Promise<void>>();
const queuedAdds = new Set<string>();

export function enqueueAdd(requestId: string, instanceId: string): void {
	if (queuedAdds.has(requestId)) return;
	queuedAdds.add(requestId);
	const previous = addChains.get(instanceId) ?? Promise.resolve();
	const next = previous
		.then(async () => {
			try {
				await processor.processRequest(requestId);
			} catch (error) {
				console.error(`[AddQueue] ${requestId} crashed:`, error);
			} finally {
				queuedAdds.delete(requestId);
				getTracker().schedule(instanceId, 5000);
			}
		})
		.catch(() => undefined);
	addChains.set(instanceId, next);
}

export function isAddQueued(requestId: string): boolean {
	return queuedAdds.has(requestId);
}

/** Resolves when every queued add has finished (used by tests and the CLI's --wait) */
export async function drainAddQueue(): Promise<void> {
	await Promise.all([...addChains.values()]);
}

// ---- Retry: redo just the phase the request is stuck in ----

export async function retryRequest(requestId: string): Promise<{ action: string }> {
	const request = await prisma.bookRequest.findUnique({ where: { id: requestId }, include: { book: true } });
	if (!request) throw new RetryError('Request not found', 404);
	const instance = getInstanceById(request.instanceId);
	if (!instance || !instance.enabled) throw new RetryError(`Instance ${request.instanceId} is not available`);

	if (request.status === 'available') throw new RetryError('Already downloaded; nothing to retry');
	if (request.status === 'adding' || isAddQueued(requestId)) throw new RetryError('Already being added to Readarr');

	await prisma.bookRequest.update({ where: { id: requestId }, data: { attempts: { increment: 1 } } });

	// Add phase (or never linked to a Readarr book): run the whole add again, in the background
	if (request.phase === 'add' || !request.externalId) {
		await prisma.bookRequest.update({
			where: { id: requestId },
			data: { status: 'pending', phase: 'add', errorMessage: null, externalId: null, externalSlug: null },
		});
		await recordEvent(requestId, 'add', 'info', 'Retry: adding to Readarr again');
		enqueueAdd(requestId, instance.id);
		return { action: 'add' };
	}

	const client = createClient(instance);
	const readarrBookId = parseInt(request.externalId, 10);
	try {
		if (request.phase === 'download' && request.queueId) {
			await client.removeQueueItem(request.queueId, { removeFromClient: true, blocklist: true });
			await recordEvent(
				requestId,
				'download',
				'info',
				'Retry: removed the failed download and blocklisted that release',
			);
			await search(client, request, readarrBookId);
			return { action: 'redownload' };
		}

		if (request.phase === 'import' && request.outputPath) {
			const result = await forceImport(client, instance, request, readarrBookId);
			return { action: result };
		}

		await search(client, request, readarrBookId);
		return { action: 'search' };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await applyState(request, {
			status: 'error',
			phase: request.phase as 'search' | 'download' | 'import',
			errorMessage: `Retry failed: ${message}`,
		});
		throw new RetryError(message, 502);
	} finally {
		getTracker().schedule(instance.id, 5000);
	}
}

async function search(
	client: ReadarrClient,
	request: { id: string; status: string; phase: string; errorMessage: string | null },
	readarrBookId: number,
): Promise<void> {
	const book = await client.getBook(readarrBookId);
	if (!book.monitored) {
		book.monitored = true;
		await client.updateBook(book);
	}
	await client.searchBook([readarrBookId]);
	await applyState(
		request,
		{ status: 'searching', phase: 'search', errorMessage: null, queueId: null, downloadId: null, outputPath: null },
		{ lastSearchAt: new Date() },
	);
}

function pickFiles(items: ReadarrManualImportItem[], instance: ReadarrInstance): ReadarrManualImportItem[] {
	const importable = items.filter((f) => f.rejections.every((r) => MATCHING_REJECTION.test(r.reason)));
	if (instance.type === 'audio') {
		return importable.filter((f) => AUDIO_EXT.test(f.path));
	}
	const rank = (path: string) => {
		const i = EBOOK_PREFERENCE.findIndex((ext) => path.toLowerCase().endsWith(ext));
		return i === -1 ? 99 : i;
	};
	const best = [...importable].sort((a, b) => rank(a.path) - rank(b.path))[0];
	return best && rank(best.path) < 99 ? [best] : [];
}

/**
 * Import a finished download as the book we grabbed it for, even when Readarr couldn't match it by name.
 * This is what you'd do by hand in Readarr's "Manual Import" dialog.
 */
async function forceImport(
	client: ReadarrClient,
	instance: ReadarrInstance,
	request: {
		id: string;
		status: string;
		phase: string;
		errorMessage: string | null;
		outputPath: string | null;
		downloadId: string | null;
		queueId: number | null;
	},
	readarrBookId: number,
): Promise<string> {
	const items = await client.getManualImport(request.outputPath!, request.downloadId ?? undefined);
	const files = pickFiles(items, instance);

	if (files.length === 0) {
		const reasons = [...new Set(items.flatMap((f) => f.rejections.map((r) => r.reason)))];
		if (items.length === 0 || reasons.some((r) => /already been imported|not an upgrade|existing/i.test(r))) {
			// Nothing usable left in the download: drop the queue row (keep the files) and search for a fresh copy
			if (request.queueId) await client.removeQueueItem(request.queueId, { removeFromClient: false, blocklist: false });
			await recordEvent(
				request.id,
				'import',
				'warn',
				items.length === 0
					? `Retry: nothing left to import in ${request.outputPath}; searching again`
					: `Retry: Readarr won't import these files (${reasons[0]}); searching again`,
			);
			await search(client, request, readarrBookId);
			return 'search';
		}
		throw new Error(
			`No importable ${instance.type === 'audio' ? 'audio' : 'ebook'} files: ${reasons.join('; ') || 'unknown'}`,
		);
	}

	const book = await client.getBook(readarrBookId);
	const editions = await client.getEditions(readarrBookId);
	const edition = editions.find((e) => e.monitored) ?? editions[0];

	const command = await client.manualImport(
		files.map((f) => ({
			path: f.path,
			authorId: book.authorId,
			bookId: readarrBookId,
			foreignEditionId: edition?.foreignEditionId ?? null,
			quality: f.quality,
			releaseGroup: f.releaseGroup ?? null,
			downloadId: request.downloadId ?? f.downloadId,
			indexerFlags: f.indexerFlags ?? 0,
		})),
	);
	await applyState(request, { status: 'importing', phase: 'import', errorMessage: null });
	await recordEvent(
		request.id,
		'import',
		'info',
		`Retry: told Readarr to import ${files.length} file${files.length === 1 ? '' : 's'} as this book (command ${command.id})`,
	);
	return 'import';
}
