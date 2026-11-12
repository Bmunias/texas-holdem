// No-limit Texas Hold'em game engine. Pure logic, no DOM, so it can be unit tested.
//
// Usage:
//   const game = new Game([{ name: 'You', isHuman: true }, { name: 'Bot' }]);
//   game.startHand();
//   while (game.phase !== 'handOver') game.act(someAction);
//
// Actions: { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'raise', to: 120 }
// "raise to" is the player's total bet for this betting round, as in real poker.

import { Deck, cardToString } from './cards.js';
import { bestHand, compareScores, describeHand } from './evaluator.js';

const STREETS = ['preflop', 'flop', 'turn', 'river'];

export class Game {
  constructor(seats, {
    smallBlind = 10,
    bigBlind = 20,
    startingStack = 1000,
    random = Math.random,
    blindLevels = null,  // e.g. [{ small: 10, big: 20 }, { small: 15, big: 30 }, ...]
    handsPerLevel = 10,  // blinds go up every N hands
  } = {}) {
    if (seats.length < 2) throw new Error('Need at least 2 players');
    this.players = seats.map((seat, id) => ({
      id,
      name: seat.name,
      isHuman: Boolean(seat.isHuman),
      stack: seat.stack ?? startingStack,
      hole: [],
      bet: 0,        // chips put in during the current betting round
      totalBet: 0,   // chips put in during the whole hand (used for side pots)
      folded: false,
      allIn: false,
      acted: false,
      out: false,    // busted: no chips left
    }));
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.blindLevels = blindLevels;
    this.handsPerLevel = handsPerLevel;
    this.level = 0;
    this.random = random;
    this.dealer = -1;
    this.board = [];
    this.phase = 'waiting';
    this.log = [];
    this.results = [];
    this.handNumber = 0;
  }

  // ---------- helpers ----------

  get pot() {
    return this.players.reduce((sum, p) => sum + p.totalBet, 0);
  }

  get currentPlayer() {
    return this.players[this.current];
  }

  inHand(p) {
    return !p.out && !p.folded;
  }

  canAct(p) {
    return this.inHand(p) && !p.allIn;
  }

  /** Next seat clockwise after `from` that matches `test`. */
  nextSeat(from, test) {
    const n = this.players.length;
    for (let step = 1; step <= n; step++) {
      const i = (from + step) % n;
      if (test(this.players[i])) return i;
    }
    return -1;
  }

  addLog(message) {
    this.log.push(message);
  }

  /** Log "<name> <verb ...>", using "you call" instead of "you calls" for the human. */
  say(p, text) {
    const phrase = p.isHuman ? text.replace(/^has\b/, 'have').replace(/^(\w+?)s\b/, '$1') : text;
    this.addLog(`${p.name} ${phrase}`);
  }

  /** Move chips from a player's stack into the pot (capped at their stack = all-in). */
  putIn(p, amount) {
    const chips = Math.min(amount, p.stack);
    p.stack -= chips;
    p.bet += chips;
    p.totalBet += chips;
    if (p.stack === 0) p.allIn = true;
    return chips;
  }

  get isGameOver() {
    const withChips = this.players.filter((p) => p.stack > 0);
    const human = this.players.find((p) => p.isHuman);
    return withChips.length < 2 || (human !== undefined && human.stack === 0);
  }

  // ---------- blind levels ----------

  /** Raise the blinds when enough hands have been played at the current level. */
  updateBlinds() {
    if (!this.blindLevels) return;
    const level = Math.min(
      Math.floor((this.handNumber - 1) / this.handsPerLevel),
      this.blindLevels.length - 1,
    );
    const { small, big } = this.blindLevels[level];
    if (level !== this.level || this.handNumber === 1) {
      this.smallBlind = small;
      this.bigBlind = big;
      if (level !== this.level) this.addLog(`Blinds go up to ${small}/${big}`);
      this.level = level;
    }
  }

  /** Hands left before the blinds go up (null when already at the last level). */
  get handsUntilNextLevel() {
    if (!this.blindLevels || this.level >= this.blindLevels.length - 1) return null;
    return (this.level + 1) * this.handsPerLevel - this.handNumber + 1;
  }

  // ---------- starting a hand ----------

  startHand() {
    for (const p of this.players) p.out = p.stack === 0;
    if (this.players.filter((p) => !p.out).length < 2) {
      this.phase = 'gameOver';
      return;
    }

    this.handNumber++;
    this.deck = new Deck(this.random).shuffle();
    this.board = [];
    this.log = [];
    this.results = [];
    this.updateBlinds();
    for (const p of this.players) {
      Object.assign(p, { hole: [], bet: 0, totalBet: 0, folded: false, allIn: false, acted: false });
    }

    const active = (p) => !p.out;
    this.dealer = this.nextSeat(this.dealer, active);
    const headsUp = this.players.filter(active).length === 2;
    // Heads-up, the dealer posts the small blind and acts first before the flop.
    const sb = headsUp ? this.dealer : this.nextSeat(this.dealer, active);
    const bb = this.nextSeat(sb, active);

    this.putIn(this.players[sb], this.smallBlind);
    this.putIn(this.players[bb], this.bigBlind);
    this.addLog(`Hand #${this.handNumber}`);
    this.say(this.players[this.dealer], 'has the dealer button');
    this.say(this.players[sb], `posts the small blind (${this.smallBlind})`);
    this.say(this.players[bb], `posts the big blind (${this.bigBlind})`);

    for (const p of this.players) if (active(p)) p.hole = this.deck.deal(2);

    this.phase = 'preflop';
    this.currentBet = this.bigBlind;
    this.lastRaiseSize = this.bigBlind;
    this.current = this.nextSeat(bb, (p) => this.canAct(p));

    // Everyone could already be all-in from the blinds.
    if (this.current === -1 || this.roundComplete()) this.nextStreet();
  }

  // ---------- betting ----------

  /** What the current player is allowed to do. */
  legalActions() {
    const p = this.currentPlayer;
    const toCall = Math.min(this.currentBet - p.bet, p.stack);
    const maxRaiseTo = p.bet + p.stack;
    const othersCanAct = this.players.some((o) => o !== p && this.canAct(o));
    const canRaise = maxRaiseTo > this.currentBet && othersCanAct;
    const fullMin = this.currentBet + this.lastRaiseSize;
    return {
      toCall,
      canCheck: toCall === 0,
      canRaise,
      // If the player can't afford a full raise, their only raise is all-in.
      minRaiseTo: canRaise ? Math.min(fullMin, maxRaiseTo) : 0,
      maxRaiseTo: canRaise ? maxRaiseTo : 0,
    };
  }

  act(action) {
    if (!STREETS.includes(this.phase)) throw new Error(`Cannot act during "${this.phase}"`);
    const p = this.currentPlayer;
    const legal = this.legalActions();

    switch (action.type) {
      case 'fold':
        p.folded = true;
        this.say(p, 'folds');
        break;

      case 'check':
        if (!legal.canCheck) throw new Error(`${p.name} cannot check; ${legal.toCall} to call`);
        this.say(p, 'checks');
        break;

      case 'call': {
        if (legal.toCall === 0) {
          this.say(p, 'checks');
          break;
        }
        const chips = this.putIn(p, legal.toCall);
        this.say(p, `calls ${chips}${p.allIn ? ' (all-in)' : ''}`);
        break;
      }

      case 'raise': {
        if (!legal.canRaise) throw new Error(`${p.name} cannot raise`);
        const to = Math.round(Math.min(Math.max(action.to, legal.minRaiseTo), legal.maxRaiseTo));
        const raiseSize = to - this.currentBet;
        this.putIn(p, to - p.bet);
        // Only a full raise changes the minimum next raise.
        if (raiseSize >= this.lastRaiseSize) this.lastRaiseSize = raiseSize;
        const verb = this.currentBet === 0 ? 'bets' : 'raises to';
        this.currentBet = Math.max(this.currentBet, p.bet);
        // Everyone else has to respond to the raise.
        for (const other of this.players) if (other !== p) other.acted = false;
        this.say(p, `${verb} ${p.bet}${p.allIn ? ' (all-in)' : ''}`);
        break;
      }

      default:
        throw new Error(`Unknown action "${action.type}"`);
    }

    p.acted = true;
    this.advance();
  }

  roundComplete() {
    return this.players
      .filter((p) => this.canAct(p))
      .every((p) => p.acted && p.bet === this.currentBet);
  }

  advance() {
    const remaining = this.players.filter((p) => this.inHand(p));
    if (remaining.length === 1) {
      this.awardUncontested(remaining[0]);
      return;
    }
    if (this.roundComplete()) this.nextStreet();
    else this.current = this.nextSeat(this.current, (p) => this.canAct(p));
  }

  nextStreet() {
    for (const p of this.players) {
      p.bet = 0;
      p.acted = false;
    }
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlind;

    const next = STREETS[STREETS.indexOf(this.phase) + 1];
    if (!next) {
      this.showdown();
      return;
    }
    this.phase = next;
    this.board.push(...this.deck.deal(next === 'flop' ? 3 : 1));
    this.addLog(`${next[0].toUpperCase() + next.slice(1)}: ${this.board.map(cardToString).join(' ')}`);

    // If fewer than 2 players can still bet, deal the rest of the board without betting.
    if (this.players.filter((p) => this.canAct(p)).length < 2) {
      this.nextStreet();
      return;
    }
    this.current = this.nextSeat(this.dealer, (p) => this.canAct(p));
  }

  // ---------- ending a hand ----------

  awardUncontested(winner) {
    const pot = this.pot;
    winner.stack += pot;
    this.results = [{ player: winner, amount: pot, hand: null }];
    this.say(winner, `wins ${pot} (everyone else folded)`);
    this.finishHand();
  }

  showdown() {
    this.phase = 'showdown';
    const contenders = this.players.filter((p) => this.inHand(p));
    const hands = new Map(contenders.map((p) => [p, bestHand(p.hole.concat(this.board))]));
    for (const p of contenders) this.say(p, `shows ${describeHand(hands.get(p))}`);

    const winnings = new Map();
    const pay = (p, chips) => winnings.set(p, (winnings.get(p) ?? 0) + chips);

    // Side pots: build one pot per all-in level. Each pot can only be won by
    // players who put in at least that much.
    const levels = [...new Set(contenders.map((p) => p.totalBet))].sort((a, b) => a - b);
    let previous = 0;
    let paidOut = 0;
    for (const level of levels) {
      const potSize = this.players.reduce(
        (sum, p) => sum + Math.min(p.totalBet, level) - Math.min(p.totalBet, previous), 0);
      const eligible = contenders.filter((p) => p.totalBet >= level);
      const winners = this.bestOf(eligible, hands);
      const share = Math.floor(potSize / winners.length);
      winners.forEach((w) => pay(w, share));
      pay(winners[0], potSize - share * winners.length); // odd chip goes to the first winner
      paidOut += potSize;
      previous = level;
    }
    // Chips from folded players above the highest contender's level (rare) go to the overall winner.
    const leftover = this.pot - paidOut;
    if (leftover > 0) pay(this.bestOf(contenders, hands)[0], leftover);

    this.results = [];
    for (const [p, chips] of winnings) {
      p.stack += chips;
      this.results.push({ player: p, amount: chips, hand: hands.get(p) });
      this.say(p, `wins ${chips} with ${hands.get(p).category}`);
    }
    this.finishHand();
  }

  /** Players with the best hand among `players`, ordered clockwise from the dealer. */
  bestOf(players, hands) {
    let best = [];
    for (const p of players) {
      if (best.length === 0) { best = [p]; continue; }
      const cmp = compareScores(hands.get(p).score, hands.get(best[0]).score);
      if (cmp > 0) best = [p];
      else if (cmp === 0) best.push(p);
    }
    const n = this.players.length;
    const distance = (p) => (p.id - this.dealer + n) % n || n;
    return best.sort((a, b) => distance(a) - distance(b));
  }

  finishHand() {
    this.phase = 'handOver';
    // The pot has been paid out, so clear everyone's contributions.
    for (const p of this.players) {
      p.bet = 0;
      p.totalBet = 0;
      if (p.stack === 0) p.out = true;
    }
  }
}