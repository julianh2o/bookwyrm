import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import readarrRouter from './readarr';

// Mock the config module
vi.mock('../../config/readarr', () => {
	const mockInstances = [
		{
			id: 'fiction-audio',
			name: 'Fiction Audiobooks',
			url: 'https://readarr-fiction-audio.example.com',
			apiKey: 'secret-api-key-1',
			type: 'audio',
			category: 'fiction',
			enabled: true,
		},
		{
			id: 'fiction-ebook',
			name: 'Fiction Books',
			url: 'https://readarr-fiction-ebook.example.com',
			apiKey: 'secret-api-key-2',
			type: 'ebook',
			category: 'fiction',
			enabled: true,
		},
		{
			id: 'nonfiction-audio',
			name: 'Nonfiction Audiobooks',
			url: 'https://readarr-nf-audio.example.com',
			apiKey: 'secret-api-key-3',
			type: 'audio',
			category: 'nonfiction',
			enabled: false,
		},
	];

	return {
		loadReadarrConfig: vi.fn(() => ({ instances: mockInstances })),
		getInstanceById: vi.fn((id: string) => mockInstances.find((i) => i.id === id)),
		getEnabledInstances: vi.fn(() => mockInstances.filter((i) => i.enabled)),
		getInstancesFor: vi.fn((category: string, type?: string) =>
			mockInstances.filter((i) => i.enabled && i.category === category && (!type || i.type === type)),
		),
		clearConfigCache: vi.fn(),
	};
});

// Create test app
const app = express();
app.use(express.json());
app.use('/api/settings/readarr', readarrRouter);

describe('Readarr Settings API', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('GET /api/settings/readarr', () => {
		it('should return all configured instances', async () => {
			const response = await request(app).get('/api/settings/readarr');

			expect(response.status).toBe(200);
			expect(response.body.instances).toHaveLength(3);
		});

		it('should not expose API keys', async () => {
			const response = await request(app).get('/api/settings/readarr');

			expect(response.status).toBe(200);
			for (const instance of response.body.instances) {
				expect(instance.apiKey).toBeUndefined();
			}
		});

		it('should include instance details', async () => {
			const response = await request(app).get('/api/settings/readarr');

			expect(response.status).toBe(200);
			const fictionAudio = response.body.instances.find((i: { id: string }) => i.id === 'fiction-audio');
			expect(fictionAudio).toMatchObject({
				id: 'fiction-audio',
				name: 'Fiction Audiobooks',
				url: 'https://readarr-fiction-audio.example.com',
				type: 'audio',
				category: 'fiction',
				enabled: true,
			});
		});
	});

	describe('GET /api/settings/readarr/:id', () => {
		it('should return a specific instance', async () => {
			const response = await request(app).get('/api/settings/readarr/fiction-ebook');

			expect(response.status).toBe(200);
			expect(response.body.id).toBe('fiction-ebook');
			expect(response.body.name).toBe('Fiction Books');
			expect(response.body.apiKey).toBeUndefined();
		});

		it('should return 404 for non-existent instance', async () => {
			const response = await request(app).get('/api/settings/readarr/non-existent');

			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Instance not found');
		});
	});

	describe('POST /api/settings/readarr/:id/test', () => {
		it('should return 404 for non-existent instance', async () => {
			const response = await request(app).post('/api/settings/readarr/non-existent/test');

			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Instance not found');
		});

		it('should test connection and return success on valid response', async () => {
			// Mock fetch to return success
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ version: '0.3.0.1234', appName: 'Readarr' }),
			});
			vi.stubGlobal('fetch', mockFetch);

			const response = await request(app).post('/api/settings/readarr/fiction-audio/test');

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.version).toBe('0.3.0.1234');
			expect(response.body.appName).toBe('Readarr');
			expect(response.body.instance.id).toBe('fiction-audio');
			expect(response.body.instance.apiKey).toBeUndefined();

			// Verify fetch was called with correct URL and API key
			expect(mockFetch).toHaveBeenCalledWith(
				'https://readarr-fiction-audio.example.com/api/v1/system/status',
				expect.objectContaining({
					method: 'GET',
					headers: expect.objectContaining({
						'X-Api-Key': 'secret-api-key-1',
					}),
				}),
			);

			vi.unstubAllGlobals();
		});

		it('should return failure on HTTP error', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				statusText: 'Unauthorized',
			});
			vi.stubGlobal('fetch', mockFetch);

			const response = await request(app).post('/api/settings/readarr/fiction-audio/test');

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe('HTTP 401: Unauthorized');
			expect(response.body.instance.id).toBe('fiction-audio');

			vi.unstubAllGlobals();
		});

		it('should return failure on network error', async () => {
			const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
			vi.stubGlobal('fetch', mockFetch);

			const response = await request(app).post('/api/settings/readarr/fiction-audio/test');

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe('ECONNREFUSED');
			expect(response.body.instance.id).toBe('fiction-audio');

			vi.unstubAllGlobals();
		});

		it('should handle timeout errors', async () => {
			const mockFetch = vi.fn().mockRejectedValue(new Error('The operation was aborted'));
			vi.stubGlobal('fetch', mockFetch);

			const response = await request(app).post('/api/settings/readarr/fiction-audio/test');

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toContain('aborted');

			vi.unstubAllGlobals();
		});
	});
});
