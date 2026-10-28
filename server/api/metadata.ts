import { Router, Request, Response, NextFunction } from 'express';
import { createRReadingGlassesProvider } from '../services/metadata';
import type { SearchResult } from '../services/metadata';
import { guessCategory } from '../services/metadata/category';

const router = Router();

// Create provider instance
const provider = createRReadingGlassesProvider();

/**
 * Error handler for async routes
 */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
	return (req: Request, res: Response, next: NextFunction) => {
		Promise.resolve(fn(req, res, next)).catch(next);
	};
}

/**
 * GET /api/metadata/search
 * Search for books by title/author
 */
router.get(
	'/search',
	asyncHandler(async (req, res) => {
		const query = req.query.q as string;

		if (!query || query.trim().length < 2) {
			res.json({ results: [] });
			return;
		}

		const limit = Math.min(parseInt(req.query.limit as string) || 10, 20);

		try {
			const results = await provider.search(query.trim(), { limit });
			res.json({ results });
		} catch (error) {
			console.error('Metadata search error:', error);
			res.json({ results: [], error: 'Search failed' });
		}
	}),
);

/**
 * GET /api/metadata/book/:id
 * Get full book details by ID
 */
router.get(
	'/book/:id',
	asyncHandler(async (req, res) => {
		const { id } = req.params;

		try {
			const book = await provider.getById(id);

			if (!book) {
				res.status(404).json({ error: 'Book not found' });
				return;
			}

			res.json({ ...book, suggestedCategory: guessCategory(book.genres) });
		} catch (error) {
			console.error('Metadata fetch error:', error);
			res.status(500).json({ error: 'Failed to fetch book details' });
		}
	}),
);

/**
 * Error handling middleware
 */
router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
	console.error('Metadata API error:', err);
	res.status(500).json({ error: 'Internal server error' });
});

export default router;
