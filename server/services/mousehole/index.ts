/**
 * Mousehole keeps the MyAnonaMouse session cookie and seedbox IP fresh. When its cookie is missing or MAM rejects
 * it, MAM torrents sit "stalled with no connections" in qBittorrent, so BookWyrm surfaces Mousehole's state as a banner.
 * We only ever read GET {MOUSEHOLE_URL}/state and never pass the cookie on.
 */

export type MouseholeProblem = 'no-cookie' | 'mam-unreachable' | 'ip-update-failed' | 'mousehole-unreachable';

export interface MouseholeStatus {
	configured: boolean;
	ok: boolean;
	problem: MouseholeProblem | null;
	message: string | null;
	url: string | null;
	lastContactAt: string | null;
	checkedAt: string | null;
}

interface MouseholeState {
	hasCookie?: boolean;
	lastMamContact?: {
		at?: string;
		reached?: boolean;
		error?: string;
		ipUpdate?: { success?: boolean; msg?: string; httpStatus?: number };
	} | null;
}

const CACHE_MS = 60_000;
const TIMEOUT_MS = 10_000;

let cache: { at: number; status: MouseholeStatus } | null = null;

function cleanTime(t: string | undefined): string | null {
	if (!t) return null;
	// Mousehole prints Java-style zoned times: 2026-10-29T17:29:50.404+00:00[UTC]
	const iso = t.replace(/\[[^\]]*\]$/, '');
	return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
}

/** Pure mapping from Mousehole's /state body to a status (exported for tests). */
export function interpretState(state: MouseholeState, url: string): MouseholeStatus {
	const contact = state.lastMamContact ?? null;
	const base = { configured: true, url, lastContactAt: cleanTime(contact?.at), checkedAt: new Date().toISOString() };

	if (!state.hasCookie) {
		return {
			...base,
			ok: false,
			problem: 'no-cookie',
			message:
				'Mousehole has no MAM cookie set, so MAM torrents will stall. Paste a fresh mam_id cookie into Mousehole.',
		};
	}
	if (contact && contact.reached === false) {
		return {
			...base,
			ok: false,
			problem: 'mam-unreachable',
			message: `Mousehole couldn't reach MAM${contact.error ? `: ${contact.error}` : ''}. MAM downloads may stall.`,
		};
	}
	if (contact?.ipUpdate && contact.ipUpdate.success === false) {
		const detail = contact.ipUpdate.msg || (contact.ipUpdate.httpStatus ? `HTTP ${contact.ipUpdate.httpStatus}` : '');
		return {
			...base,
			ok: false,
			problem: 'ip-update-failed',
			message: `MAM rejected Mousehole's cookie/IP update${detail ? ` (${detail})` : ''}. The cookie probably needs replacing.`,
		};
	}
	return { ...base, ok: true, problem: null, message: null };
}

export async function getMouseholeStatus(force = false): Promise<MouseholeStatus> {
	const url = process.env.MOUSEHOLE_URL?.replace(/\/+$/, '');
	if (!url) {
		return {
			configured: false,
			ok: true,
			problem: null,
			message: null,
			url: null,
			lastContactAt: null,
			checkedAt: null,
		};
	}
	if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.status;

	let status: MouseholeStatus;
	try {
		const res = await fetch(`${url}/state`, { signal: globalThis.AbortSignal.timeout(TIMEOUT_MS) });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		status = interpretState((await res.json()) as MouseholeState, url);
	} catch (err) {
		status = {
			configured: true,
			ok: false,
			problem: 'mousehole-unreachable',
			message: `Can't reach Mousehole (${err instanceof Error ? err.message : String(err)}), so the MAM cookie state is unknown.`,
			url,
			lastContactAt: null,
			checkedAt: new Date().toISOString(),
		};
	}
	cache = { at: Date.now(), status };
	return status;
}

/** Testing helper */
export function clearMouseholeCache(): void {
	cache = null;
}
