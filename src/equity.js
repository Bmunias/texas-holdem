// Monte Carlo equity: deal out the unknown cards thousands of times at random
// and count how often our hand wins. Ties count as a share of the pot.

import { cardId, fullDeck } from './cards.js';
import { bestHand, compareScores } from './evaluator.js';

/**
 * @param {Array} hole       our 2 hole cards
 * @param {Array} board      0, 3, 4 or 5 community cards
 * @param {number} opponents number of opponents still in the hand
 * @param {number} trials    more trials = more accurate, but slower
 * @param {Function} random  RNG returning [0, 1)
 * @returns {number} equity between 0 and 1
 */
export function estimateEquity(hole, board, opponents, trials = 1000, random = Math.random) {
  if (opponents < 1) return 1;

  const known = new Set([...hole, ...board].map(cardId));
  const remaining = fullDeck().filter((card) => !known.has(cardId(card)));
  const boardNeeded = 5 - board.length;
  const cardsNeeded = boardNeeded + opponents * 2;

  let total = 0;
  for (let t = 0; t < trials; t++) {
    // Partial Fisher-Yates: only shuffle the cards we actually need.
    for (let i = 0; i < cardsNeeded; i++) {
      const j = i + Math.floor(random() * (remaining.length - i));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }

    const fullBoard = board.concat(remaining.slice(0, boardNeeded));
    const ours = bestHand(hole.concat(fullBoard)).score;

    let lost = false;
    let tiedWith = 0;
    for (let o = 0; o < opponents; o++) {
      const start = boardNeeded + o * 2;
      const theirs = bestHand(remaining.slice(start, start + 2).concat(fullBoard)).score;
      const cmp = compareScores(ours, theirs);
      if (cmp < 0) { lost = true; break; }
      if (cmp === 0) tiedWith++;
    }
    if (!lost) total += 1 / (1 + tiedWith);
  }
  return total / trials;
}
