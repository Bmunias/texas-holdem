// Rendering: turns the game state into HTML. Never changes the game itself.

import { cardId, rankSymbol, suitSymbol } from './cards.js';

const $ = (id) => document.getElementById(id);

function cardHtml(card, { hidden = false, highlight = false } = {}) {
  if (hidden) return '<div class="card back" aria-label="Hidden card"></div>';
  const red = card.suit === 'h' || card.suit === 'd';
  const rank = rankSymbol(card.rank).replace('T', '10');
  return `<div class="card${red ? ' red' : ''}${highlight ? ' best' : ''}" aria-label="${rank}${card.suit}">
    <span class="rank">${rank}</span><span class="suit">${suitSymbol(card.suit)}</span></div>`;
}

export function render(game, { revealAll = false, boardCount = game.board.length, hideResults = false } = {}) {
  // While the board is still being revealed, act as if the hand isn't over yet.
  const handOver = game.phase === 'handOver' && !hideResults;
  const winners = new Set(game.results.map((r) => r.player));
  // Cards that made a winning hand get highlighted at showdown.
  const winningCards = new Set(
    game.results.filter((r) => r.hand).flatMap((r) => r.hand.cards.map(cardId)),
  );
  const shownDown = handOver && game.results.some((r) => r.hand);

  game.players.forEach((p, i) => {
    const seat = $(`seat-${i}`);
    if (!seat) return;
    const showCards = p.isHuman || ((revealAll || shownDown) && !p.folded);
    const isActive = !hideResults && !handOver && game.phase !== 'gameOver' && game.current === i;
    const busted = p.out && !hideResults; // don't show "Busted" before the river is revealed

    seat.className = seat.className.replace(/\s?(active|folded|out|winner)/g, '');
    if (isActive) seat.classList.add('active');
    if (p.folded) seat.classList.add('folded');
    if (busted) seat.classList.add('out');
    if (handOver && winners.has(p)) seat.classList.add('winner');

    let status = '';
    if (busted) status = 'Busted';
    else if (p.folded) status = 'Folded';
    else if (p.allIn) status = 'All-in';
    const result = game.results.find((r) => r.player === p);
    // Don't spoil the result: show stacks as they were before the pot was paid out.
    const stack = hideResults && result ? p.stack - result.amount : p.stack;
    if (handOver && result) status = `Wins ${result.amount}${result.hand ? ` — ${result.hand.category}` : ''}`;

    seat.innerHTML = `
      <div class="seat-name">${p.name}${i === game.dealer ? '<span class="dealer-chip" title="Dealer">D</span>' : ''}</div>
      <div class="seat-stack">${stack} chips</div>
      <div class="seat-cards">${p.hole
        .map((c) => cardHtml(c, { hidden: !showCards, highlight: shownDown && winningCards.has(cardId(c)) }))
        .join('')}</div>
      <div class="seat-bet">${p.bet > 0 ? `Bet: ${p.bet}` : ''}</div>
      <div class="seat-status">${status}</div>`;
  });

  $('board').innerHTML = game.board
    .slice(0, boardCount)
    .map((c) => cardHtml(c, { highlight: shownDown && winningCards.has(cardId(c)) }))
    .join('');
  const pot = hideResults ? game.results.reduce((sum, r) => sum + r.amount, 0) : game.pot;
  $('pot').textContent = handOver ? '' : `Pot: ${pot}`;

  // The log already contains the river and the winner, so don't update it mid-reveal.
  if (!hideResults) {
    $('log').innerHTML = game.log.map((line) => `<li>${line}</li>`).join('');
    $('log').scrollTop = $('log').scrollHeight;
  }
}

export function setMessage(text) {
  $('message').textContent = text;
}

export function setAdvisor(html) {
  $('advisor').innerHTML = html;
}

/** Enable and label the action buttons for the human's turn (or disable them all). */
export function updateControls(game, humanTurn) {
  const fold = $('fold');
  const checkCall = $('check-call');
  const raise = $('raise');
  const slider = $('raise-slider');
  const input = $('raise-input');

  if (!humanTurn) {
    for (const el of [fold, checkCall, raise, slider, input]) el.disabled = true;
    checkCall.textContent = 'Check / Call';
    raise.textContent = 'Raise';
    input.value = '';
    return;
  }

  const legal = game.legalActions();
  fold.disabled = legal.canCheck; // no reason to fold when checking is free
  checkCall.disabled = false;
  checkCall.textContent = legal.canCheck ? 'Check' : `Call ${legal.toCall}`;

  raise.disabled = slider.disabled = input.disabled = !legal.canRaise;
  if (legal.canRaise) {
    for (const el of [slider, input]) {
      el.min = legal.minRaiseTo;
      el.max = legal.maxRaiseTo;
      el.value = legal.minRaiseTo;
    }
    raise.textContent = game.currentBet === 0 ? 'Bet' : 'Raise to';
  }
}