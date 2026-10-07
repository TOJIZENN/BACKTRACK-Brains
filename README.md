# Backtrack — XAU/USD Historical Replay & Manual Backtesting

> **Simulation only.** This application replays *historical* market data and simulates trades locally.
> It never places orders, never connects to a live trading account, and the market-data provider
> (**Dukascopy** by default, or Twelve Data / OANDA) is used **only** as a source of historical candles. It is for education and personal backtesting.

## Project Overview

Backtrack is a free, local alternative to paid chart-replay tools, focused on **manual price-action
backtesting of gold (XAU/USD)**. You pick a date and time, the chart shows only what had happened up to
that moment, and you step the market forward candle by candle (or play it automatically) while placing
simulated BUY/SELL trades with a stop loss and take profit. The app resolves each trade as new candles
appear and keeps a full trade journal with P&L, R multiples and account statistics.

It is **not** an automated strategy tester: every trading decision is made by you.

## Features

- XAU/USD on **M1, M5 (default), M15, H1**, loaded from **Dukascopy** (default, free, no key), Twelve Data or OANDA, switchable with one env variable
- Replay setup screen: timeframe, date, start time, **time zone (default Kolkata, IST UTC+05:30)**,
  starting balance, risk %, same-candle rule,
  plus a "random date" button
- Strict **no-lookahead** replay: only closed candles up to the replay point are ever rendered
- Controls: Play / Pause, Next, Previous, Reset, speed 0.5x / 1x / 2x / 5x / 10x, Jump to date
- **Dynamic timeframe switching** mid-replay (1m · 5m · 15m · 1h in the top bar), keeping the replay time,
  balance, open positions, drawings and speed
- Forward data is prefetched in the background, so a replay can run across days and weekends
- Market BUY / SELL with SL and TP, live position-size, risk, potential-profit and R:R preview
- Automatic SL/TP detection on every new candle, with a configurable **same-candle rule**
- "Close at market" from the positions list, entry/SL/TP lines and entry/exit markers on the chart
- Dashboard: starting/current balance, equity, total P&L, win rate, number of trades, winners, losers,
  average R, profit factor, maximum drawdown
- Sortable trade history (by number, date, result, P&L) and an equity curve
- Keyboard shortcuts, toasts for opened/closed trades, clear error messages
- TradingView **Lightweight Charts** with zoom, pan, crosshair and auto-scaling, and no indicators by design
- TradingView dark colour theme (`#131722` background, `#089981` / `#f23645` candles, `#2962ff` accent)
- **Chart settings** like TradingView: candle body / border / wick colours (up & down), background, grid,
  crosshair and scale text, plus presets (TradingView dark/light, classic, monochrome). Saved in the browser
- **Drawing tools**: trend line, ray, horizontal line, vertical line, rectangle, path and Fib retracement;
  select, drag, recolour, change width, delete
- **TradingView-style buy/sell widget** on the chart's top-left: `[price SELL] [risk %] [price BUY]` with a
  compact SL/TP row underneath (R:R, $ risk, size, potential profit). The chart uses the full width; there is no side panel
- **Positions in the bottom panel**: open trades show live (unrealized) P&L and R with a **Close** button
- **Flexible layout** (desktop): drag the *Trades & performance* strip up/down to resize the bottom panel; drag
  it all the way down (or double-click it) to collapse it for full height. The layout is remembered

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
│     ├─ services/twelvedata/  twelvedata.client.ts (HTTP + error mapping), twelvedata.service.ts
│     │                        (normalization), twelvedata.types.ts (raw shapes, never leave this folder)
│     ├─ services/oanda/       same structure for the optional OANDA provider
│     ├─ services/         candleSource.ts (provider interface), candleSource.factory.ts (DATA_PROVIDER),
│     │                    candles.service.ts (range → days → cache/upstream), candleCache.ts
│     ├─ controllers/ routes/ middleware/ config/ types/ utils/
├─ .env.example
└─ README.md
```

Data flow:

```
Twelve Data / OANDA ──► server (normalize + day-file cache) ──► /api/candles
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

## Market Data Setup

The server loads candles from one provider, chosen with `DATA_PROVIDER`. All providers are normalized
into the same internal `Candle`, so the replay and trading engines don't know or care which one is used.

### Dukascopy (default — free, no API key)

Nothing to set up: leave `DATA_PROVIDER=dukascopy` (or unset). Dukascopy publishes free historical
XAU/USD data back to 2003 at 1-minute resolution, with no account and no published rate limit.

How the integration works (`server/src/services/dukascopy/`):

- Minute candles come as one JSON bucket per UTC day, and hourly candles as one bucket per UTC month,
  from `https://jetta.dukascopy.com/v1/candles/{minute|hour}/XAU-USD/{BID|ASK}/…`. This is the same
  data API the open-source `dukascopy-node` library uses. It is unofficial and undocumented, so its
  format could change.
- Buckets are delta-encoded (base price + per-candle deltas × multiplier); the decoder rebuilds the
  candles and skips closed-market gaps. Bid and ask are averaged into **mid** prices, matching the
  other providers. Minutes with zero volume (no trades) are dropped.
- M5 and M15 are aggregated from M1, so every timeframe is built from the same data. H1 uses the hourly buckets.
- At most 4 requests run in parallel, and every completed day is cached locally, so each day is
  downloaded once.
- Dukascopy's terms of use apply to the data. It is fine for personal backtesting; don't redistribute it.

### Twelve Data

1. Set `DATA_PROVIDER=twelvedata`. Create a free account at [twelvedata.com](https://twelvedata.com) and copy your API key from
   *Account → API Keys*.
2. Set `TWELVE_DATA_API_KEY` in `.env`.

How the integration works (`server/src/services/twelvedata/`):

- Calls `GET https://api.twelvedata.com/time_series` with `symbol=XAU/USD`,
  `interval=1min|5min|15min|1h`, `start_date`/`end_date`, `timezone=UTC`, `order=ASC` and
  `outputsize=5000`. The key is sent as the `apikey` parameter, from the server only.
- Twelve Data reports errors either as an HTTP status or as HTTP 200 with `{"status":"error","code":…}`.
  Both are mapped to the app's error codes (401 → `INVALID_CREDENTIALS`, 429 → `RATE_LIMITED`, 5xx →
  `UPSTREAM_UNAVAILABLE`).
- "No data is available on the specified dates" (weekends, holidays) is treated as an empty range, not an error.
- The still-forming latest bar is dropped. Forex/metal bars have no volume, so `volume` is `0`.
- **Free plan limits:** 8 requests/minute and 800/day. The day-file cache means each day is downloaded
  only once, and a typical M5 session needs just a few requests. If you hit the limit, the app says so;
  wait a minute and continue.
- Check that your plan includes `XAU/USD`. If it doesn't, Twelve Data's message is shown in the app.

### OANDA (optional)

Set `DATA_PROVIDER=oanda`, then:

1. Create an OANDA account. A free **practice (demo)** account is enough because only historical
   data is read.
2. In the OANDA hub, open *Manage API Access* and generate a **personal access token**.
3. Set `OANDA_API_KEY`, and set `OANDA_BASE_URL` to match the token: practice
   `https://api-fxpractice.oanda.com`, live `https://api-fxtrade.oanda.com`.

OANDA candles are mid prices (`price=M`). Twelve Data's XAU/USD feed is a different source, so prices
can differ slightly between providers.

For either provider, the key is read only by the server. The browser talks to our own `/api` endpoints and
never sees it. Only historical candle endpoints are implemented; there is no code path that places orders.

## Environment Variables

Copy `.env.example` to `.env` in the repository root (`.env` is git-ignored). A `server/.env` is
also accepted; if both exist, the root file wins. The server logs which file it loaded on startup, and
`npm run dev` restarts the server automatically when `.env` changes.

| Variable               | Required             | Description                                                     |
| ---------------------- | -------------------- | --------------------------------------------------------------- |
| `DATA_PROVIDER`        | no                   | `dukascopy` (default), `twelvedata` or `oanda`                  |
| `DUKASCOPY_BASE_URL`   | no                   | Default `https://jetta.dukascopy.com/v1` (testing only)         |
| `TWELVE_DATA_API_KEY`  | yes, for Twelve Data | Twelve Data API key                                             |
| `TWELVE_DATA_BASE_URL` | no                   | Default `https://api.twelvedata.com`                            |
| `OANDA_API_KEY`        | yes, for OANDA       | OANDA personal access token                                     |
| `OANDA_ACCOUNT_ID`     | no                   | Not needed for candle data; reserved for future use             |
| `OANDA_BASE_URL`       | no                   | Practice (default) or live REST host                            |
| `PORT`                 | no                   | Server port (default `4000`)                                    |
| `CACHE_DIR`            | no                   | Candle cache directory, relative to `server/` (default `cache`) |
| `UPSTREAM_TIMEOUT_MS`  | no                   | Market-data request timeout (default `15000`)                   |

## Installation

```bash
git clone <this repo>
cd BACKTRACK-Brains
npm install          # installs client + server (npm workspaces)
cp .env.example .env # then edit .env and add your Twelve Data API key
```

## Running Backend

```bash
npm run dev:server   # http://localhost:4000  (tsx watch)
```

Endpoints:

| Method | Path               | Description                                                           |
| ------ | ------------------ | --------------------------------------------------------------------- |
| GET    | `/api/health`      | Server status, active data provider and whether its key is configured |
| GET    | `/api/instruments` | Supported instruments and timeframes                                  |
| GET    | `/api/candles`     | `?instrument=XAU_USD&granularity=M5&from=<ISO>&to=<ISO>` → `{ candles }` |

Candles are returned in our own format (`{ timestamp, open, high, low, close, volume }`,
completed candles only) with open time in `[from, to)`. Errors use `{ error: { code, message } }` with
codes such as `CONFIG_MISSING`, `INVALID_CREDENTIALS`, `RATE_LIMITED`, `UPSTREAM_TIMEOUT`,
`UPSTREAM_UNAVAILABLE` and `BAD_REQUEST`.

**Caching:** responses are cached per provider and UTC day in
`server/cache/twelvedata/XAU_USD/M5/YYYY-MM-DD.json`, so data from different providers never mixes. A day is
cached only once it is fully in the past, so a partially formed day is never stored. Empty days such
as weekends are cached too. Missing days are fetched in chunks that stay under the 5,000-candle-per-request limit that both providers enforce.
Delete the cache folder at any time to force a refetch.

### Troubleshooting

| Symptom | Fix |
| ------- | --- |
| Error mentions **`OANDA_API_KEY`** although you use Twelve Data | You are running code from before the Twelve Data switch: `git pull`, then restart `npm run dev`. Also check that `.env` says `DATA_PROVIDER=twelvedata`. |
| `TWELVE_DATA_API_KEY is not configured` | The server didn't find your `.env`. Check the startup log line `Loaded settings from …` and put `.env` in the repo root. |
| `RATE_LIMITED` | Free plan allows 8 requests/minute. Wait a minute; cached days don't count against the limit. |
| `Could not load more candles` during a replay | Press **Retry** on the banner, or Next/Play at the end of the loaded data. Automatic retries back off for 15 s. |

## Running Frontend

```bash
npm run dev:client   # http://localhost:5173 (proxies /api to :4000)
```

Or run both together with `npm run dev`, then open http://localhost:5173.

Other scripts (root): `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

## Time Zone

Times default to **Asia/Kolkata (IST, UTC+05:30)**. You can pick another zone on the setup screen:
UTC, London, New York, Dubai, Singapore or Tokyo. The zone applies to:

- the date/time you enter on the setup screen and in *Jump to date*
- the chart's time axis and crosshair label
- the current-candle clock, trade history, equity-curve tooltips and messages

Only display and input change. Requests to the server, the candle cache and all trade data stay in UTC,
so switching zones never changes which candles you get. For example, a 15:30 IST start is the same replay
as a 10:00 UTC start. Zones with daylight saving are handled per timestamp. IST has none.

## Timeframe Switching

Use the **1m · 5m · 15m · 1h** buttons in the top bar to change timeframe at any point, like TradingView.
The replay continues from the same moment, and your balance, trade history, **open positions**, drawings
and replay speed carry over.

- **To a lower timeframe** (e.g. 1h → 5m) the switch is exact: you see the 5m bars up to the current time.
- **To a higher timeframe in the middle of a bar** (e.g. 5m at 10:35 → 1h), the current 1h bar would
  contain prices from before *and* after 10:35. So the replay first finishes that bar on the timeframe
  you were on: it reveals the remaining 5m candles up to 11:00 exactly as if you had pressed Next,
  resolving SL/TP on each. Then it switches. A notice says how far it advanced. It never jumps over a gap
  (e.g. a weekend). TradingView instead shows a partially formed bar, which would need 1-minute data
  loaded for every timeframe.
- Trades are only resolved by bars that open at or after their fill time, so an open position is never
  hit by prices from before it was entered, whatever timeframe you are on. Entry/exit markers snap to the
  bar that contains them.
- **Reset** returns to the run's original start on the current timeframe with a fresh account. Drawings stay.

## Chart Settings

Open **Chart settings** (sliders icon in the header). Changes apply live and are remembered in this browser.

- **Symbol:** candle body, border and wick colours for up and down candles. Borders and wicks can each be switched off.
- **Canvas:** background, grid lines (on/off and colour), crosshair and scale text colours.
- **Presets:** TradingView dark (default), TradingView light, Classic green/red and Monochrome.
  **Reset to defaults** restores TradingView dark.

## Drawing Tools

The toolbar on the left of the chart works like TradingView's:

| Tool | How to draw |
| ---- | ----------- |
| Trend line | click two points |
| Ray | click two points; extends to the right edge |
| Horizontal line | click once (shows its price on the right) |
| Vertical line | click once |
| Rectangle | click two opposite corners |
| Path | click to add points; double-click or Enter to finish |
| Fib retracement | click the swing start, then the swing end (0 – 0.236 – 0.382 – 0.5 – 0.618 – 0.786 – 1) |

After a drawing is placed, the tool switches back to the cursor and the drawing is selected. In cursor mode:

- click a drawing to select it
- drag its round handles to move a point, or drag the line itself to move the whole drawing
- use the floating bar to change colour (8 TradingView colours + custom) or line width
- press **Delete** or **Backspace** to remove it; **Esc** cancels a drawing in progress
- the trash icon removes all drawings

Drawings are anchored to **time and price**, not screen pixels, so they stay in place when you zoom, pan, or
reveal new candles. You can draw into the empty area to the right of the latest candle; that area holds no
data, so nothing is revealed. Drawings belong to the current session and survive **Reset**. **New session**
and **Jump to date** start with a clean chart, so lines drawn with knowledge of a later period never appear
in an earlier replay. Placing or dragging a drawing never pans the chart. Clicking empty chart space still
pans as usual.

## Replay Engine Explanation

`client/src/replay/replayEngine.ts` is the core of the app.

- It receives the full loaded dataset and keeps it in a **JavaScript private field** (`#candles`).
  Nothing outside the class can read candles beyond the current position.
- `getVisibleCandles()` returns a frozen `candles.slice(0, currentIndex + 1)`. This is the only data the
  chart receives. Future candles are never sent to React and hidden in the UI; they never reach React at all.
- **Start point:** the replay starts at the **last candle that has fully closed** at your chosen time.
  On M5 with a 15:30 IST start, the last visible candle is the 15:25 candle. The 10:00 candle would contain
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
| B / S     | Buy / Sell using the widget's SL & TP |
| Esc       | Close dialog / leave the focused input / cancel a drawing |
| Del / Backspace | Delete the selected drawing |
| Enter     | Finish a path drawing |

Shortcuts are ignored while typing in an input. Press Esc first.

## Limitations

- **Single price feed (no bid/ask), no spread, commission, swap or slippage.** Results are optimistic compared with real
  execution, especially for tight scalping stops on M1/M5.
- OHLC data hides the path inside a candle. That is why the same-candle rule exists. Lower timeframes reduce
  the ambiguity.
- Market entries only, filled at candle close. No limit or stop entries, trailing stops, partial closes or
  break-even moves yet.
- Position size has no margin, leverage or minimum lot checks.
- Times are shown and entered in the selected zone (default **IST, UTC+05:30**). The server, cache,
  engines and trade records all use UTC internally. The chart shifts bar timestamps by the zone's offset
  for display, which is the standard approach for Lightweight Charts.
- Sessions are kept in memory. Reloading the page or starting a new session discards the trade journal.
- Only XAU/USD is configured, although the data layer and UI are instrument-agnostic.
- With no provider API key the app cannot load data. There is no offline or sample dataset.

## Future Improvements

- Limit/stop entries, break-even and trailing stops, partial take profits
- Spread/commission model
- Persist sessions and journals (JSON → SQLite/PostgreSQL behind `TradingAccount`/a repository)
- CSV export of the trade history; screenshots and notes per trade
- Random-replay mode that hides the date until the session ends
- Multi-timeframe view of the same replay clock
- More instruments (add an entry to `server/src/config/instruments.ts` and `client/src/types/market.ts`)

## Testing

```bash
npm test
```

- **Server (43 tests):** Twelve Data and OANDA normalization and error mapping (including Twelve Data's
  HTTP-200 error bodies, "no data" ranges and forming bars), both real clients against fake HTTP servers, day-chunking and caching, and API validation.
- **Client (79 tests):** replay engine (initial state, next/previous, reset, end of data, speed,
  no-lookahead surface, high-water mark), the playback timer, start-index selection, session
  prefetching, position sizing, SL/TP validation, LONG/SHORT resolution including the spec examples
  (TP hit, SL hit, same-candle conservative/optimistic, gaps), P&L, R and statistics.

## Disclaimer

This software is for educational and backtesting purposes only. It does not execute live trades and
nothing it shows is financial advice. Past performance in a replay does not predict future results.
