"""MSS + order-block backtest on XAU/USD (ICT / smart-money style), 1:2 risk-reward.

Candle files: Date;Open;High;Low;Close;Volume (MT4/MT5 export), all on the same clock.

Structure (on the structure timeframe):
  * Swing high at bar i: H[i] is the highest of bars i-k .. i+k. It is only KNOWN at the close of
    bar i+k, and only used from bar i+k+1 on (no lookahead).
  * A close above the latest swing high = bullish break; below the latest swing low = bearish break.
    A break against the current trend is a market structure shift (MSS); with the trend it is a
    break of structure (BOS, no trade). Each swing can be broken once.
  * Order block for a bullish MSS: the low of the leg = lowest bar between the broken swing high and
    the MSS candle; the OB is the last down-close candle at or before that low (in the leg), or the
    low candle itself if none. Zone = that candle's high..low. Mirror for bearish.
Trade:
  * MODE limit   - buy limit at the OB high (sell limit at the OB low for shorts) after the MSS candle
                   closes. Stop below min(OB low, leg low) by 0.1 ATR(14); target 2R.
  * MODE confirm - after price taps the OB on the entry timeframe, wait for a lower-timeframe MSS
                   (close above the latest entry-TF swing high formed after the setup started), enter
                   at the next entry-TF open; stop below the lowest low since the tap by 0.1 ATR; 2R.
  * MODE strict  - as confirm, but the 30m trigger must be a real 30m shift: the 30m trend (same
                   swing/break rules, k=2) must be against the trade just before the trigger candle.
  * A limit setup lives until it fills, the next MSS on the structure TF (either way), MAX_AGE
    structure bars, price reaching the 2R level before filling (move gone), or a candle opening
    through the stop (setup broken). While another trade is open no order is working: if the OB is
    tapped or the 2R level reached during that time, the setup is dropped.
Execution is simulated on 15m candles: fills and exits in time order. A limit fill on a candle that
opened past the limit fills at that open; a candle that opens past the stop or target exits at its
open. When one 15m candle touches both stop and target the stop counts first, and only the stop can
trigger inside the fill candle. R = (exit - fill) / planned risk. One position at a time.
Costs: --cost (default 0.01% of price) per trade, charged in R.

Usage: python smc_backtest.py --data-1h XAU_1h.csv --data-30m XAU_30m.csv --data-15m XAU_15m.csv
       [--k 2 3 5] [--configs ABCD] [--cost 0.0003] [--tp-first] [--out DIR]
"""
import argparse
import os
from dataclasses import dataclass

import numpy as np
import pandas as pd

FILES = {'1h': 'data/XAU_1h_data.csv', '30m': 'data/XAU_30m_data.csv', '15m': 'data/XAU_15m_data.csv'}
TF_MIN = {'1h': 60, '30m': 30, '15m': 15}
RR = 2.0
ATR_LEN = 14
SL_BUF_ATR = 0.10
MAX_AGE = 48
COST_PCT = 0.0001
TP_FIRST = False


@dataclass
class Bars:
    t: np.ndarray       # bar open time (datetime64[ns])
    o: np.ndarray
    h: np.ndarray
    l: np.ndarray
    c: np.ndarray
    atr: np.ndarray
    minutes: int

    @property
    def close_time(self):
        return self.t + np.timedelta64(self.minutes, 'm')


_cache = {}


def load(tf):
    if tf not in _cache:
        d = pd.read_csv(FILES[tf], sep=';')
        t = pd.to_datetime(d['Date'], format='%Y.%m.%d %H:%M').to_numpy()
        o, h, l, c = (d[k].to_numpy(float) for k in ('Open', 'High', 'Low', 'Close'))
        pc = np.r_[np.nan, c[:-1]]
        tr = np.nanmax(np.c_[h - l, np.abs(h - pc), np.abs(l - pc)], axis=1)
        atr = pd.Series(tr).rolling(ATR_LEN).mean().to_numpy()
        _cache[tf] = Bars(t, o, h, l, c, atr, TF_MIN[tf])
    return _cache[tf]


def structure_events(b, k):
    """MSS events: (side, mss_idx, broken_swing_idx). Pivots are used only once confirmed."""
    H, L, C = b.h, b.l, b.c
    n = len(C)
    state = 0
    sh = sl = None          # [price, idx, broken]
    events = []
    for j in range(n):
        if sh and not sh[2] and C[j] > sh[0]:
            sh[2] = True
            if state == -1:
                events.append((1, j, sh[1]))
            state = 1
        elif sl and not sl[2] and C[j] < sl[0]:
            sl[2] = True
            if state == 1:
                events.append((-1, j, sl[1]))
            state = -1
        i = j - k               # pivot at i is confirmed by the close of bar j = i + k
        if i >= k:
            if H[i] > H[i - k:i].max() and H[i] >= H[i + 1:j + 1].max():
                sh = [H[i], i, False]
            if L[i] < L[i - k:i].min() and L[i] <= L[i + 1:j + 1].min():
                sl = [L[i], i, False]
    return events


def order_block(b, side, j, swing_idx):
    O, H, L, C = b.o, b.h, b.l, b.c
    leg = np.arange(swing_idx + 1, j + 1)
    if side == 1:
        ext = leg[np.argmin(L[leg])]
        cand = [i for i in range(ext, swing_idx, -1) if C[i] < O[i]]
        ob = cand[0] if cand else ext
        entry = H[ob]
        stop = min(L[ob], L[ext]) - SL_BUF_ATR * b.atr[j]
        ok = stop < entry < C[j]
    else:
        ext = leg[np.argmax(H[leg])]
        cand = [i for i in range(ext, swing_idx, -1) if C[i] > O[i]]
        ob = cand[0] if cand else ext
        entry = L[ob]
        stop = max(H[ob], H[ext]) + SL_BUF_ATR * b.atr[j]
        ok = C[j] < entry < stop
    return (ob, entry, stop) if ok and np.isfinite(stop) else None


def setups(sb, k):
    ev = structure_events(sb, k)
    out = []
    for n_, (side, j, sw) in enumerate(ev):
        ob = order_block(sb, side, j, sw)
        if ob is None:
            continue
        start = sb.close_time[j]
        end_idx = min(j + MAX_AGE, len(sb.t) - 1)
        if n_ + 1 < len(ev):
            end_idx = min(end_idx, ev[n_ + 1][1])
        end = sb.close_time[end_idx]
        out.append(dict(side=side, mss_idx=j, mss_time=sb.t[j], ob_idx=ob[0], ob_time=sb.t[ob[0]], entry=ob[1],
                        stop=ob[2], start=start, end=end))
    return out


def manage(x, side, i, stop, tp):
    """Walk 15m bars from i (the fill bar) to the exit. Returns (exit_idx, result, exit_price) or None.
    A later bar that opens beyond the stop or target exits at its open (gaps); inside the fill bar only
    the stop can trigger; when one bar touches both levels the stop counts first (unless TP_FIRST)."""
    O, H, L = x.o, x.h, x.l
    for j in range(i, len(H)):
        if j > i:
            if (O[j] <= stop) if side == 1 else (O[j] >= stop):
                return j, 'SL', O[j]
            if (O[j] >= tp) if side == 1 else (O[j] <= tp):
                return j, 'TP', O[j]
        hit_sl = L[j] <= stop if side == 1 else H[j] >= stop
        hit_tp = (H[j] >= tp if side == 1 else L[j] <= tp) and j > i
        if hit_sl and hit_tp:
            return (j, 'TP', tp) if TP_FIRST else (j, 'SL', stop)
        if hit_sl:
            return j, 'SL', stop
        if hit_tp:
            return j, 'TP', tp
    return None


def run_limit(sb, x, k):
    trades, busy = [], np.datetime64('1900-01-01')
    for s in setups(sb, k):
        side, entry, stop = s['side'], s['entry'], s['stop']
        risk = side * (entry - stop)
        tp = entry + side * RR * risk
        i = np.searchsorted(x.t, s['start'])
        last = np.searchsorted(x.t, s['end'])
        fill = None
        for j in range(i, min(last, len(x.t))):
            touched = x.l[j] <= entry if side == 1 else x.h[j] >= entry
            reached_tp = x.h[j] >= tp if side == 1 else x.l[j] <= tp
            if x.t[j] < busy:                           # in another trade: no order working
                if touched or reached_tp:
                    break                               # OB tapped (mitigated) or move gone meanwhile
                continue
            if (x.o[j] <= stop) if side == 1 else (x.o[j] >= stop):
                break                                   # opened through the stop: setup broken
            if touched:
                fill = j
                break
            if reached_tp:
                break                                   # target reached without a retrace: skip
        if fill is None:
            continue
        fill_px = min(x.o[fill], entry) if side == 1 else max(x.o[fill], entry)   # gap opens fill at the open
        res = manage(x, side, fill, stop, tp)
        if res is None:
            continue
        trades.append(record(s, x, side, fill, res, fill_px, stop, tp, risk, 'limit'))
        busy = x.t[res[0]] + np.timedelta64(x.minutes, 'm')
    return trades


def ltf_swings(e, k):
    """Index of the most recent confirmed swing high/low usable at each entry-TF bar (or -1)."""
    n = len(e.h)
    sh_at, sl_at = np.full(n, -1), np.full(n, -1)
    cur_h = cur_l = -1
    for j in range(n):
        sh_at[j], sl_at[j] = cur_h, cur_l      # known before bar j
        i = j - k
        if i >= k:
            if e.h[i] > e.h[i - k:i].max() and e.h[i] >= e.h[i + 1:j + 1].max():
                cur_h = i
            if e.l[i] < e.l[i - k:i].min() and e.l[i] <= e.l[i + 1:j + 1].min():
                cur_l = i
    return sh_at, sl_at


def ltf_state(e, k):
    """30m trend state known before each bar: +1 after a close above the latest swing high, -1 after a
    close below the latest swing low (same rules as structure_events)."""
    H, L, C = e.h, e.l, e.c
    n = len(C)
    st = np.zeros(n, dtype=int)
    state, sh, sl = 0, None, None
    for j in range(n):
        st[j] = state
        if sh and not sh[2] and C[j] > sh[0]:
            sh[2] = True; state = 1
        elif sl and not sl[2] and C[j] < sl[0]:
            sl[2] = True; state = -1
        i = j - k
        if i >= k:
            if H[i] > H[i - k:i].max() and H[i] >= H[i + 1:j + 1].max():
                sh = [H[i], i, False]
            if L[i] < L[i - k:i].min() and L[i] <= L[i + 1:j + 1].min():
                sl = [L[i], i, False]
    return st


def run_confirm(sb, e, x, k, k_ltf=2, strict=False):
    sh_at, sl_at = ltf_swings(e, k_ltf)
    state = ltf_state(e, k_ltf) if strict else None
    trades, busy = [], np.datetime64('1900-01-01')
    for s in setups(sb, k):
        side, zone, inval = s['side'], s['entry'], s['stop']
        i0 = np.searchsorted(e.t, max(s['start'], busy))
        last = min(np.searchsorted(e.t, s['end']), len(e.t) - 1)
        tapped, ext, sig = False, None, None
        for j in range(i0, last):
            if not tapped:
                if (e.l[j] <= zone) if side == 1 else (e.h[j] >= zone):
                    tapped, ext = True, (e.l[j] if side == 1 else e.h[j])
                else:
                    continue
            else:
                ext = min(ext, e.l[j]) if side == 1 else max(ext, e.h[j])
            if (ext <= inval) if side == 1 else (ext >= inval):
                break                                   # traded through the OB's protective level
            sw = sh_at[j] if side == 1 else sl_at[j]
            if sw >= i0 and ((e.c[j] > e.h[sw]) if side == 1 else (e.c[j] < e.l[sw])):
                if strict and state[j] != -side:
                    continue                            # a with-trend 30m break (BOS), not a shift
                sig = j
                break
        if sig is None or sig + 1 >= len(e.t):
            continue
        fill = np.searchsorted(x.t, e.t[sig + 1])
        if fill >= len(x.t):
            continue
        entry = x.o[fill]
        stop = ext - side * SL_BUF_ATR * e.atr[sig]
        risk = side * (entry - stop)
        if not np.isfinite(risk) or risk <= 0:
            continue
        tp = entry + side * RR * risk
        res = manage(x, side, fill, stop, tp)
        if res is None:
            continue
        trades.append(record(s, x, side, fill, res, entry, stop, tp, risk, 'confirm-strict' if strict else 'confirm'))
        busy = x.t[res[0]] + np.timedelta64(x.minutes, 'm')
    return trades


def record(s, x, side, fill, res, entry, stop, tp, risk, mode):
    exit_idx, result, exit_px = res
    r = side * (exit_px - entry) / risk
    return dict(mode=mode, side='LONG' if side == 1 else 'SHORT', mss_time=s['mss_time'], ob_time=s['ob_time'],
                entry_time=x.t[fill], exit_time=x.t[exit_idx], entry=round(entry, 3), stop=round(stop, 3),
                target=round(tp, 3), risk=round(risk, 3), result=result, r_gross=r, r=r - COST_PCT * entry / risk)


def stats(df):
    if df.empty:
        return dict(trades=0)
    eq = df.r.cumsum()
    losses = (df.result == 'SL').astype(int)
    streak = losses.groupby((losses == 0).cumsum()).sum().max()
    gp, gl = df.r[df.r > 0].sum(), -df.r[df.r < 0].sum()
    yrs = max((df.entry_time.max() - df.entry_time.min()).days / 365.25, 1e-9)
    return dict(trades=len(df), per_yr=len(df) / yrs, win=(df.result == 'TP').mean(), avgR=df.r.mean(),
                avgR_gross=df.r_gross.mean(), totalR=df.r.sum(), PF=gp / gl if gl else np.inf,
                maxDD=(eq.cummax() - eq).max(), max_loss_streak=int(streak))


def fmt(st):
    if not st.get('trades'):
        return 'no trades'
    return (f"trades {st['trades']:>5} ({st['per_yr']:5.1f}/yr)  win {st['win']:6.1%}  avgR {st['avgR']:+.3f} "
            f"(gross {st['avgR_gross']:+.3f})  totalR {st['totalR']:+7.1f}  PF {st['PF']:4.2f}  "
            f"maxDD {st['maxDD']:5.1f}R  worst streak {st['max_loss_streak']}")


CONFIGS = {
    'A 1h only (MSS+OB on 1h, limit at OB)': ('1h', None, 'limit'),
    'B 30m only (MSS+OB on 30m, limit at OB)': ('30m', None, 'limit'),
    'C 1h MSS+OB, 30m tap + 30m break entry': ('1h', '30m', 'confirm'),
    'D 1h MSS+OB, 30m tap + strict 30m MSS entry': ('1h', '30m', 'strict'),
}


def run(name, k):
    stf, etf, mode = CONFIGS[name]
    sb, x = load(stf), load('15m')
    if mode == 'limit':
        t = run_limit(sb, x, k)
    else:
        t = run_confirm(sb, load(etf), x, k, strict=(mode == 'strict'))
    return pd.DataFrame(t)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--k', type=int, nargs='+', default=[3])
    ap.add_argument('--out', default=None)
    ap.add_argument('--tp-first', action='store_true')
    ap.add_argument('--cost', type=float, default=COST_PCT, help='cost per trade as a fraction of price')
    ap.add_argument('--data-1h', default=FILES['1h']); ap.add_argument('--data-30m', default=FILES['30m'])
    ap.add_argument('--data-15m', default=FILES['15m'])
    ap.add_argument('--configs', default='ABCD', help='which configurations to run, e.g. AD')
    a = ap.parse_args()
    TP_FIRST, COST_PCT = a.tp_first, a.cost
    FILES.update({'1h': a.data_1h, '30m': a.data_30m, '15m': a.data_15m})
    for k in a.k:
        print(f'\n######## swing length k={k}  ({"TP" if TP_FIRST else "SL"}-first on ambiguous 15m candles, cost {COST_PCT:.2%} of price)')
        for name in [c for c in CONFIGS if c[0] in a.configs]:
            df = run(name, k)
            print(f'\n{name}')
            if df.empty:
                print('   no trades'); continue
            print(f'   all      {fmt(stats(df))}')
            print(f'   2004-19  {fmt(stats(df[df.entry_time < "2020-01-01"]))}')
            print(f'   2020-25  {fmt(stats(df[df.entry_time >= "2020-01-01"]))}')
            for sd in ('LONG', 'SHORT'):
                print(f'   {sd:<8} {fmt(stats(df[df.side == sd]))}')
            if a.out:
                os.makedirs(a.out, exist_ok=True)
                df.to_csv(f"{a.out}/smc_k{k}_{name[0]}.csv", index=False)
