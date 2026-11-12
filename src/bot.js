// Computer opponent: estimates its chance of winning with a Monte Carlo
// simulation, compares it with the pot odds, and picks an action.

import { estimateEquity } from './equity.js';

const TRIALS = 700; // enough to be within a few percent, fast enough to feel instant

export function decideAction(game, random = Math.random) {
  const me = game.currentPlayer;
  const legal = game.legalActions();
  const opponents = game.players.filter((p) => p !== me && game.inHand(p)).length;
  const equity = estimateEquity(me.hole, game.board, opponents, TRIALS, random);

  const pot = game.pot;
  // Pot odds: the share of the final pot we must put in to call.
  const potOdds = legal.toCall / (pot + legal.toCall || 1);
  const roll = random();

  const raiseTo = (fractionOfPot) => ({
    type: 'raise',
    to: game.currentBet + Math.max(game.bigBlind, Math.round(pot * fractionOfPot)),
  });

  // Strong hand: build the pot.
  if (equity > 0.7 && legal.canRaise) return raiseTo(roll < 0.5 ? 0.75 : 1);

  if (legal.canCheck) {
    if (equity > 0.5 && legal.canRaise && roll < 0.6) return raiseTo(0.5); // value bet
    if (legal.canRaise && roll < 0.06) return raiseTo(0.6);                // occasional bluff
    return { type: 'check' };
  }

  // Facing a bet: call when our equity beats the price, with a small margin.
  if (equity >= potOdds + 0.03) return { type: 'call' };
  if (roll < 0.03) return { type: 'call' }; // rare loose call so the bot isn't fully predictable
  return { type: 'fold' };
}
