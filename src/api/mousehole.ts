import { get } from './client';

export interface MouseholeStatus {
	configured: boolean;
	ok: boolean;
	problem: 'no-cookie' | 'mam-unreachable' | 'ip-update-failed' | 'mousehole-unreachable' | null;
	message: string | null;
	url: string | null;
	lastContactAt: string | null;
	checkedAt: string | null;
}

/**
 * Mousehole's MAM cookie state (drives the banner at the top of the page)
 */
export async function getMouseholeStatus(refresh = false): Promise<MouseholeStatus> {
	return get<MouseholeStatus>(`/api/mousehole/status${refresh ? '?refresh=1' : ''}`);
}
