"""Volume Profile Trading Blueprint backtest (POC bounce, VA reversal, breakout) on XAU/USD candles.

Usage: python vp_backtest.py CANDLES.csv OUT_DIR [--sessions calendar|nyclose] [--rr 2]
Input: Date;Open;High;Low;Close;Volume with dates like 2025.10.01 05:15 (MT4/MT5 export or
fetch_dukascopy.py). Sessions: `calendar` = one session per calendar day of the file's own clock
(right for broker-time exports, whose day already ends at the New York close); `nyclose` = trading
day ending 17:00 New York (use for UTC data such as fetch_dukascopy.py output).

Profile: previous session's 15m bars, 60 rows between session low/high, each bar's volume spread
across the rows its range overlaps. POC = heaviest row; value area grown from the POC (TradingView
style, two rows at a time) until it holds 70% of the volume.

No lookahead: a session's levels come only from the previous session; signals use closed bars and
fill at the NEXT bar's open; SL/TP are checked from the fill bar onwards; if one bar touches both,
the stop counts first (conservative).
"""
import argparse
from dataclasses import dataclass

import numpy as np
import pandas as pd

ROWS = 60
VA_PCT = 0.70
RR = 2.0
ATR_LEN = 14
SL_BUF_ATR = 0.10           # "slightly below the POC" / "near the recent swing"
PULLBACK_MIN = 0.5          # breakout: pullback must retrace >= 50% of the breakout leg
PULLBACK_MAX_INSIDE = 0.25  # ...and may not go deeper than 25% of the VA height back inside
COST_PCT = 0.0001           # round-trip spread+commission as a fraction of price (~$0.38 at $3,800)
MIN_SESSION_BARS = 40
TP_FIRST = False            # optimistic variant for the sensitivity check


def load(path, sessions='calendar'):
    d = pd.read_csv(path, sep=';')
    d['t'] = pd.to_datetime(d['Date'], format='%Y.%m.%d %H:%M')
    if sessions == 'nyclose':
        # UTC → New York, +7h so 17:00 NY becomes midnight: the date is then the trading day.
        ny = d.t.dt.tz_localize('UTC').dt.tz_convert('America/New_York') + pd.Timedelta(hours=7)
        d['session'] = ny.dt.tz_localize(None).dt.normalize()
    else:
        d['session'] = d.t.dt.normalize()
    return d


def profile(h, l, v):
    lo, hi = l.min(), h.max()
    if hi <= lo:
        return None
    edges = np.linspace(lo, hi, ROWS + 1)
    rng = h - l
    flat = rng == 0
    # Bars with a range: volume split by how much of the bar overlaps each row (bars x rows matrix).
    ov = np.clip(np.minimum(edges[1:], h[~flat, None]) - np.maximum(edges[:-1], l[~flat, None]), 0, None)
    vol = (v[~flat, None] * ov / rng[~flat, None]).sum(axis=0)
    # Zero-range bars: all volume in the row containing the price.
    rows = np.minimum(((h[flat] - lo) / (hi - lo) * ROWS).astype(int), ROWS - 1)
    np.add.at(vol, rows, v[flat])
    poc = int(np.argmax(vol))
    a = b = poc
    total, acc = vol.sum(), vol[poc]
    while acc < VA_PCT * total and (a > 0 or b < ROWS - 1):
        up = vol[b + 1:b + 3].sum() if b < ROWS - 1 else -1
        dn = vol[max(a - 2, 0):a].sum() if a > 0 else -1
        if up >= dn:
            nb = min(b + 2, ROWS - 1); acc += vol[b + 1:nb + 1].sum(); b = nb
        else:
            na = max(a - 2, 0); acc += vol[na:a].sum(); a = na
    return dict(poc=(edges[poc] + edges[poc + 1]) / 2, vah=edges[b + 1], val=edges[a])


@dataclass
class Signal:
    strategy: str
    i: int          # index of the signal bar (closed); fill at i+1 open
    side: int       # +1 long, -1 short
    sl: float


def atr(d):
    pc = d.Close.shift()
    tr = np.maximum(d.High - d.Low, np.maximum((d.High - pc).abs(), (d.Low - pc).abs()))
    return tr.rolling(ATR_LEN).mean().to_numpy()


def bullish_engulf(o, c, i):
    return c[i - 1] < o[i - 1] and c[i] > o[i] and c[i] >= o[i - 1] and o[i] <= c[i - 1]


def bearish_engulf(o, c, i):
    return c[i - 1] > o[i - 1] and c[i] < o[i] and c[i] <= o[i - 1] and o[i] >= c[i - 1]


def session_signals(idx, lv, prev_close, O, H, L, C, A):
    poc, vah, val = lv['poc'], lv['vah'], lv['val']
    va_h = vah - val
    out = []

    # --- 1. POC bounce: previous session closed outside the VA; first engulfing rejection at the POC.
    if prev_close > vah or prev_close < val:
        side = 1 if prev_close > vah else -1
        for k in range(1, len(idx)):
            i = idx[k]
            touched = min(L[i], L[i - 1]) <= poc if side == 1 else max(H[i], H[i - 1]) >= poc
            if not touched:
                continue
            if side == 1 and bullish_engulf(O, C, i) and C[i] > poc:
                out.append(Signal('POC bounce', i, 1, min(poc, L[i - 1], L[i]) - SL_BUF_ATR * A[i]))
                break
            if side == -1 and bearish_engulf(O, C, i) and C[i] < poc:
                out.append(Signal('POC bounce', i, -1, max(poc, H[i - 1], H[i]) + SL_BUF_ATR * A[i]))
                break

    # --- 2. Value-area reversal: previous session closed inside; a close outside, then a close back inside.
    if val <= prev_close <= vah:
        state, ext = 0, 0.0
        for i in idx:
            if state == 0:
                if C[i] > vah: state, ext = 1, H[i]
                elif C[i] < val: state, ext = -1, L[i]
            elif state == 1:
                ext = max(ext, H[i])
                if C[i] < val: state, ext = -1, L[i]
                elif C[i] <= vah:
                    out.append(Signal('VA reversal', i, -1, ext + SL_BUF_ATR * A[i])); state = 0
            else:
                ext = min(ext, L[i])
                if C[i] > vah: state, ext = 1, H[i]
                elif C[i] >= val:
                    out.append(Signal('VA reversal', i, 1, ext - SL_BUF_ATR * A[i])); state = 0

    # --- 3. Breakout: close outside, pullback that holds, then a close beyond the breakout high/low (BOS).
    for side in (1, -1):
        edge = vah if side == 1 else val
        floor = edge - side * PULLBACK_MAX_INSIDE * va_h
        phase, swing, pb = 0, 0.0, 0.0
        for i in idx:
            if phase == 0:
                if side * (C[i] - edge) > 0:
                    phase, swing = 1, (H[i] if side == 1 else L[i])
                continue
            if side * ((L[i] if side == 1 else H[i]) - floor) < 0:   # pulled back too deep: reset
                phase = 0
                continue
            if phase == 1:
                swing = max(swing, H[i]) if side == 1 else min(swing, L[i])
                extreme = L[i] if side == 1 else H[i]
                leg = abs(swing - edge)
                if leg > 0 and abs(swing - extreme) >= PULLBACK_MIN * leg:
                    phase, pb = 2, extreme
            elif phase == 2:
                pb = min(pb, L[i]) if side == 1 else max(pb, H[i])
                if side * (C[i] - swing) > 0:
                    out.append(Signal('Breakout', i, side, pb - side * SL_BUF_ATR * A[i]))
                    break
    return out


def simulate(sig, O, H, L, T, n):
    f = sig.i + 1
    if f >= n:
        return None
    entry = O[f]
    risk = sig.side * (entry - sig.sl)
    if risk <= 0:      # gapped through the stop before the fill
        return None
    tp = entry + sig.side * RR * risk
    for j in range(f, n):
        hit_sl = L[j] <= sig.sl if sig.side == 1 else H[j] >= sig.sl
        hit_tp = H[j] >= tp if sig.side == 1 else L[j] <= tp
        if hit_sl or hit_tp:
            r = RR if hit_tp and (not hit_sl or TP_FIRST) else -1.0
            hit_sl = r < 0
            cost_r = COST_PCT * entry / risk
            return dict(strategy=sig.strategy, side='LONG' if sig.side == 1 else 'SHORT',
                        signal_time=T[sig.i], entry_time=T[f], exit_time=T[j], entry=entry, sl=sig.sl, tp=tp,
                        risk=risk, result='SL' if hit_sl else 'TP', r_gross=r, r=r - cost_r, entry_idx=f, exit_idx=j)
    return None


def stats(df, label):
    if df.empty:
        return f'{label:<14} no trades'
    wins = (df.result == 'TP').sum()
    eq = df.r.cumsum()
    dd = (eq.cummax() - eq).max()
    gp, gl = df.r[df.r > 0].sum(), -df.r[df.r < 0].sum()
    years = (df.entry_time.max() - df.entry_time.min()).days / 365.25 or 1
    return (f'{label:<14} trades {len(df):>5}  ({len(df)/years:5.1f}/yr)  win {wins/len(df):6.1%}  '
            f'avgR {df.r.mean():+.3f}  totalR {df.r.sum():+8.1f}  PF {gp/gl if gl else float("inf"):4.2f}  '
            f'maxDD {dd:5.1f}R  gross avgR {df.r_gross.mean():+.3f}')


def main(path, out_dir, sessions):
    d = load(path, sessions)
    O, H, L, C, V = (d[c].to_numpy(float) for c in ('Open', 'High', 'Low', 'Close', 'Volume'))
    T = d.t.to_numpy()
    A = atr(d)
    n = len(d)
    groups = list(d.groupby('session').indices.values())
    signals = []
    for prev, cur in zip(groups, groups[1:]):
        if len(prev) < MIN_SESSION_BARS or len(cur) < 2:
            continue
        lv = profile(H[prev], L[prev], V[prev])
        if lv is None:
            continue
        cur = cur[np.isfinite(A[cur])]
        signals += session_signals(cur, lv, C[prev[-1]], O, H, L, C, A)

    trades = [t for s in signals if (t := simulate(s, O, H, L, T, n))]
    df = pd.DataFrame(trades)
    # One position at a time per strategy; and a combined "one system" book (one position at all).
    def one_at_a_time(x):
        keep, free = [], -1
        for _, r in x.sort_values('entry_time').iterrows():
            if r.entry_idx > free:
                keep.append(r); free = r.exit_idx
        return pd.DataFrame(keep)
    per = {k: one_at_a_time(g) for k, g in df.groupby('strategy')}
    system = one_at_a_time(df)

    first, last = d.t.iloc[0], d.t.iloc[-1]
    recent = last - pd.DateOffset(years=5)
    for period, start in ((f'FULL {first:%Y-%m} → {last:%Y-%m}', None), (f'LAST 5 YEARS {recent:%Y-%m} → {last:%Y-%m}', recent)):
        print(f'\n=== {period} (R after costs; {RR:g}R target; SL-first on ambiguous bars) ===')
        for k in ('POC bounce', 'VA reversal', 'Breakout'):
            x = per[k] if start is None else per[k][per[k].entry_time >= start]
            print(stats(x, k))
        x = system if start is None else system[system.entry_time >= start]
        print(stats(x, 'Combined'))

    print('\n=== Combined system by year (R) ===')
    by = system.groupby(system.entry_time.dt.year).agg(trades=('r', 'size'), win=('result', lambda s: (s == 'TP').mean()), R=('r', 'sum'))
    print(by.to_string(formatters={'win': '{:.0%}'.format, 'R': '{:+.1f}'.format}))

    # Compounded equity at 1% risk per trade on the combined book.
    bal = 10_000.0
    for r in system.r:
        bal *= 1 + 0.01 * r
    print(f'\nCombined, $10,000 at 1% risk compounding → ${bal:,.0f}')
    for k, x in per.items():
        x.drop(columns=['entry_idx', 'exit_idx']).to_csv(f'{out_dir}/trades_{k.replace(" ", "_").lower()}.csv', index=False)
    system.drop(columns=['entry_idx', 'exit_idx']).to_csv(f'{out_dir}/trades_combined.csv', index=False)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('candles'); ap.add_argument('out_dir')
    ap.add_argument('--sessions', choices=('calendar', 'nyclose'), default='calendar')
    ap.add_argument('--rr', type=float, default=RR)
    ap.add_argument('--min-session-bars', type=int, default=None,
                    help='skip sessions shorter than this (default: 40 bars of 15m, scaled by timeframe)')
    a = ap.parse_args()
    RR = a.rr
    import os; os.makedirs(a.out_dir, exist_ok=True)
    if a.min_session_bars is not None:
        MIN_SESSION_BARS = a.min_session_bars
    else:
        head = pd.read_csv(a.candles, sep=';', nrows=500)
        step = pd.to_datetime(head['Date'], format='%Y.%m.%d %H:%M').diff().median()
        MIN_SESSION_BARS = max(4, int(40 * pd.Timedelta(minutes=15) / step))
    main(a.candles, a.out_dir, a.sessions)
