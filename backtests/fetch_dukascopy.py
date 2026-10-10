"""Bulk-download XAU/USD 1-minute candles from Dukascopy's free data API into a CSV.

Usage: python fetch_dukascopy.py 2015-01-01 2025-10-01 XAU_1m.csv [--base URL]
Output matches the uploaded files: Date;Open;High;Low;Close;Volume (UTC, mid = (bid+ask)/2).
Each day is cached as JSON next to the output, so an interrupted run resumes where it stopped.
"""
import argparse, csv, datetime as dt, json, os, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = 'https://jetta.dukascopy.com/v1'


def get(url, tries=5):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'backtrack'}), timeout=30) as r:
                body = r.read()
                return json.loads(body) if body.strip() else None
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if k == tries - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if k == tries - 1:
                raise
        time.sleep(2 ** k)


def decode(b):
    if not b or not b.get('times'):
        return {}
    m = b['multiplier']
    t = b['timestamp']
    o, h, l, c = (round(b[k] / m) for k in ('open', 'high', 'low', 'close'))
    out = {}
    for i, dtm in enumerate(b['times']):
        t += dtm * b['shift']
        o += b['opens'][i]; h += b['highs'][i]; l += b['lows'][i]; c += b['closes'][i]
        out[t] = (o * m, h * m, l * m, c * m, b['volumes'][i] if i < len(b['volumes']) else 0)
    return out


def fetch_day(base, day, cache):
    path = os.path.join(cache, f'{day}.json')
    if os.path.exists(path):
        with open(path) as f:
            return [tuple(r) for r in json.load(f)]
    p = f'{base}/candles/minute/XAU-USD/{{}}/{day.year}/{day.month}/{day.day}'
    bid, ask = decode(get(p.format('BID'))), decode(get(p.format('ASK')))
    rows = []
    for t, (o, h, l, c, v) in sorted(bid.items()):
        if v == 0:
            continue
        a = ask.get(t)
        mid = (lambda x, y: round((x + y) / 2, 3)) if a else (lambda x, _: round(x, 3))
        a = a or (o, h, l, c, v)
        rows.append((t, mid(o, a[0]), mid(h, a[1]), mid(l, a[2]), mid(c, a[3]), round(v, 2)))
    if day < dt.date.today():
        with open(path, 'w') as f:
            json.dump(rows, f)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('start'); ap.add_argument('end'); ap.add_argument('out')
    ap.add_argument('--base', default=BASE); ap.add_argument('--workers', type=int, default=4)
    a = ap.parse_args()
    start, end = dt.date.fromisoformat(a.start), dt.date.fromisoformat(a.end)
    days = [start + dt.timedelta(n) for n in range((end - start).days) if (start + dt.timedelta(n)).weekday() != 5]
    cache = a.out + '.cache'; os.makedirs(cache, exist_ok=True)
    total, done = 0, 0
    with open(a.out, 'w', newline='') as f, ThreadPoolExecutor(a.workers) as pool:
        w = csv.writer(f, delimiter=';'); w.writerow(['Date', 'Open', 'High', 'Low', 'Close', 'Volume'])
        for rows in pool.map(lambda d: fetch_day(a.base, d, cache), days):
            for t, *vals in rows:
                w.writerow([dt.datetime.fromtimestamp(t / 1000, dt.timezone.utc).strftime('%Y.%m.%d %H:%M'), *vals])
            total += len(rows); done += 1
            if done % 100 == 0:
                print(f'{done}/{len(days)} days, {total:,} candles', flush=True)
    print(f'done: {total:,} candles → {a.out}')


if __name__ == '__main__':
    main()
