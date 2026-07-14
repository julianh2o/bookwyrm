import { Router, Request, Response, NextFunction } from 'express';
import { loadReadarrConfig, getInstanceById, type ReadarrInstance } from '../../config/readarr';

const router = Router();

/**
 * Error handler for async routes
 */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
	return (req: Request, res: Response, next: NextFunction) => {
		Promise.resolve(fn(req, res, next)).catch(next);
	};
}

/**
 * Sanitize instance for API response (hide API key)
 */
function sanitizeInstance(instance: ReadarrInstance) {
	return {
		id: instance.id,
		name: instance.name,
		url: instance.url,
		type: instance.type,
		category: instance.category,
		enabled: instance.enabled,
		// Don't expose API key
	};
}

/**
 * GET /api/settings/readarr
 * List all configured Readarr instances (without API keys)
 */
router.get(
	'/',
	asyncHandler(async (_req, res) => {
		try {
			const config = loadReadarrConfig();
			const instances = config.instances.map(sanitizeInstance);
			res.json({ instances });
		} catch (error) {
			// Config file not found or invalid
			const message = error instanceof Error ? error.message : 'Failed to load configuration';
			res.status(500).json({
				error: 'Configuration error',
				message,
			});
		}
	}),
);

/**
 * GET /api/settings/readarr/:id
 * Get a specific Readarr instance configuration
 */
router.get(
	'/:id',
	asyncHandler(async (req, res) => {
		const { id } = req.params;

		try {
			const instance = getInstanceById(id);
			if (!instance) {
				res.status(404).json({ error: 'Instance not found' });
				return;
			}

			res.json(sanitizeInstance(instance));
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to load configuration';
			res.status(500).json({
				error: 'Configuration error',
				message,
			});
		}
	}),
);

/**
 * POST /api/settings/readarr/:id/test
 * Test connection to a Readarr instance
 */
router.post(
	'/:id/test',
	asyncHandler(async (req, res) => {
		const { id } = req.params;

		let instance: ReadarrInstance | undefined;
		try {
			instance = getInstanceById(id);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to load configuration';
			res.status(500).json({
				error: 'Configuration error',
				message,
			});
			return;
		}

		if (!instance) {
			res.status(404).json({ error: 'Instance not found' });
			return;
		}

		// Test connection by calling Readarr's system status endpoint
		const statusUrl = `${instance.url.replace(/\/$/, '')}/api/v1/system/status`;

		try {
			const controller = new globalThis.AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000);

			const response = await fetch(statusUrl, {
				method: 'GET',
				headers: {
					'X-Api-Key': instance.apiKey,
					Accept: 'application/json',
				},
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				res.json({
					success: false,
					error: `HTTP ${response.status}: ${response.statusText}`,
					instance: sanitizeInstance(instance),
				});
				return;
			}

			const status = (await response.json()) as { version?: string; appName?: string };

			res.json({
				success: true,
				instance: sanitizeInstance(instance),
				version: status.version,
				appName: status.appName,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Connection failed';
			res.json({
				success: false,
				error: message,
				instance: sanitizeInstance(instance),
			});
		}
	}),
);

/**
 * Error handling middleware
 */
router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
	console.error('Settings API error:', err);
	res.status(500).json({ error: 'Internal server error' });
});

export default router;
