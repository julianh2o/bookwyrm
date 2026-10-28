export type GuessedCategory = { category: 'fiction' | 'nonfiction'; confident: boolean; reason: string };

const FICTION =
	/\b(fiction|novel|fantasy|science fiction|sci-fi|romance|mystery|thriller|horror|dystopi|young adult|ya|graphic novel|comic|fairy tale|litrpg|gamelit|short stories|poetry|paranormal|erotica|monster|space opera|cozy)\b/i;
const NONFICTION =
	/\b(non-?fiction|biography|autobiography|memoir|history|self[- ]help|psychology|science|business|economics|philosophy|health|politic|sociology|religion|spirituality|relationships|parenting|education|reference|true crime|essays|travel|cooking|self[- ]improvement|personal development|lgbtq studies|gender studies|sexuality)\b/i;

/**
 * Guess fiction vs nonfiction from metadata genres (rreading-glasses/Hardcover tags).
 * Explicit "Nonfiction"/"Fiction" genres win; otherwise count keyword hits.
 */
export function guessCategory(genres: string[] | undefined | null): GuessedCategory | null {
	const list = (genres ?? []).filter((g) => g && g.toLowerCase() !== 'none');
	if (list.length === 0) return null;

	if (list.some((g) => /^non-?fiction$/i.test(g.trim()))) {
		return { category: 'nonfiction', confident: true, reason: 'tagged Nonfiction' };
	}
	const fictionHits = list.filter((g) => FICTION.test(g) && !/non-?fiction/i.test(g));
	const nonfictionHits = list.filter((g) => NONFICTION.test(g));

	if (fictionHits.length === 0 && nonfictionHits.length === 0) return null;
	if (fictionHits.length > nonfictionHits.length) {
		return { category: 'fiction', confident: nonfictionHits.length === 0, reason: fictionHits.slice(0, 3).join(', ') };
	}
	if (nonfictionHits.length > fictionHits.length) {
		return {
			category: 'nonfiction',
			confident: fictionHits.length === 0,
			reason: nonfictionHits.slice(0, 3).join(', '),
		};
	}
	return null;
}
