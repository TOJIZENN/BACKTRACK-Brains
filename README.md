# Backtrack — XAU/USD Historical Replay & Manual Backtesting

> **Simulation only.** This application replays *historical* market data and simulates trades locally.
> It never places orders, never connects to a live trading account, and OANDA is used **only** as a
> source of historical candles. It is for education and personal backtesting.

## Project Overview

Backtrack is a free, local alternative to paid chart-replay tools, focused on **manual price-action
backtesting of gold (XAU/USD)**. You pick a date and time, the chart shows only what had happened up to
that moment, and you step the market forward candle by candle (or play it automatically) while placing
simulated BUY/SELL trades with a stop loss and take profit. The app resolves each trade as new candles
appear and keeps a full trade journal with P&L, R multiples and account statistics.

It is **not** an automated strategy tester: every trading decision is made by you.

## Features

- XAU/USD on **M1, M5 (default), M15, H1**, loaded from OANDA's historical candle API
- Replay setup screen: timeframe, date, start time (UTC), starting balance, risk %, same-candle rule,
  plus a "random date" button
- Strict **no-lookahead** replay: only closed candles up to the replay point are ever rendered
- Controls: Play / Pause, Next, Previous, Reset, speed 0.5x / 1x / 2x / 5x / 10x, Jump to date
- Forward data is prefetched in the background, so a replay can run across days and weekends
- Market BUY / SELL with SL and TP, live position-size, risk, potential-profit and R:R preview
- Automatic SL/TP detection on every new candle, with a configurable **same-candle rule**
- Manual "Close at market", entry/SL/TP lines and entry/exit markers on the chart
- Dashboard: starting/current balance, equity, total P&L, win rate, number of trades, winners, losers,
  average R, profit factor, maximum drawdown
- Sortable trade history (by number, date, result, P&L) and an equity curve
- Keyboard shortcuts, toasts for opened/closed trades, clear error messages
- TradingView **Lightweight Charts** with zoom, pan, crosshair and auto-scaling, and no indicators by design

## Architecture

```
/
├─ client/                 React + Vite + TypeScript + Tailwind
│  └─ src/
│     ├─ replay/           ReplayEngine, ReplayPlayer, start-index & data-window logic   (no React)
│     ├─ trading/          sizing, validation, P&L/R, SL/TP resolution, account, stats  (no React)
│     ├─ store/            ReplaySession: wires data → engine → trading, publishes snapshots
│     ├─ services/         HTTP client for our backend, session loader
│     ├─ chart/            Lightweight Charts wrapper + trade overlays
│     ├─ components/       UI components (chart view, ticket, controls, history, …)
│     ├─ pages/            SetupPage, ReplayPage
│     ├─ hooks/            useReplaySnapshot, useOrderTicket, useKeyboardShortcuts
│     ├─ types/ utils/
├─ server/                 Node + Express + TypeScript
│  └─ src/
│     ├─ services/oanda/   oanda.client.ts (HTTP + error mapping), oanda.service.ts (normalization),
│     │                    oanda.types.ts (raw OANDA shapes, never leave this folder)
│     ├─ services/         candles.service.ts (range → days → cache/upstream), candleCache.ts
│     ├─ controllers/ routes/ middleware/ config/ types/ utils/
├─ .env.example
└─ README.md
```

Data flow:

```
OANDA ──► server (normalize + day-file cache) ──► /api/candles
                                                     │
                     client: sessionLoader ──► ReplayEngine (#private full dataset)
                                                     │  getVisibleCandles() = candles[0..currentIndex]
                                    ReplaySession snapshot ──► React (chart, panels)
                                                     │
                                  TradingAccount.processCandle(newly revealed candle)
```

The replay and trading engines are plain TypeScript classes/functions with no React imports. React
subscribes to `ReplaySession` via `useSyncExternalStore` and only ever receives immutable snapshots.
Persistence is deliberately absent from the MVP: `TradingAccount` and `CandleCache` are the seams where
a database (MongoDB/PostgreSQL) can be added later without touching the engines.

## Tech Stack

| Layer    | Choice                                                          |
| -------- | --------------------------------------------------------------- |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, Lightweight Charts 5 |
| Backend  | Node.js (≥ 20), Express 5, TypeScript, Axios                    |
| Testing  | Vitest (+ Supertest on the server)                              |
| Linting  | oxlint, `tsc` type checks                                       |
| Storage  | JSON files for the candle cache; no database                    |

## OANDA Setup

1. Create an OANDA account. A free **practice (demo)** account is enough because only historical
   data is read.
2. In the OANDA hub, open *Manage API Access* and generate a **personal access token**.
3. Note whether the token is for the practice or live environment and set `OANDA_BASE_URL` to match:
   - Practice: `https://api-fxpractice.oanda.com`
   - Live: `https://api-fxtrade.oanda.com`

The token is read only by the server. The browser talks to our own `/api` endpoints and never sees the key.
The OANDA client only implements the historical **candles** endpoint. There is no code path that places orders.

## Environment Variables

Copy `.env.example` to `.env` in the repository root (`.env` is git-ignored):

| Variable           | Required | Description                                                          |
| ------------------ | -------- | -------------------------------------------------------------------- |
| `OANDA_API_KEY`    | yes      | OANDA personal access token                                          |
| `OANDA_ACCOUNT_ID` | no       | Not needed for candle data; reserved for future account-scoped calls |
| `OANDA_BASE_URL`   | yes      | Practice or live REST host (see above)                               |
| `PORT`             | no       | Server port (default `4000`)                                         |
| `CACHE_DIR`        | no       | Candle cache directory, relative to `server/` (default `cache`)      |
| `OANDA_TIMEOUT_MS` | no       | OANDA request timeout (default `15000`)                              |

## Installation

```bash
git clone <this repo>
cd BACKTRACK-Brains
npm install          # installs client + server (npm workspaces)
cp .env.example .env # then edit .env and add your OANDA token
```

## Running Backend

```bash
npm run dev:server   # http://localhost:4000  (tsx watch)
```

Endpoints:

| Method | Path               | Description                                                           |
| ------ | ------------------ | --------------------------------------------------------------------- |
| GET    | `/api/health`      | Server status and whether the OANDA key is configured                 |
| GET    | `/api/instruments` | Supported instruments and timeframes                                  |
| GET    | `/api/candles`     | `?instrument=XAU_USD&granularity=M5&from=<ISO>&to=<ISO>` → `{ candles }` |

Candles are returned in our own format (`{ timestamp, open, high, low, close, volume }`, mid prices,
completed candles only) with open time in `[from, to)`. Errors use `{ error: { code, message } }` with
codes such as `CONFIG_MISSING`, `INVALID_CREDENTIALS`, `RATE_LIMITED`, `UPSTREAM_TIMEOUT`,
`UPSTREAM_UNAVAILABLE` and `BAD_REQUEST`.

**Caching:** responses are cached per UTC day in `server/cache/XAU_USD/M5/YYYY-MM-DD.json`. A day is
cached only once it is fully in the past, so a partially formed day is never stored. Empty days such
as weekends are cached too. Missing days are fetched in chunks that stay under OANDA's 5,000-candle limit.
Delete the cache folder at any time to force a refetch.

## Running Frontend

```bash
npm run dev:client   # http://localhost:5173 (proxies /api to :4000)
```

Or run both together with `npm run dev`, then open http://localhost:5173.

Other scripts (root): `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

## Replay Engine Explanation

`client/src/replay/replayEngine.ts` is the core of the app.

- It receives the full loaded dataset and keeps it in a **JavaScript private field** (`#candles`).
  Nothing outside the class can read candles beyond the current position.
- `getVisibleCandles()` returns a frozen `candles.slice(0, currentIndex + 1)`. This is the only data the
  chart receives. Future candles are never sent to React and hidden in the UI; they never reach React at all.
- **Start point:** the replay starts at the **last candle that has fully closed** at your chosen time.
  On M5 with a 10:00 start, the last visible candle is the 09:55 candle. The 10:00 candle would contain
  price action after 10:00, so it stays hidden.
- `next()` reveals exactly one candle. `previous()` steps back for review. `reset()` returns to the
  starting point.
- **High-water mark (`maxRevealedIndex`):** stepping back and then forward again re-shows candles that
  were already seen. Those are flagged `isNew: false`, so trades are never resolved twice. New orders are
  only accepted at the **live edge** (`currentIndex === maxRevealedIndex`). Otherwise you could peek
  ahead, step back, and trade with hindsight.
- **Speed:** each candle is revealed every `1000 ms / speed` (0.5x = 2 s, 10x = 100 ms). Playback timing
  lives in `ReplayPlayer`, which uses a `setTimeout` chain so speed changes apply on the next candle.
- **Forward data:** the session loads some history before the start (e.g. 4 days on M5) and a forward
  window, then prefetches the next window in the background when fewer than 200 unrevealed candles remain.
  Playback waits if it reaches the end of the buffer while a fetch is in flight.
- **Random replay:** `pickRandomStartIndex()` exists in `replay/startIndex.ts`. The setup screen also has a
  "random date & time" picker.

## Trading Engine Explanation

`client/src/trading/` holds pure, unit-tested logic:

| File                  | Responsibility                                                       |
| --------------------- | -------------------------------------------------------------------- |
| `positionSizing.ts`   | risk $ from balance × risk %, units from risk ÷ stop distance        |
| `validation.ts`       | SL/TP placement rules per side                                       |
| `pnl.ts`              | P&L, R multiple, planned R:R, WIN/LOSS/BREAKEVEN                     |
| `resolution.ts`       | Did this candle hit SL or TP, and at what price?                     |
| `tradingAccount.ts`   | open / resolve / manually close trades, balance and equity           |
| `statistics.ts`       | dashboard metrics and equity curve                                   |

- **Entry:** market orders fill at the **close of the current replay candle**. `entryTime` is that
  candle's close time. The `entryType` field (`'MARKET'`) is the extension point for future limit orders.
- **Validation:** LONG requires `SL < entry < TP`; SHORT requires `TP < entry < SL`. A position that
  rounds to zero units is rejected too.
- **Resolution:** runs once for each *newly revealed* candle and never on the entry candle itself:
  - LONG: SL hit if `low ≤ SL`, TP hit if `high ≥ TP`
  - SHORT: SL hit if `high ≥ SL`, TP hit if `low ≤ TP`
  - **Gaps:** if a candle *opens* beyond the SL or TP, the exit fills at the **open price**, because the
    level was skipped. This is unambiguous, so the same-candle rule is not needed.
- Exit times are the open time of the candle in which the exit happened.

## Same-Candle Execution Rule

A single OHLC candle can touch both the stop loss and the take profit. For example, a LONG with entry 100,
SL 95 and TP 105 meets a candle with high 106 and low 94. OHLC data cannot tell which level was hit first.
The app never guesses silently. It applies the rule you choose:

| Rule                              | Behaviour                         |
| --------------------------------- | --------------------------------- |
| **Conservative — SL first** (default) | the trade is closed at the stop loss |
| Optimistic — TP first             | the trade is closed at the take profit |

The active rule appears in the replay header. Trades decided by it are marked **⚠** in the trade
history, and their notification says "(same-candle rule)". The rule applies only when the candle opened
between SL and TP. Gaps are handled as described above.

## Risk/P&L Calculation

For XAU/USD, 1 unit = 1 troy ounce and P&L is in USD (`quoteValuePerUnit = 1`).

```
risk budget   = current balance × risk %                         ($10,000 × 1% = $100)
stop distance = |entry − stop loss|                              (4321.50 − 4315.50 = 6.00)
units         = floor(risk budget ÷ stop distance, 0.01 oz)      (100 ÷ 6 = 16.66 oz)
risk amount   = units × stop distance                            ($99.96, the real risk after rounding)
P&L           = (exit − entry) × units      (LONG)
              = (entry − exit) × units      (SHORT)
R multiple    = P&L ÷ risk amount                                (+$200 → +2R, −$100 → −1R)
```

- **Balance** = starting balance + realized P&L. New trades size off the current balance, so risk compounds.
- **Equity** = balance + unrealized P&L of open positions, marked at the latest revealed close.
- **Win rate** = wins ÷ closed trades. **Average R** = mean R of closed trades.
- **Profit factor** = gross profit ÷ gross loss. It shows ∞ when there are wins and no losses.
- **Max drawdown** = largest peak-to-trough fall of the closed-trade balance, in $ and % of the peak.

## Keyboard Shortcuts

| Key       | Action                               |
| --------- | ------------------------------------ |
| Space     | Play / Pause                         |
| →         | Next candle                          |
| ←         | Previous candle                      |
| R         | Reset replay (asks to confirm if there are trades) |
| B / S     | Buy / Sell using the order ticket's SL & TP |
| Esc       | Close dialog / leave the focused input |

Shortcuts are ignored while typing in an input. Press Esc first.

## Limitations

- **Mid prices, no spread, commission, swap or slippage.** Results are optimistic compared with real
  execution, especially for tight scalping stops on M1/M5.
- OHLC data hides the path inside a candle. That is why the same-candle rule exists. Lower timeframes reduce
  the ambiguity.
- Market entries only, filled at candle close. No limit or stop entries, trailing stops, partial closes or
  break-even moves yet.
- Position size has no margin, leverage or minimum lot checks.
- All times are **UTC**.
- Sessions are kept in memory. Reloading the page or starting a new session discards the trade journal.
- Only XAU/USD is configured, although the data layer and UI are instrument-agnostic.
- With no OANDA key the app cannot load data. There is no offline or sample dataset.

## Future Improvements

- Limit/stop entries, break-even and trailing stops, partial take profits
- Spread/commission model (OANDA bid/ask candles are available)
- Persist sessions and journals (JSON → SQLite/PostgreSQL behind `TradingAccount`/a repository)
- CSV export of the trade history; screenshots and notes per trade
- Random-replay mode that hides the date until the session ends
- Multi-timeframe view of the same replay clock
- More instruments (add an entry to `server/src/config/instruments.ts` and `client/src/types/market.ts`)

## Testing

```bash
npm test
```

- **Server (28 tests):** OANDA normalization, error mapping, the real client against a fake OANDA HTTP
  server, day-chunking and caching, and API validation.
- **Client (79 tests):** replay engine (initial state, next/previous, reset, end of data, speed,
  no-lookahead surface, high-water mark), the playback timer, start-index selection, session
  prefetching, position sizing, SL/TP validation, LONG/SHORT resolution including the spec examples
  (TP hit, SL hit, same-candle conservative/optimistic, gaps), P&L, R and statistics.

## Disclaimer

This software is for educational and backtesting purposes only. It does not execute live trades and
nothing it shows is financial advice. Past performance in a replay does not predict future results.
