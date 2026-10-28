import { describe, it, expect } from 'vitest';
import { guessCategory } from './category';

describe('guessCategory', () => {
	it('calls Piranesi fiction', () => {
		const g = guessCategory([
			'Fantasy',
			'Mystery',
			'Magical Realism',
			'Literary Fiction',
			'Literature & Fiction',
			'General',
		]);
		expect(g?.category).toBe('fiction');
	});
	it('calls psychology nonfiction', () => {
		expect(guessCategory(['LGBTQ', 'Psychology'])?.category).toBe('nonfiction');
	});
	it('trusts an explicit Nonfiction tag', () => {
		expect(guessCategory(['Nonfiction', 'Fantasy'])).toMatchObject({ category: 'nonfiction', confident: true });
	});
	it('returns null when there is nothing to go on', () => {
		expect(guessCategory(['none'])).toBeNull();
		expect(guessCategory([])).toBeNull();
		expect(guessCategory(['General'])).toBeNull();
	});
});
