"""Does the Kronos candlestick foundation model give an edge on XAU/USD?

Kronos (https://github.com/shiyu-coder/Kronos, MIT) forecasts future OHLCV candles from past ones.
Two tests, both strictly no-lookahead: each forecast sees only the bars up to the decision bar, and
the price window is normalised by Kronos itself using that window alone.

1. Direction test (default). Every --every bars, forecast the next --horizon bars from the last
   --lookback bars. Trade the forecast direction at the next bar's open: stop 1 ATR(14), target 2R,
   resolved on the same bars (stop first if one bar hits both; only the stop inside the entry bar),
   closed at market after --max-hold bars. Two baselines use identical trade rules: always long
   (gold rose ~10x since 2004) and momentum (direction of the last --horizon bars).
2. Filter test (--trades FILE). For each trade of an earlier backtest (needs entry_time, side, r),
   forecast from the last closed bar before its entry and keep it only if Kronos agrees with it.

Kronos's paper came out in August 2025, so its training data may include any market history before
that. Every report is split at --clean-from (default 2025-08-01): only results after it are a real
out-of-sample test.

Setup:
  git clone https://github.com/shiyu-coder/Kronos
  pip install torch einops safetensors huggingface_hub pandas numpy tqdm
  python backtests/kronos_eval.py --kronos-dir Kronos --csv data/XAU_1h.csv --out results/kronos_1h.csv
Weights download from huggingface.co on first use (~100 MB for Kronos-small). CPU works; a GPU is
much faster. The output CSV is appended batch by batch, so an interrupted run resumes where it stopped.
"""
import argparse
import os
import sys

import numpy as np
import pandas as pd

MODELS = {  # name: (model repo, tokenizer repo, max context)
    'mini': ('NeoQuasar/Kronos-mini', 'NeoQuasar/Kronos-Tokenizer-2k', 2048),
    'small': ('NeoQuasar/Kronos-small', 'NeoQuasar/Kronos-Tokenizer-base', 512),
    'base': ('NeoQuasar/Kronos-base', 'NeoQuasar/Kronos-Tokenizer-base', 512),
}
COST_PCT = 0.0001   # spread + commission per trade, as a fraction of price


def load_csv(path):
    d = pd.read_csv(path, sep=';')
    out = pd.DataFrame({
        'timestamps': pd.to_datetime(d['Date'], format='%Y.%m.%d %H:%M'),
        'open': d['Open'].astype(float), 'high': d['High'].astype(float),
        'low': d['Low'].astype(float), 'close': d['Close'].astype(float),
        'volume': d['Volume'].astype(float),
    })
    pc = out.close.shift()
    tr = np.maximum(out.high - out.low, np.maximum((out.high - pc).abs(), (out.low - pc).abs()))
    out['atr'] = tr.rolling(14).mean()
    return out


def load_predictor(args):
    import torch
    sys.path.insert(0, os.path.abspath(args.kronos_dir))
    from model import Kronos, KronosPredictor, KronosTokenizer

    torch.manual_seed(args.seed)
    torch.set_num_threads(os.cpu_count() or 1)
    if args.random_weights:  # mechanics test only: tiny untrained model, forecasts are noise
        tok = KronosTokenizer(d_in=6, d_model=32, n_heads=2, ff_dim=64, n_enc_layers=1, n_dec_layers=1,
                              ffn_dropout_p=0, attn_dropout_p=0, resid_dropout_p=0, s1_bits=4, s2_bits=4,
                              beta=0.05, gamma0=1.0, gamma=1.1, zeta=0.05, group_size=4)
        model = Kronos(s1_bits=4, s2_bits=4, n_layers=1, d_model=32, n_heads=2, ff_dim=64, ffn_dropout_p=0,
                       attn_dropout_p=0, resid_dropout_p=0, token_dropout_p=0, learn_te=True)
        max_ctx = 512
    else:
        repo, tok_repo, max_ctx = MODELS[args.model]
        tok = KronosTokenizer.from_pretrained(tok_repo)
        model = Kronos.from_pretrained(repo)
    tok.eval(); model.eval()
    if args.lookback > max_ctx:
        raise SystemExit(f'--lookback {args.lookback} exceeds Kronos-{args.model} context of {max_ctx}')
    return KronosPredictor(model, tok, device=args.device, max_context=max_ctx)


def forecast(pred, d, idx, args):
    """Forecast for each decision bar in idx (uses bars idx-lookback+1 .. idx only)."""
    cols = ['open', 'high', 'low', 'close', 'volume']
    dfs, xts, yts = [], [], []
    for i in idx:
        win = d.iloc[i - args.lookback + 1:i + 1]
        dfs.append(win[cols].reset_index(drop=True))
        xts.append(win.timestamps.reset_index(drop=True))
        # Future timestamps carry no price information; regular steps from the last bar.
        step = d.timestamps.iloc[i] - d.timestamps.iloc[i - 1]
        step = min(step, d.timestamps.diff().iloc[i - args.lookback + 1:i + 1].median())
        yts.append(pd.Series(d.timestamps.iloc[i] + step * np.arange(1, args.horizon + 1)))
    out = pred.predict_batch(dfs, xts, yts, pred_len=args.horizon, T=args.temperature, top_p=args.top_p,
                             sample_count=args.samples, verbose=False)
    return [(p.close.iloc[-1] / d.close.iloc[i] - 1, p.high.max(), p.low.min()) for p, i in zip(out, idx)]


def trade_r(d, i, side, args):
    """Enter at the open of bar i+1 in `side`; stop 1 ATR, target 2R; returns R after costs or None."""
    n = len(d)
    if i + 1 >= n or not np.isfinite(d.atr.iloc[i]):
        return None
    O, H, L, C = d.open.to_numpy(), d.high.to_numpy(), d.low.to_numpy(), d.close.to_numpy()
    entry = O[i + 1]
    risk = args.sl_atr * d.atr.iloc[i]
    stop, tp = entry - side * risk, entry + side * args.rr * risk
    cost = COST_PCT * entry / risk
    last = min(i + 1 + args.max_hold, n) - 1
    for j in range(i + 1, last + 1):
        hit_sl = L[j] <= stop if side == 1 else H[j] >= stop
        hit_tp = (H[j] >= tp if side == 1 else L[j] <= tp) and j > i + 1
        if hit_sl:
            return -1.0 - cost
        if hit_tp:
            return args.rr - cost
    if last == n - 1 and last < i + args.max_hold:
        return None          # ran out of data before the trade could finish
    return side * (C[last] - entry) / risk - cost


def summarize(df, label):
    def line(x, tag):
        if len(x) < 2:
            return f'  {tag:<22} n={len(x)}'
        def m(col):
            v = x[col].dropna()
            return f'{v.mean():+.3f} (t={v.mean() / (v.std(ddof=1) / np.sqrt(len(v))):+.1f})' if len(v) > 1 else 'n/a'
        acc = (np.sign(x.f_ret) == np.sign(x.a_ret)).mean()
        corr = x.f_ret.corr(x.a_ret)
        return (f'  {tag:<22} n={len(x):>5}  direction right {acc:6.1%}  corr {corr:+.3f}  '
                f'avgR Kronos {m("r_kronos")}  always-long {m("r_long")}  momentum {m("r_mom")}')
    print(label)
    print(line(df, 'all'))
    print(line(df[~df.clean], 'before clean-from'))
    print(line(df[df.clean], 'after clean-from (OOS)'))


def direction_test(d, pred, args):
    start = max(args.lookback, 15, args.horizon)
    lo = d.timestamps.searchsorted(pd.Timestamp(args.start)) if args.start else 0
    hi = d.timestamps.searchsorted(pd.Timestamp(args.end)) if args.end else len(d)
    idx = [i for i in range(max(start, lo), min(hi, len(d) - 1), args.every)]
    done = set()
    if os.path.exists(args.out):
        done = set(pd.read_csv(args.out, parse_dates=['decision_time']).decision_time)
    todo = [i for i in idx if d.timestamps.iloc[i] not in done]
    print(f'{len(idx)} decision points, {len(todo)} to forecast ({len(idx) - len(todo)} cached in {args.out})', flush=True)
    C = d.close.to_numpy()
    for b in range(0, len(todo), args.batch):
        chunk = todo[b:b + args.batch]
        rows = []
        for i, (f_ret, f_hi, f_lo) in zip(chunk, forecast(pred, d, chunk, args)):
            a_ret = C[i + args.horizon] / C[i] - 1 if i + args.horizon < len(d) else np.nan
            side = 1 if f_ret > 0 else -1
            mom = 1 if C[i] >= C[i - args.horizon] else -1
            rows.append(dict(decision_time=d.timestamps.iloc[i], close=C[i], f_ret=f_ret, f_high=f_hi, f_low=f_lo,
                             a_ret=a_ret, side=side, r_kronos=trade_r(d, i, side, args),
                             r_long=trade_r(d, i, 1, args), r_mom=trade_r(d, i, mom, args)))
        pd.DataFrame(rows).to_csv(args.out, mode='a', header=not os.path.exists(args.out), index=False)
        print(f'  {min(b + args.batch, len(todo))}/{len(todo)} forecasts', flush=True)
    res = pd.read_csv(args.out, parse_dates=['decision_time'])
    res = res[res.decision_time.isin(d.timestamps.iloc[idx])].dropna(subset=['a_ret'])
    res['clean'] = res.decision_time >= pd.Timestamp(args.clean_from)
    summarize(res, f'\nDirection test: Kronos-{args.model}, lookback {args.lookback}, horizon {args.horizon} bars, '
                   f'every {args.every} bars, {args.samples} samples, stop {args.sl_atr} ATR, {args.rr}R target')


def filter_test(d, pred, args):
    t = pd.read_csv(args.trades, parse_dates=['entry_time'])
    bar = d.timestamps.diff().median()
    closes = (d.timestamps + bar).to_numpy()
    t['i'] = np.searchsorted(closes, t.entry_time.to_numpy(), side='right') - 1   # last bar closed by entry
    t = t[t.i >= args.lookback].reset_index(drop=True)
    f = []
    for b in range(0, len(t), args.batch):
        f += [x[0] for x in forecast(pred, d, list(t.i.iloc[b:b + args.batch]), args)]
        print(f'  {min(b + args.batch, len(t))}/{len(t)} trades', flush=True)
    t['f_ret'] = f
    t['agree'] = np.sign(t.f_ret) == np.where(t.side == 'LONG', 1, -1)
    t['clean'] = t.entry_time >= pd.Timestamp(args.clean_from)
    t.to_csv(args.out, index=False)
    print(f'\nFilter test on {args.trades} (Kronos-{args.model}, horizon {args.horizon} bars)')
    for tag, x in (('all', t), ('before clean-from', t[~t.clean]), ('after clean-from (OOS)', t[t.clean])):
        k, s = x[x.agree], x[~x.agree]
        print(f'  {tag:<22} all trades n={len(x):>4} avgR {x.r.mean():+.3f} | Kronos agrees n={len(k):>4} '
              f'avgR {k.r.mean():+.3f} | disagrees n={len(s):>4} avgR {s.r.mean():+.3f}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--csv', required=True, help='Date;Open;High;Low;Close;Volume candles (any timeframe)')
    ap.add_argument('--out', required=True, help='output CSV (appended and resumed in the direction test)')
    ap.add_argument('--kronos-dir', default='Kronos', help='path to a clone of shiyu-coder/Kronos')
    ap.add_argument('--model', choices=list(MODELS), default='small')
    ap.add_argument('--lookback', type=int, default=400)
    ap.add_argument('--horizon', type=int, default=24)
    ap.add_argument('--every', type=int, default=24, help='bars between decision points')
    ap.add_argument('--samples', type=int, default=5, help='forecast paths averaged per decision')
    ap.add_argument('--temperature', type=float, default=1.0)
    ap.add_argument('--top-p', type=float, default=0.9)
    ap.add_argument('--batch', type=int, default=16)
    ap.add_argument('--sl-atr', type=float, default=1.0)
    ap.add_argument('--rr', type=float, default=2.0)
    ap.add_argument('--max-hold', type=int, default=48, help='bars before a trade is closed at market')
    ap.add_argument('--start'); ap.add_argument('--end')
    ap.add_argument('--clean-from', default='2025-08-01', help='first date after Kronos was published')
    ap.add_argument('--trades', help='filter test: trade list with entry_time, side, r columns')
    ap.add_argument('--device', default=None)
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--random-weights', action='store_true', help='tiny untrained model, to test the mechanics offline')
    args = ap.parse_args()
    if args.random_weights:
        args.model = 'random-weights stand-in'
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    d = load_csv(args.csv)
    pred = load_predictor(args)
    (filter_test if args.trades else direction_test)(d, pred, args)


if __name__ == '__main__':
    main()
