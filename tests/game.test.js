import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCards, seededRandom } from '../src/cards.js';
import { decideAction } from '../src/bot.js';
import { Game } from '../src/game.js';

const totalChips = (game) => game.players.reduce((sum, p) => sum + p.stack, 0) + game.pot;

function newGame(count = 4, seed = 1) {
  const seats = Array.from({ length: count }, (_, i) => ({ name: `P${i}` }));
  return new Game(seats, { random: seededRandom(seed) });
}

test('blinds are posted and the pot starts at 30', () => {
  const game = newGame(4);
  game.startHand();
  assert.equal(game.pot, 30);
  assert.equal(game.phase, 'preflop');
  for (const p of game.players) assert.equal(p.hole.length, 2);
});

test('heads-up: the dealer posts the small blind and acts first', () => {
  const game = newGame(2);
  game.startHand();
  assert.equal(game.players[game.dealer].totalBet, 10);
  assert.equal(game.current, game.dealer);
});

test('if everyone folds, the last player wins the blinds', () => {
  const game = newGame(3);
  game.startHand();
  game.act({ type: 'fold' });
  game.act({ type: 'fold' });
  assert.equal(game.phase, 'handOver');
  assert.equal(totalChips(game), 3000);
  assert.equal(game.results[0].amount, 30);
});

test('the big blind gets the option to raise when everyone just calls', () => {
  const game = newGame(3);
  game.startHand();
  game.act({ type: 'call' });
  game.act({ type: 'call' });
  assert.equal(game.phase, 'preflop');
  assert.equal(game.legalActions().canCheck, true);
  game.act({ type: 'check' });
  assert.equal(game.phase, 'flop');
  assert.equal(game.board.length, 3);
});

test('a raise reopens the betting for players who already acted', () => {
  const game = newGame(3);
  game.startHand();
  game.act({ type: 'call' });
  game.act({ type: 'call' });
  game.act({ type: 'raise', to: 100 });
  assert.equal(game.phase, 'preflop');
  assert.equal(game.legalActions().toCall, 80);
});

test('raises below the minimum are bumped up to the minimum', () => {
  const game = newGame(3);
  game.startHand();
  game.act({ type: 'raise', to: 25 });
  assert.equal(game.currentBet, 40);
});

test('all-in players get a board run out to showdown', () => {
  const game = newGame(2);
  game.startHand();
  game.act({ type: 'raise', to: 1000 });
  game.act({ type: 'call' });
  assert.equal(game.phase, 'handOver');
  assert.equal(game.board.length, 5);
  assert.equal(totalChips(game), 2000);
});

test('side pots: a short all-in can only win what they matched', () => {
  const game = new Game(
    [{ name: 'Short', stack: 100 }, { name: 'Big1', stack: 1000 }, { name: 'Big2', stack: 1000 }],
    { random: seededRandom(3) },
  );
  game.startHand();
  // Set up the showdown by hand: Short has the best hand, Big1 beats Big2.
  game.board = parseCards('2c 7d 9h Js 3c');
  game.players[0].hole = parseCards('Ah Ad');
  game.players[1].hole = parseCards('Kh Kd');
  game.players[2].hole = parseCards('Qh Qd');
  for (const [i, total] of [[0, 100], [1, 500], [2, 500]]) {
    const p = game.players[i];
    p.stack = p.stack + p.totalBet - total;
    p.totalBet = total;
  }
  game.showdown();
  const won = Object.fromEntries(game.results.map((r) => [r.player.name, r.amount]));
  assert.equal(won.Short, 300); // main pot: 100 from each player
  assert.equal(won.Big1, 800);  // side pot: 400 more from each big stack
  assert.equal(totalChips(game), 2100);
});

test('bots can play 200 hands without breaking the rules or losing chips', () => {
  const game = newGame(4, 7);
  const random = seededRandom(99);
  for (let hand = 0; hand < 200 && !game.isGameOver; hand++) {
    game.startHand();
    if (game.phase === 'gameOver') break;
    let guard = 0;
    while (game.phase !== 'handOver') {
      game.act(decideAction(game, random));
      assert.ok(++guard < 200, 'hand did not finish');
    }
    assert.equal(totalChips(game), 4000);
    for (const p of game.players) assert.ok(p.stack >= 0);
  }
});

test('blinds go up every N hands and stop at the last level', () => {
  const levels = [{ small: 10, big: 20 }, { small: 25, big: 50 }, { small: 50, big: 100 }];
  const game = new Game([{ name: 'A' }, { name: 'B' }], {
    blindLevels: levels, handsPerLevel: 2, random: seededRandom(5), startingStack: 100000,
  });
  const blindsByHand = [];
  for (let hand = 1; hand <= 7; hand++) {
    game.startHand();
    blindsByHand.push(game.bigBlind);
    assert.equal(game.pot, game.smallBlind + game.bigBlind);
    game.act({ type: 'fold' });
  }
  assert.deepEqual(blindsByHand, [20, 20, 50, 50, 100, 100, 100]);
  assert.equal(game.handsUntilNextLevel, null);
});

test('the hand history announces when the blinds go up', () => {
  const game = new Game([{ name: 'A' }, { name: 'B' }], {
    blindLevels: [{ small: 10, big: 20 }, { small: 25, big: 50 }], handsPerLevel: 1,
    random: seededRandom(5),
  });
  game.startHand();
  game.act({ type: 'fold' });
  game.startHand();
  assert.ok(game.log.includes('Blinds go up to 25/50'));
});