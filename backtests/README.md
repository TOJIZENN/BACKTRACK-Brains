# Backtests

Automated strategy tests that run outside the replay app, on CSV candle files.

| File | What it does |
|---|---|
| `fetch_dukascopy.py` | Downloads XAU/USD 1-minute candles (mid of bid/ask, UTC) from Dukascopy's free API into a CSV. Resumable: each day is cached next to the output. |
| `vp_backtest.py` | Backtests the three setups of the *Volume Profile Trading Blueprint* (POC bounce, value-area reversal, breakout) and writes trade lists. |
| `kronos_eval.py` | Tests whether the open-source [Kronos](https://github.com/shiyu-coder/Kronos) candlestick model's forecasts carry an edge: trading its forecast direction, and using it as a filter on another backtest's trades. See [Kronos](#kronos). |

```bash
pip install pandas numpy
python backtests/fetch_dukascopy.py 2015-01-01 2025-10-01 data/XAU_1m.csv
python backtests/vp_backtest.py data/XAU_1m.csv results --sessions nyclose
```

CSV format (both scripts): `Date;Open;High;Low;Close;Volume`, dates like `2025.10.01 05:15`.
`data/`, `results/` and `*.cache/` are git-ignored.

Use `--sessions calendar` (default) for MT4/MT5 broker-time exports, whose day already ends at the
New York close, and `--sessions nyclose` for UTC data such as `fetch_dukascopy.py` output.

## Rules as implemented

The blueprint leaves room for judgment; these are the exact definitions.

- **Profile:** previous session's bars, 60 rows between its low and high, each bar's volume spread
  over the rows it overlaps. POC = heaviest row; value area grown from the POC until it holds 70%.
- **POC bounce:** only after the previous session closed outside the value area. First engulfing
  candle at the POC, in the direction away from it. Stop just beyond the POC (or the pattern's
  extreme) by 0.1 × ATR(14); target 2R. One per session.
- **VA reversal:** only after the previous session closed inside the value area. A close outside,
  then a close back inside (wicks don't count). Stop beyond the excursion's extreme. Repeats.
- **Breakout:** a close outside the value area; a pullback of at least 50% of the breakout leg that
  stays within 25% of the value-area height back inside; then a close beyond the pre-pullback
  extreme (break of structure). Stop beyond the pullback.
- **Execution:** fills at the next bar's open; one position at a time per setup; if one bar hits both
  stop and target, the stop counts (as in the replay app's default). Costs: 0.01% of price per trade.

## Results so far (15m broker data, Jun 2004 – Oct 2025)

| Setup | Trades | Win rate | Avg R after costs | Last 5 yrs avg R |
|---|---|---|---|---|
| POC bounce | 421 | 34.7% | −0.04 | −0.08 |
| VA reversal | 3,127 | 35.8% | +0.02 | −0.09 |
| Breakout | 3,872 | 34.5% | −0.02 | −0.08 |
| Combined | 5,320 | 34.5% | −0.02 | −0.11 |

No edge after costs. 1R/1.5R/3R targets and a TP-first fill rule didn't change that; the 1h chart was
slightly positive (+0.03 to +0.06R) but within noise.

## Kronos

[Kronos](https://github.com/shiyu-coder/Kronos) (MIT, AAAI 2026) is a foundation model pre-trained on
candlesticks from 45+ exchanges. Its weights are on Hugging Face, so the machine running the test needs
access to `huggingface.co` (in a Claude Code cloud environment, allow it under Network access).

```bash
git clone https://github.com/shiyu-coder/Kronos
pip install torch einops safetensors huggingface_hub pandas numpy tqdm
# 1. Trade Kronos's 24-hour forecast direction once a day on 1h candles
python backtests/kronos_eval.py --kronos-dir Kronos --csv data/XAU_1h.csv --out results/kronos_dir_1h.csv
# 2. Keep another backtest's trades only when Kronos agrees with them
python backtests/kronos_eval.py --kronos-dir Kronos --csv data/XAU_1h.csv --trades results/trades.csv --out results/kronos_filter.csv
```

- **No lookahead:** every forecast uses only candles up to the decision candle; trades enter at the
  next candle's open.
- **Training-data overlap:** Kronos was published in August 2025 and its training data may contain any
  earlier market history, gold included. Results before `--clean-from` (default 2025-08-01) can look
  better than they really are; only results after it are a genuine out-of-sample test. That needs
  candles after August 2025, e.g. from `fetch_dukascopy.py`.
- **Baselines:** each Kronos trade is compared with always-long and momentum trades that use identical
  entry, stop and target rules, so gold's long uptrend isn't mistaken for skill.
- **Speed:** a stand-in with Kronos-small's size (24.7M parameters) took about 15 s per forecast on a
  4-core CPU (400-candle context, 24 candles ahead, 5 sample paths). One forecast a day is then about
  75 min per year of data; the filter test on ~900 trades about 4 hours. Fewer `--samples`, a shorter
  `--horizon`, `--model mini` or a GPU cut that sharply. Runs resume where they stopped.
- `--random-weights` swaps in a tiny untrained model to test the script without downloading anything.

## Next steps

1. Download 1-minute Dukascopy data (needs `jetta.dukascopy.com` in the cloud environment's allowed
   domains) and rerun with signals on 15m/1h bars but stops and targets checked on 1-minute bars.
2. Test rule changes on 2004–2019, then confirm on 2020–2025: session-hour filters (London/New
   York), trading only with the daily trend, breakeven at 1R, end-of-session exits.
