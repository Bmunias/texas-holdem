import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCards, seededRandom } from '../src/cards.js';
import { estimateEquity } from '../src/equity.js';

const rng = () => seededRandom(42);

test('pocket aces are about 85% against one random hand', () => {
  const equity = estimateEquity(parseCards('Ah Ad'), [], 1, 5000, rng());
  assert.ok(equity > 0.82 && equity < 0.88, `got ${equity}`);
});

test('equity drops with more opponents', () => {
  const vsOne = estimateEquity(parseCards('Ah Ad'), [], 1, 3000, rng());
  const vsThree = estimateEquity(parseCards('Ah Ad'), [], 3, 3000, rng());
  assert.ok(vsThree < vsOne);
});

test('a made royal flush on the river always wins', () => {
  const board = parseCards('Qh Jh Th 2c 3d');
  assert.equal(estimateEquity(parseCards('Ah Kh'), board, 2, 500, rng()), 1);
});

test('when the board plays for everyone, equity is a split pot', () => {
  const board = parseCards('Ac Kc Qc Jc Tc');
  const equity = estimateEquity(parseCards('2d 3h'), board, 1, 500, rng());
  assert.equal(equity, 0.5);
});
