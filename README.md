# Texas Hold'em

A browser-based no-limit Texas Hold'em game in plain JavaScript (no framework, no build step). You play against three bots that decide using **Monte Carlo simulation** and **pot odds**. An on-screen advisor shows you the same numbers the bots use.


## How it's built

| File | Responsibility |
|---|---|
| `src/cards.js` | Cards, `Deck` (Fisher-Yates shuffle), seedable RNG for repeatable tests |
| `src/evaluator.js` | Scores any 5 cards; `bestHand()` picks the best 5 of 7. Scores are arrays compared element by element |
| `src/equity.js` | Monte Carlo: deals the unknown cards thousands of times and counts wins (ties = split share) |
| `src/game.js` | The rules engine: blinds, betting rounds, min-raise rules, all-ins, side pots, showdown. **No DOM code**, so it's fully testable |
| `src/bot.js` | AI decision: equity vs pot odds, value bets, occasional bluffs |
| `src/ui.js` | Renders game state to HTML. Never changes the game |
| `src/main.js` | Wires it together: the turn loop, button events, bot timing |
| `tests/` | 23 tests (Node's built-in test runner) |

**Key design choice:** the engine (`game.js`) knows nothing about the browser, and the UI only reads state and calls `game.act(...)`. That separation is what makes the rules testable.

### The bot's logic

1. Estimate **equity** (win chance) with 700 random run-outs against the opponents still in the hand.
2. Compute **pot odds** = amount to call / (pot + amount to call).
3. Equity above 70%: raise. Facing a bet: call only if equity beats the pot odds. Checked to: value-bet good hands, bluff about 6% of the time.

### Tests worth reading
- Wheel straight (A-2-3-4-5), kickers, two-pair and full-house ordering, split pots
- Pocket aces about 85% against one random hand (checks the simulation)
- Big blind gets the option, a raise reopens the action, min-raise enforcement
- **Side pots:** a short all-in can only win what they matched
- **200 bot-vs-bot hands:** total chips never change and no hand gets stuck
