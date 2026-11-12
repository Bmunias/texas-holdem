// Hand evaluation for Texas Hold'em.
//
// A hand's score is an array: [category, ...tiebreakers]. Comparing two scores
// element by element (compareScores) decides which hand wins.

import { cardToString } from './cards.js';

export const CATEGORIES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
];

export const CATEGORY = Object.fromEntries(CATEGORIES.map((name, i) => [name, i]));

/** Returns a negative number if a < b, positive if a > b, 0 if tied. */
export function compareScores(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** High card of a straight, or 0. The wheel A-2-3-4-5 counts as 5-high. */
function straightHigh(sortedUniqueDesc) {
  if (sortedUniqueDesc.length !== 5) return 0;
  if (sortedUniqueDesc[0] - sortedUniqueDesc[4] === 4) return sortedUniqueDesc[0];
  if (sortedUniqueDesc.join() === '14,5,4,3,2') return 5;
  return 0;
}

/** Score exactly 5 cards. */
export function evaluateFive(cards) {
  if (cards.length !== 5) throw new Error(`evaluateFive needs 5 cards, got ${cards.length}`);

  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const high = straightHigh([...new Set(ranks)]);

  // Group ranks by count, biggest group first, then higher rank first.
  // Example: K K K 4 4 -> [[13, 3], [4, 2]]
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map(([, count]) => count).join('');
  const groupedRanks = groups.map(([rank]) => rank);

  let score;
  if (high && isFlush) score = [CATEGORY['Straight Flush'], high];
  else if (shape === '41') score = [CATEGORY['Four of a Kind'], ...groupedRanks];
  else if (shape === '32') score = [CATEGORY['Full House'], ...groupedRanks];
  else if (isFlush) score = [CATEGORY.Flush, ...ranks];
  else if (high) score = [CATEGORY.Straight, high];
  else if (shape === '311') score = [CATEGORY['Three of a Kind'], ...groupedRanks];
  else if (shape === '221') score = [CATEGORY['Two Pair'], ...groupedRanks];
  else if (shape === '2111') score = [CATEGORY.Pair, ...groupedRanks];
  else score = [CATEGORY['High Card'], ...ranks];

  // Display order: biggest group first, then by rank (e.g. 3 3 A Q 8).
  const sorted = [...cards].sort(
    (a, b) => counts.get(b.rank) - counts.get(a.rank) || b.rank - a.rank);
  return { score, category: CATEGORIES[score[0]], cards: sorted };
}

/** Best 5-card hand from 5 to 7 cards (checks all 21 combinations of 7). */
export function bestHand(cards) {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`bestHand needs 5 to 7 cards, got ${cards.length}`);
  }
  let best = null;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const result = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareScores(result.score, best.score) > 0) best = result;
          }
  return best;
}

export function describeHand(result) {
  return `${result.category} (${result.cards.map(cardToString).join(' ')})`;
}
