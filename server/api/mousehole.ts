import { Router } from 'express';
import { getMouseholeStatus } from '../services/mousehole';

const router = Router();

/**
 * GET /api/mousehole/status
 * Whether Mousehole's MAM cookie is healthy (cached for a minute; ?refresh=1 skips the cache)
 */
router.get('/status', async (req, res, next) => {
	try {
		res.json(await getMouseholeStatus(req.query.refresh === '1'));
	} catch (err) {
		next(err);
	}
});

export default router;
