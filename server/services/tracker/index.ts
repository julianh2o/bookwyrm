import { prisma } from '../../db';
import { getEnabledInstances, getInstanceById, type ReadarrInstance } from '../../config/readarr';
import { ReadarrClient } from '../readarr';
import type { ReadarrBook, ReadarrQueueItem } from '../readarr/types';
import { applyState, recordEvent } from './events';
import {
	authorsOverlap,
	computeState,
	normalizeTitle,
	hasFiles,
	type RequestPhase,
	type RequestState,
	type RequestStatus,
} from './state';

/** Readarr's history eventType for "grabbed" */
const HISTORY_GRABBED = 1;
/** An "adding" request older than this is assumed to have been interrupted (e.g. a restart) */
const STALE_ADDING_MS = 10 * 60 * 1000;

export interface InstanceHealth {
	instanceId: string;
	instanceName: string;
	ok: boolean;
	lastPollAt: string | null;
	lastSuccessAt: string | null;
	durationMs: number | null;
	error: string | null;
	booksInLibrary: number;
	booksTracked: number;
	queueItems: number;
	/** Queue items with no grab in this instance's history: usually downloads that belong to another instance */
	foreignQueueItems: number;
}

export interface PollResult {
	instanceId: string;
	booksCreated: number;
	requestsCreated: number;
	requestsLinked: number;
	requestsChanged: number;
	pendingQueued: number;
	error?: string;
}

export interface TrackerOptions {
	createClient?: (instance: ReadarrInstance) => ReadarrClient;
	/** Called for pending requests the poll finds (wired to the add queue by the server) */
	onPendingRequest?: (requestId: string, instanceId: string) => void;
}

function coverUrl(book: ReadarrBook): string | null {
	const cover = book.images?.find((img) => img.coverType === 'cover');
	return cover?.remoteUrl || cover?.url || book.remoteCover || null;
}

/**
 * Keeps BookWyrm in step with every Readarr instance: imports books added in Readarr directly,
 * links requests to Readarr's ids, and moves each request through add → search → download → import → available.
 */
export class LibraryTracker {
	private createClient: (instance: ReadarrInstance) => ReadarrClient;
	private onPendingRequest?: (requestId: string, instanceId: string) => void;
	private running = new Map<string, Promise<PollResult>>();
	private scheduled = new Map<string, ReturnType<typeof setTimeout>>();
	private health = new Map<string, InstanceHealth>();
	private interval: ReturnType<typeof setInterval> | null = null;

	constructor(options: TrackerOptions = {}) {
		this.createClient =
			options.createClient ??
			((instance) => new ReadarrClient({ url: instance.url, apiKey: instance.apiKey, timeout: 60000 }));
		this.onPendingRequest = options.onPendingRequest;
	}

	setPendingHandler(handler: (requestId: string, instanceId: string) => void): void {
		this.onPendingRequest = handler;
	}

	/** Poll every instance now and then every `intervalMs` */
	start(intervalMs: number): void {
		this.stop();
		void this.pollAll().catch((err) => console.error('[Tracker] Initial poll failed:', err));
		this.interval = setInterval(() => {
			void this.pollAll().catch((err) => console.error('[Tracker] Poll failed:', err));
		}, intervalMs);
	}

	stop(): void {
		if (this.interval) clearInterval(this.interval);
		this.interval = null;
		for (const t of this.scheduled.values()) clearTimeout(t);
		this.scheduled.clear();
	}

	/** Poll one instance soon (debounced), e.g. right after an add or retry */
	schedule(instanceId: string, delayMs = 3000): void {
		const existing = this.scheduled.get(instanceId);
		if (existing) clearTimeout(existing);
		this.scheduled.set(
			instanceId,
			setTimeout(() => {
				this.scheduled.delete(instanceId);
				const instance = getInstanceById(instanceId);
				if (instance) void this.pollInstance(instance).catch(() => undefined);
			}, delayMs),
		);
	}

	getHealth(): InstanceHealth[] {
		return getEnabledInstances().map(
			(i) =>
				this.health.get(i.id) ?? {
					instanceId: i.id,
					instanceName: i.name,
					ok: true,
					lastPollAt: null,
					lastSuccessAt: null,
					durationMs: null,
					error: null,
					booksInLibrary: 0,
					booksTracked: 0,
					queueItems: 0,
					foreignQueueItems: 0,
				},
		);
	}

	async pollAll(): Promise<PollResult[]> {
		const instances = getEnabledInstances();
		return Promise.all(instances.map((i) => this.pollInstance(i)));
	}

	/** One poll at a time per instance; a second caller shares the running poll */
	pollInstance(instance: ReadarrInstance): Promise<PollResult> {
		const running = this.running.get(instance.id);
		if (running) return running;
		const promise = this.doPoll(instance).finally(() => this.running.delete(instance.id));
		this.running.set(instance.id, promise);
		return promise;
	}

	private async doPoll(instance: ReadarrInstance): Promise<PollResult> {
		const started = Date.now();
		const result: PollResult = {
			instanceId: instance.id,
			booksCreated: 0,
			requestsCreated: 0,
			requestsLinked: 0,
			requestsChanged: 0,
			pendingQueued: 0,
		};
		const previous = this.health.get(instance.id);
		const client = this.createClient(instance);

		let books: ReadarrBook[];
		let queue: ReadarrQueueItem[];
		let authorNames: Map<number, string>;
		let grabbedBook: Map<string, number>;
		try {
			const [b, authors, q, grabs] = await Promise.all([
				client.getBooks(),
				client.getAuthors(),
				client.getQueue(),
				client.getHistory({ eventType: HISTORY_GRABBED, pageSize: 1000 }),
			]);
			books = b;
			queue = q;
			authorNames = new Map(authors.map((a) => [a.id!, a.authorName]));
			grabbedBook = new Map(grabs.filter((g) => g.downloadId).map((g) => [g.downloadId!, g.bookId]));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[Tracker] ${instance.name}: ${message}`);
			this.health.set(instance.id, {
				...(previous ?? this.getHealth().find((h) => h.instanceId === instance.id)!),
				ok: false,
				error: message,
				lastPollAt: new Date().toISOString(),
				durationMs: Date.now() - started,
			});
			result.error = message;
			return result;
		}

		// Map queue items to Readarr book ids. Readarr only fills bookId when it parsed the release;
		// otherwise we fall back to the grab history (downloadId → bookId).
		const queueByBook = new Map<number, ReadarrQueueItem>();
		let foreign = 0;
		for (const item of queue) {
			const bookId = item.bookId ?? (item.downloadId ? grabbedBook.get(item.downloadId) : undefined);
			if (!bookId) {
				foreign++;
				continue;
			}
			const current = queueByBook.get(bookId);
			// Prefer an active download over a leftover failed import of an older grab
			if (!current || (current.status === 'completed' && item.status !== 'completed')) {
				queueByBook.set(bookId, item);
			}
		}

		const readarrById = new Map(books.filter((b) => b.id).map((b) => [b.id!, b]));

		const dbBooks = await prisma.book.findMany({ include: { requests: true } });
		const byMetadataId = new Map<string, (typeof dbBooks)[number]>();
		const byTitle = new Map<string, Array<(typeof dbBooks)[number]>>();
		const indexTitle = (b: (typeof dbBooks)[number]) => {
			const key = normalizeTitle(b.title);
			byTitle.set(key, [...(byTitle.get(key) ?? []), b]);
		};
		for (const b of dbBooks) {
			if (b.metadataId) byMetadataId.set(b.metadataId, b);
			indexTitle(b);
		}
		const findByTitle = (title: string, author: string) =>
			byTitle.get(normalizeTitle(title))?.find((b) => authorsOverlap(b.author, author));
		const linkedExternalIds = new Set(
			dbBooks.flatMap((b) =>
				b.requests.filter((r) => r.instanceId === instance.id && r.externalId).map((r) => r.externalId!),
			),
		);

		// 1. Import / link books Readarr has that we don't track yet (monitored or downloaded only)
		for (const rb of books) {
			if (!rb.id || linkedExternalIds.has(String(rb.id))) continue;
			if (!rb.monitored && !hasFiles(rb)) continue;

			const authorName = authorNames.get(rb.authorId) ?? rb.author?.authorName ?? 'Unknown Author';
			let book = byMetadataId.get(rb.foreignBookId) ?? findByTitle(rb.title, authorName);

			if (!book) {
				const created = await prisma.book.create({
					data: {
						title: rb.title,
						author: authorName,
						category: instance.category,
						coverUrl: coverUrl(rb),
						metadataId: rb.foreignBookId,
						metadataProvider: 'readarr',
					},
				});
				book = { ...created, requests: [] };
				byMetadataId.set(rb.foreignBookId, book);
				indexTitle(book);
				result.booksCreated++;
			} else if (!book.coverUrl && coverUrl(rb)) {
				await prisma.book.update({ where: { id: book.id }, data: { coverUrl: coverUrl(rb) } });
			}

			const existing = book.requests.find((r) => r.instanceId === instance.id);
			if (existing && existing.externalId) continue; // tracked under a different Readarr id; leave it alone

			const state = computeState(rb, queueByBook.get(rb.id), { lastSearchAt: existing?.lastSearchAt });
			if (existing) {
				// e.g. an add that timed out on our side but finished in Readarr
				await prisma.bookRequest.update({
					where: { id: existing.id },
					data: { externalId: String(rb.id), externalSlug: rb.titleSlug },
				});
				await recordEvent(existing.id, 'add', 'info', 'Found it in Readarr');
				await applyState(existing, state);
				existing.externalId = String(rb.id);
				result.requestsLinked++;
			} else {
				const request = await prisma.bookRequest.create({
					data: {
						bookId: book.id,
						instanceId: instance.id,
						externalId: String(rb.id),
						externalSlug: rb.titleSlug,
						status: state.status,
						phase: state.phase,
						errorMessage: state.errorMessage,
						progress: state.progress,
						queueId: state.queueId,
						downloadId: state.downloadId,
						outputPath: state.outputPath,
						lastChecked: new Date(),
						lastErrorAt: state.status === 'error' ? new Date() : null,
					},
				});
				await recordEvent(
					request.id,
					state.phase,
					state.status === 'error' ? 'error' : 'info',
					'Imported from Readarr library',
				);
				book.requests.push(request);
				result.requestsCreated++;
			}
			linkedExternalIds.add(String(rb.id));
		}

		// 2. Update every request we track for this instance
		const requests = await prisma.bookRequest.findMany({ where: { instanceId: instance.id } });
		for (const request of requests) {
			if (request.status === 'adding' && Date.now() - request.updatedAt.getTime() < STALE_ADDING_MS) continue;

			if (!request.externalId) {
				if (request.status === 'pending' || request.status === 'adding') {
					this.onPendingRequest?.(request.id, instance.id);
					result.pendingQueued++;
				}
				continue;
			}

			const rb = readarrById.get(parseInt(request.externalId, 10));
			if (!rb) {
				const changed = await applyState(request, {
					status: 'error',
					phase: 'add',
					errorMessage: 'This book is no longer in Readarr (removed there?). Retry adds it again.',
				});
				if (changed) result.requestsChanged++;
				continue;
			}

			let state: RequestState = computeState(rb, queueByBook.get(rb.id!), { lastSearchAt: request.lastSearchAt });

			// A download/import that vanished from the queue without producing a file: say why, and keep saying it
			if (state.status === 'wanted' && (request.phase === 'download' || request.phase === 'import')) {
				if (request.status === 'error') {
					state = {
						...state,
						status: 'error',
						phase: request.phase as RequestPhase,
						errorMessage: request.errorMessage,
					};
				} else {
					state = await this.explainDisappearance(client, rb.id!, state, request.phase as RequestPhase);
				}
			}

			const changed = await applyState(request, { ...state, status: state.status as RequestStatus });
			if (changed) result.requestsChanged++;
		}

		this.health.set(instance.id, {
			instanceId: instance.id,
			instanceName: instance.name,
			ok: true,
			lastPollAt: new Date().toISOString(),
			lastSuccessAt: new Date().toISOString(),
			durationMs: Date.now() - started,
			error: null,
			booksInLibrary: books.length,
			booksTracked: linkedExternalIds.size,
			queueItems: queue.length,
			foreignQueueItems: foreign,
		});
		if (result.booksCreated || result.requestsCreated || result.requestsLinked || result.requestsChanged) {
			console.log(`[Tracker] ${instance.name}:`, JSON.stringify(result));
		}
		return result;
	}

	/** Look at Readarr's history to explain why a download left the queue without a file */
	private async explainDisappearance(
		client: ReadarrClient,
		readarrBookId: number,
		state: RequestState,
		phase: RequestPhase,
	): Promise<RequestState> {
		try {
			const [latest] = await client.getHistory({ bookId: readarrBookId, pageSize: 5 });
			if (!latest) return state;
			const reason = latest.data?.message || latest.data?.reason || null;
			if (latest.eventType === 'downloadFailed') {
				return {
					...state,
					status: 'error',
					phase: 'download',
					errorMessage: `Download failed${reason ? `: ${reason}` : ''}`,
				};
			}
			if (latest.eventType === 'bookImportIncomplete' || latest.eventType === 'importFailed') {
				return {
					...state,
					status: 'error',
					phase: 'import',
					errorMessage: `Import failed${reason ? `: ${reason}` : ''}`,
				};
			}
			if (latest.eventType === 'downloadIgnored') {
				return { ...state, status: 'error', phase, errorMessage: 'Download was ignored in Readarr' };
			}
		} catch {
			// History is only for a nicer message; the plain "wanted" state is still correct
		}
		return state;
	}
}

let tracker: LibraryTracker | null = null;

export function getTracker(): LibraryTracker {
	if (!tracker) tracker = new LibraryTracker();
	return tracker;
}

export function resetTracker(): void {
	tracker?.stop();
	tracker = null;
}

export { computeState, normalizeTitle, bookKey } from './state';
export type { RequestPhase, RequestStatus, RequestState } from './state';
