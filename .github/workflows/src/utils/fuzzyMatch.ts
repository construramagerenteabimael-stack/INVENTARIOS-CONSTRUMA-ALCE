import { ProductItem } from '../types/inventory';

/**
 * Normalizes text for comparison: lowercases, removes diacritics/accents, trims whitespace,
 * and collapses multiple spaces.
 */
export function normalizeText(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s]/g, ' ') // replace punctuation with space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates Dice coefficient similarity between two strings (0 to 1).
 */
export function diceCoefficient(s1: string, s2: string): number {
  const norm1 = normalizeText(s1);
  const norm2 = normalizeText(s2);

  if (norm1 === norm2) return 1.0;
  if (norm1.length < 2 || norm2.length < 2) return 0.0;

  const getBigrams = (str: string) => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2);
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }
    return bigrams;
  };

  const bigrams1 = getBigrams(norm1);
  const bigrams2 = getBigrams(norm2);

  let intersection = 0;
  for (const [bigram, count1] of bigrams1.entries()) {
    const count2 = bigrams2.get(bigram);
    if (count2) {
      intersection += Math.min(count1, count2);
    }
  }

  const total = (norm1.length - 1) + (norm2.length - 1);
  return (2.0 * intersection) / total;
}

/**
 * Computes an aggregate score combining token matching, exact substrings,
 * and bigram similarity for hardware product catalog queries.
 */
export function calculateMatchScore(query: string, product: ProductItem, keywords: string[] = []): number {
  const normQuery = normalizeText(query);
  const normDesc = normalizeText(product.description);
  const normCode = normalizeText(product.code);
  const normBarcode = normalizeText(product.barcode);

  if (!normQuery && keywords.length === 0) return 0;

  // Direct code or barcode hit
  if (normCode === normQuery || normBarcode === normQuery) return 1.0;
  if (normCode.includes(normQuery) && normQuery.length >= 3) return 0.95;
  if (normBarcode.includes(normQuery) && normQuery.length >= 3) return 0.95;

  let score = 0;

  // Exact whole description equality
  if (normDesc === normQuery) return 0.99;

  // Substring inclusion
  if (normDesc.includes(normQuery)) {
    score += 0.5;
  }

  // Token overlap
  const queryTokens = normQuery.split(' ').filter((t) => t.length > 1);
  const descTokens = new Set(normDesc.split(' ').filter((t) => t.length > 1));

  let matchedTokens = 0;
  for (const token of queryTokens) {
    if (descTokens.has(token)) {
      matchedTokens++;
    } else {
      // Partial prefix match
      for (const dToken of descTokens) {
        if (dToken.startsWith(token) || token.startsWith(dToken)) {
          matchedTokens += 0.5;
          break;
        }
      }
    }
  }

  if (queryTokens.length > 0) {
    score += (matchedTokens / queryTokens.length) * 0.4;
  }

  // Bigram similarity
  const dice = diceCoefficient(normQuery, normDesc);
  score += dice * 0.3;

  // Bonus for AI extracted keywords
  if (keywords.length > 0) {
    let kwHits = 0;
    for (const kw of keywords) {
      const normKw = normalizeText(kw);
      if (normDesc.includes(normKw)) {
        kwHits++;
      }
    }
    score += (kwHits / keywords.length) * 0.25;
  }

  return Math.min(1.0, score);
}

export interface MatchResult {
  product: ProductItem;
  score: number;
}

/**
 * Finds top matching products from a catalog based on text and optional keywords.
 */
export function findTopMatches(
  query: string,
  products: ProductItem[],
  keywords: string[] = [],
  limit = 5,
  minScore = 0.15
): MatchResult[] {
  const scored: MatchResult[] = [];
  const seenCodes = new Set<string>();

  for (const prod of products) {
    // Deduplicate multiple barcodes for the same code in the top suggestions
    if (seenCodes.has(prod.code)) continue;

    const score = calculateMatchScore(query, prod, keywords);
    if (score >= minScore) {
      scored.push({ product: prod, score });
      seenCodes.add(prod.code);
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
