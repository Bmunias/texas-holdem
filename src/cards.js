// Cards, decks, and a seedable random number generator.
// A card is a plain object { rank, suit }: rank 2-14 (14 = ace), suit 'c' | 'd' | 'h' | 's'.

export const SUITS = ['c', 'd', 'h', 's'];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const RANK_SYMBOLS = '23456789TJQKA';
const SUIT_SYMBOLS = { c: '♣', d: '♦', h: '♥', s: '♠' };

export function rankSymbol(rank) {
  return RANK_SYMBOLS[rank - 2];
}

export function suitSymbol(suit) {
  return SUIT_SYMBOLS[suit];
}

export function cardId(card) {
  return `${rankSymbol(card.rank)}${card.suit}`;
}

export function cardToString(card) {
  return `${rankSymbol(card.rank)}${suitSymbol(card.suit)}`;
}

/** Parse "Ah" -> { rank: 14, suit: 'h' }. */
export function parseCard(text) {
  if (text.length !== 2) throw new Error(`Card must be 2 characters like "Ah", got "${text}"`);
  const rankIndex = RANK_SYMBOLS.indexOf(text[0].toUpperCase());
  const suit = text[1].toLowerCase();
  if (rankIndex === -1 || !SUITS.includes(suit)) throw new Error(`Invalid card "${text}"`);
  return { rank: rankIndex + 2, suit };
}

/** Parse "Ah Kd 7c" -> [card, card, card]. */
export function parseCards(text) {
  return text.trim().split(/\s+/).map(parseCard);
}

export function fullDeck() {
  const cards = [];
  for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
  return cards;
}

/** Small seedable RNG (mulberry32). Same seed -> same shuffles, which makes tests repeatable. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Deck {
  constructor(random = Math.random) {
    this.random = random;
    this.cards = fullDeck();
  }

  /** Fisher-Yates shuffle: every ordering is equally likely. */
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    return this;
  }

  deal(count = 1) {
    if (count > this.cards.length) {
      throw new Error(`Cannot deal ${count} cards, only ${this.cards.length} left`);
    }
    return this.cards.splice(0, count);
  }

  /** Remove known cards (used by the equity simulation). */
  remove(cards) {
    const known = new Set(cards.map(cardId));
    this.cards = this.cards.filter((card) => !known.has(cardId(card)));
    return this;
  }

  get size() {
    return this.cards.length;
  }
}
