// Wires the game engine, the bots and the UI together.

import { decideAction } from './bot.js';
import { estimateEquity } from './equity.js';
import { Game } from './game.js';
import { render, setAdvisor, setMessage, updateControls } from './ui.js';

const BOT_THINK_MIN_MS = 1000;   // bots wait between 1 and 2.5 seconds
const BOT_THINK_MAX_MS = 2500;
const STREET_DELAY_MS = 1300;    // pause after each new street is dealt

/** Random "thinking" time so bots don't all act at the same speed. */
function thinkTime() {
  return BOT_THINK_MIN_MS + Math.random() * (BOT_THINK_MAX_MS - BOT_THINK_MIN_MS);
}
const $ = (id) => document.getElementById(id);

// Tournament-style blinds: they go up every HANDS_PER_LEVEL hands.
const HANDS_PER_LEVEL = 8;
const BLIND_LEVELS = [
  { small: 10, big: 20 },
  { small: 15, big: 30 },
  { small: 25, big: 50 },
  { small: 50, big: 100 },
  { small: 75, big: 150 },
  { small: 100, big: 200 },
  { small: 150, big: 300 },
  { small: 200, big: 400 },
  { small: 300, big: 600 },
  { small: 500, big: 1000 },
];

let game;
let shownBoard = 0; // how many board cards the player has seen so far

function newGame() {
  game = new Game([
    { name: 'You', isHuman: true },
    { name: 'Alice (bot)' },
    { name: 'Bob (bot)' },
    { name: 'Carol (bot)' },
  ], { blindLevels: BLIND_LEVELS, handsPerLevel: HANDS_PER_LEVEL });
  $('new-game').hidden = true;
  dealNextHand();
}

function dealNextHand() {
  $('next-hand').hidden = true;
  shownBoard = 0;
  game.startHand();
  showBlinds();
  update();
}

/** Header line: current blinds and when they go up next. */
function showBlinds() {
  const left = game.handsUntilNextLevel;
  const next = left === null ? 'final level' : `up in ${left} hand${left === 1 ? '' : 's'}`;
  $('blinds-info').textContent =
    `Level ${game.level + 1} · Blinds ${game.smallBlind}/${game.bigBlind} (${next}) · Hand #${game.handNumber}`;
}

/** The main loop: after every action, redraw and decide whose turn it is. */
function update() {
  // New board cards were dealt: reveal them one street at a time first.
  if (game.board.length > shownBoard) {
    revealNextStreet();
    return;
  }

  render(game);

  if (game.phase === 'handOver') {
    updateControls(game, false);
    const summary = game.results
      .map((r) => `${r.player.name} ${r.player.isHuman ? 'win' : 'wins'} ${r.amount}${r.hand ? ` with ${r.hand.category}` : ''}`)
      .join(' · ');
    setMessage(summary);
    setAdvisor('');
    if (game.isGameOver) {
      const human = game.players.find((p) => p.isHuman);
      setMessage(human.stack > 0 ? 'You won the game! 🏆' : 'You are out of chips. Game over.');
      $('new-game').hidden = false;
    } else {
      $('next-hand').hidden = false;
    }
    return;
  }

  const player = game.currentPlayer;
  if (player.isHuman) {
    setMessage('Your turn');
    updateControls(game, true);
    showAdvice();
  } else {
    setMessage(`${player.name} is thinking…`);
    updateControls(game, false);
    setTimeout(() => {
      game.act(decideAction(game));
      update();
    }, thinkTime());
  }
}

/** Shows the flop, turn or river, pauses, then continues the game. */
function revealNextStreet() {
  shownBoard = shownBoard === 0 ? 3 : shownBoard + 1;
  // If the hand already ended (all-in), the engine dealt the whole board at once.
  const runout = game.phase === 'handOver';

  render(game, { boardCount: shownBoard, hideResults: runout, revealAll: runout });
  updateControls(game, false);
  setAdvisor('');
  const street = shownBoard === 3 ? 'flop' : shownBoard === 4 ? 'turn' : 'river';
  setMessage(runout ? `All-in! Dealing the ${street}…` : `Dealing the ${street}…`);

  setTimeout(update, STREET_DELAY_MS);
}

/** Shows the human the same numbers the bots use: win chance vs. pot odds. */
function showAdvice() {
  const me = game.currentPlayer;
  const opponents = game.players.filter((p) => p !== me && game.inHand(p)).length;
  const equity = estimateEquity(me.hole, game.board, opponents, 1500);
  const { toCall } = game.legalActions();
  const potOdds = toCall / (game.pot + toCall);
  let advice = `Win chance vs ${opponents} opponent${opponents > 1 ? 's' : ''}: <strong>${Math.round(equity * 100)}%</strong>`;
  if (toCall > 0) {
    advice += `<br>Pot odds to call: <strong>${Math.round(potOdds * 100)}%</strong>`;
    advice += equity > potOdds ? '<br>Calling is profitable on average.' : '<br>Calling loses money on average.';
  }
  setAdvisor(advice);
}

function humanAct(action) {
  if (game.phase === 'handOver' || !game.currentPlayer.isHuman) return;
  game.act(action);
  update();
}

$('fold').addEventListener('click', () => humanAct({ type: 'fold' }));
$('check-call').addEventListener('click', () => {
  const { canCheck } = game.legalActions();
  humanAct({ type: canCheck ? 'check' : 'call' });
});
$('raise').addEventListener('click', () => humanAct({ type: 'raise', to: Number($('raise-input').value) }));
$('raise-slider').addEventListener('input', (e) => { $('raise-input').value = e.target.value; });
$('raise-input').addEventListener('input', (e) => { $('raise-slider').value = e.target.value; });
$('next-hand').addEventListener('click', dealNextHand);
$('new-game').addEventListener('click', newGame);

newGame();