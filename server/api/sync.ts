import { Router, Request, Response, NextFunction } from 'express';
import { getTracker } from '../services/tracker';
import { prisma } from '../db';

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
 * POST /api/sync/library
 * Check every Readarr instance now: import new books, update every request's status
 */
router.post(
	'/library',
	asyncHandler(async (_req, res) => {
		const results = await getTracker().pollAll();
		const summary = {
			totalInstances: results.length,
			totalBooksCreated: results.reduce((sum, r) => sum + r.booksCreated, 0),
			totalRequestsCreated: results.reduce((sum, r) => sum + r.requestsCreated, 0),
			totalRequestsLinked: results.reduce((sum, r) => sum + r.requestsLinked, 0),
			totalRequestsChanged: results.reduce((sum, r) => sum + r.requestsChanged, 0),
			totalErrors: results.filter((r) => r.error).length,
		};
		res.json({ summary, results, health: getTracker().getHealth() });
	}),
);

/**
 * GET /api/sync/status
 * Per-instance health from the background checker
 */
router.get(
	'/status',
	asyncHandler(async (_req, res) => {
		const counts = await prisma.bookRequest.groupBy({ by: ['instanceId', 'status'], _count: { _all: true } });
		res.json({
			instances: getTracker().getHealth(),
			counts: counts.map((c) => ({ instanceId: c.instanceId, status: c.status, count: c._count._all })),
		});
	}),
);

/**
 * DELETE /api/sync/purge
 * Delete all books and their requests from the database
 */
router.delete(
	'/purge',
	asyncHandler(async (_req, res) => {
		// Delete all book requests first (foreign key constraint)
		const deletedRequests = await prisma.bookRequest.deleteMany({});

		// Delete all books
		const deletedBooks = await prisma.book.deleteMany({});

		res.json({
			deletedBooks: deletedBooks.count,
			deletedRequests: deletedRequests.count,
		});
	}),
);

/**
 * Error handling middleware
 */
router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
	console.error('Sync API error:', err);
	res.status(500).json({ error: 'Internal server error' });
});

export default router;
