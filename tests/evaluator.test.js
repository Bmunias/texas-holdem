import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCards } from '../src/cards.js';
import { bestHand, compareScores, evaluateFive } from '../src/evaluator.js';

const five = (text) => evaluateFive(parseCards(text));
const best = (text) => bestHand(parseCards(text));
const beats = (a, b) => compareScores(a.score, b.score) > 0;

test('recognizes every category', () => {
  const cases = {
    'Straight Flush': 'Ah Kh Qh Jh Th',
    'Four of a Kind': '9c 9d 9h 9s 2c',
    'Full House': 'Kc Kd Ks 4h 4c',
    Flush: '2h 7h 9h Jh Ah',
    Straight: '5c 6d 7h 8s 9c',
    'Three of a Kind': 'Qc Qd Qh 7s 2c',
    'Two Pair': 'Jc Jd 4h 4s Ac',
    Pair: 'Tc Td 8h 4s 2c',
    'High Card': 'Ac Jd 8h 4s 2c',
  };
  for (const [category, hand] of Object.entries(cases)) {
    assert.equal(five(hand).category, category, hand);
  }
});

test('wheel A-2-3-4-5 is a 5-high straight', () => {
  const wheel = five('Ac 2d 3h 4s 5c');
  assert.equal(wheel.category, 'Straight');
  assert.ok(beats(five('2c 3d 4h 5s 6c'), wheel));
});

test('ace does not wrap around (Q-K-A-2-3 is not a straight)', () => {
  assert.equal(five('Qc Kd Ah 2s 3c').category, 'High Card');
});

test('kickers break ties', () => {
  assert.ok(beats(five('Tc Td Ah 4s 2c'), five('Th Ts Kh 4c 2d')));
});

test('two pair compares the top pair first', () => {
  assert.ok(beats(five('Kc Kd 2h 2s 3c'), five('Qc Qd Jh Js Ac')));
});

test('full house compares the three of a kind first', () => {
  assert.ok(beats(five('3c 3d 3h 2s 2c'), five('2h 2d 2s Ac Ad')));
});

test('identical ranks in different suits tie', () => {
  assert.equal(compareScores(five('Ac Kd Qh Js 9c').score, five('Ad Kc Qs Jh 9d').score), 0);
});

test('best of 7 finds a flush over a straight', () => {
  assert.equal(best('Ah 2h 5h 6h 7c 8d 9h').category, 'Flush');
});

test('the board can play for everyone (split pot)', () => {
  const board = 'Ac Kc Qc Jc Tc';
  assert.equal(compareScores(best(`2d 3h ${board}`).score, best(`4s 5d ${board}`).score), 0);
});

test('rejects the wrong number of cards', () => {
  assert.throws(() => best('Ah Kd'));
});
