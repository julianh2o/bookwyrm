import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import apiRouter from '../../api';
import { interpretState, getMouseholeStatus, clearMouseholeCache } from './index';

const URL = 'https://mousehole.test';
const healthy = {
	hasCookie: true,
	currentCookie: 'secret-cookie',
	lastMamContact: {
		at: '2026-10-29T17:29:50.404+00:00[UTC]',
		reached: true,
		ipUpdate: { success: true, msg: 'Completed', httpStatus: 200 },
	},
};

describe('interpretState', () => {
	it('is ok when the cookie is set and MAM accepted the update', () => {
		const s = interpretState(healthy, URL);
		expect(s.ok).toBe(true);
		expect(s.problem).toBeNull();
		expect(s.lastContactAt).toBe('2026-10-29T17:29:50.404Z');
	});

	it('flags a missing cookie', () => {
		const s = interpretState({ hasCookie: false, lastMamContact: null }, URL);
		expect(s).toMatchObject({ ok: false, problem: 'no-cookie' });
	});

	it('flags MAM being unreachable', () => {
		const s = interpretState({ hasCookie: true, lastMamContact: { reached: false, error: 'Network error' } }, URL);
		expect(s).toMatchObject({ ok: false, problem: 'mam-unreachable' });
		expect(s.message).toContain('Network error');
	});

	it('flags a rejected cookie/IP update', () => {
		const s = interpretState(
			{
				hasCookie: true,
				lastMamContact: { reached: true, ipUpdate: { success: false, msg: 'Invalid session', httpStatus: 403 } },
			},
			URL,
		);
		expect(s).toMatchObject({ ok: false, problem: 'ip-update-failed' });
		expect(s.message).toContain('Invalid session');
	});
});

describe('GET /api/mousehole/status', () => {
	const app = express();
	app.use('/api', apiRouter);

	beforeEach(() => {
		clearMouseholeCache();
		process.env.MOUSEHOLE_URL = URL;
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.MOUSEHOLE_URL;
	});

	it('reports not configured when MOUSEHOLE_URL is unset', async () => {
		delete process.env.MOUSEHOLE_URL;
		const res = await request(app).get('/api/mousehole/status');
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ configured: false, ok: true });
	});

	it('never passes the cookie on', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(healthy), { status: 200 })));
		const res = await request(app).get('/api/mousehole/status');
		expect(res.body).toMatchObject({ configured: true, ok: true });
		expect(JSON.stringify(res.body)).not.toContain('secret-cookie');
	});

	it('reports Mousehole being down', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
		const res = await request(app).get('/api/mousehole/status');
		expect(res.body).toMatchObject({ ok: false, problem: 'mousehole-unreachable' });
	});

	it('caches for a minute', async () => {
		const f = vi.fn().mockImplementation(async () => new Response(JSON.stringify(healthy), { status: 200 }));
		vi.stubGlobal('fetch', f);
		await getMouseholeStatus();
		await getMouseholeStatus();
		expect(f).toHaveBeenCalledTimes(1);
		await getMouseholeStatus(true);
		expect(f).toHaveBeenCalledTimes(2);
	});
});
