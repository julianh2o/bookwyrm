import { prisma } from '../../db';
import type { RequestPhase, RequestState, RequestStatus } from './state';

export type EventLevel = 'info' | 'warn' | 'error';

/** Keep the hover history short and the table small */
const MAX_EVENTS_PER_REQUEST = 25;

export async function recordEvent(requestId: string, phase: string, level: EventLevel, message: string): Promise<void> {
	await prisma.requestEvent.create({ data: { requestId, phase, level, message: message.slice(0, 1000) } });
	const stale = await prisma.requestEvent.findMany({
		where: { requestId },
		orderBy: { createdAt: 'desc' },
		skip: MAX_EVENTS_PER_REQUEST,
		select: { id: true },
	});
	if (stale.length > 0) {
		await prisma.requestEvent.deleteMany({ where: { id: { in: stale.map((e) => e.id) } } });
	}
}

/** Human wording for a state change, used as the event message */
export function describeState(state: {
	status: RequestStatus;
	phase: RequestPhase;
	errorMessage?: string | null;
}): string {
	switch (state.status) {
		case 'available':
			return 'Downloaded and imported';
		case 'downloading':
			return 'Downloading';
		case 'importing':
			return 'Download finished, importing';
		case 'searching':
			return 'Searching for a release';
		case 'wanted':
			return 'Nothing grabbed yet; Readarr keeps watching for a release';
		case 'adding':
			return 'Adding to Readarr';
		case 'pending':
			return 'Waiting to be sent to Readarr';
		case 'error':
			return state.errorMessage ?? 'Something went wrong';
	}
	return state.status;
}

interface CurrentRequest {
	id: string;
	status: string;
	phase: string;
	errorMessage: string | null;
}

/**
 * Persist a new state for a request. Writes an event only when something a human
 * would care about changed (status, phase or the error text), not on every poll.
 */
export async function applyState(
	request: CurrentRequest,
	state: Partial<RequestState> & { status: RequestStatus; phase: RequestPhase },
	extra: Record<string, unknown> = {},
): Promise<boolean> {
	const errorMessage = state.errorMessage ?? null;
	const meaningfulChange =
		request.status !== state.status || request.phase !== state.phase || request.errorMessage !== errorMessage;

	await prisma.bookRequest.update({
		where: { id: request.id },
		data: {
			status: state.status,
			phase: state.phase,
			errorMessage,
			...(state.progress !== undefined ? { progress: state.progress } : {}),
			...(state.queueId !== undefined ? { queueId: state.queueId } : {}),
			...(state.downloadId !== undefined ? { downloadId: state.downloadId } : {}),
			...(state.outputPath !== undefined ? { outputPath: state.outputPath } : {}),
			...(state.status === 'error' && meaningfulChange ? { lastErrorAt: new Date() } : {}),
			lastChecked: new Date(),
			...extra,
		},
	});

	if (meaningfulChange) {
		await recordEvent(request.id, state.phase, state.status === 'error' ? 'error' : 'info', describeState(state));
	}
	return meaningfulChange;
}
