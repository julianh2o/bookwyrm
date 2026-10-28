import { z } from 'zod';

/**
 * Book category - fiction or nonfiction
 */
export const bookCategorySchema = z.enum(['fiction', 'nonfiction']);

/**
 * Book request status values
 */
export const bookRequestStatusSchema = z.enum([
	'pending',
	'adding',
	'searching',
	'wanted',
	'downloading',
	'importing',
	'available',
	'error',
	// legacy values from before the phase model
	'found',
	'not_found',
]);

/**
 * Schema for creating a new book
 */
export const createBookSchema = z.object({
	title: z.string().min(1, 'Title is required').max(500),
	author: z.string().min(1, 'Author is required').max(500),
	isbn: z
		.string()
		.regex(/^[\d\-X]+$/, 'Invalid ISBN format')
		.optional()
		.nullable(),
	/** Optional when metadataId is given: guessed from the book's genres */
	category: bookCategorySchema.optional(),
	coverUrl: z.string().url('Invalid cover URL').optional().nullable(),
	notes: z.string().max(5000).optional().nullable(),
	metadataId: z.string().optional().nullable(),
	metadataProvider: z.string().optional().nullable(),
	/** Which Readarr instances to request. Defaults to every enabled instance for the category (audio + ebook). */
	instanceIds: z.array(z.string()).optional(),
	/** Send to Readarr right away (default true) */
	autoRequest: z.boolean().optional(),
});

/**
 * Schema for updating a book (all fields optional)
 */
export const updateBookSchema = z.object({
	title: z.string().min(1).max(500).optional(),
	author: z.string().min(1).max(500).optional(),
	isbn: z
		.string()
		.regex(/^[\d\-X]+$/, 'Invalid ISBN format')
		.optional()
		.nullable(),
	category: bookCategorySchema.optional(),
	coverUrl: z.string().url('Invalid cover URL').optional().nullable(),
	notes: z.string().max(5000).optional().nullable(),
	metadataId: z.string().optional().nullable(),
	metadataProvider: z.string().optional().nullable(),
});

/**
 * Schema for a book response (includes id and timestamps)
 */
export const bookResponseSchema = z.object({
	id: z.string(),
	title: z.string(),
	author: z.string(),
	isbn: z.string().nullable(),
	category: bookCategorySchema,
	coverUrl: z.string().nullable(),
	notes: z.string().nullable(),
	metadataId: z.string().nullable(),
	metadataProvider: z.string().nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

/**
 * Schema for a book request (to Readarr)
 */
export const bookRequestResponseSchema = z.object({
	id: z.string(),
	bookId: z.string(),
	instanceId: z.string(),
	status: bookRequestStatusSchema,
	externalId: z.string().nullable(),
	externalSlug: z.string().nullable(),
	errorMessage: z.string().nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
	lastChecked: z.string().datetime().nullable(),
});

/**
 * Schema for a book with its requests
 */
export const bookWithRequestsSchema = bookResponseSchema.extend({
	requests: z.array(bookRequestResponseSchema),
});

/**
 * Schema for list query parameters
 */
export const listBooksQuerySchema = z.object({
	category: bookCategorySchema.optional(),
	status: bookRequestStatusSchema.optional(),
	search: z.string().optional(),
	sort: z.enum(['recent', 'title', 'author', 'activity']).default('recent'),
	limit: z.coerce.number().int().min(1).max(1000).default(50),
	offset: z.coerce.number().int().min(0).default(0),
});

// Type exports derived from schemas
export type BookCategory = z.infer<typeof bookCategorySchema>;
export type BookRequestStatus = z.infer<typeof bookRequestStatusSchema>;
export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type BookResponse = z.infer<typeof bookResponseSchema>;
export type BookRequestResponse = z.infer<typeof bookRequestResponseSchema>;
export type BookWithRequests = z.infer<typeof bookWithRequestsSchema>;
export type ListBooksQuery = z.infer<typeof listBooksQuerySchema>;
