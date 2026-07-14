import { Router, Request, Response, NextFunction } from 'express';
import { getLibrarySyncService } from '../services/library-sync';
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
 * Sync books from all enabled Readarr instances
 */
router.post(
	'/library',
	asyncHandler(async (_req, res) => {
		const service = getLibrarySyncService();
		const results = await service.syncAll();

		const summary = {
			totalInstances: results.length,
			totalBooksFound: results.reduce((sum, r) => sum + r.booksFound, 0),
			totalBooksImported: results.reduce((sum, r) => sum + r.booksImported, 0),
			totalBooksSkipped: results.reduce((sum, r) => sum + r.booksSkipped, 0),
			totalBooksCreated: results.reduce((sum, r) => sum + r.booksCreated, 0),
			totalBooksUpdated: results.reduce((sum, r) => sum + r.booksUpdated, 0),
			totalRequestsCreated: results.reduce((sum, r) => sum + r.requestsCreated, 0),
			totalRequestsUpdated: results.reduce((sum, r) => sum + r.requestsUpdated, 0),
			totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
		};

		res.json({ summary, results });
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
