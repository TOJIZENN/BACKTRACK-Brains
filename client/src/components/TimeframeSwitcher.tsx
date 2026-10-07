import { GRANULARITIES, type Granularity } from '../types/market';

const LABELS: Record<Granularity, string> = { M1: '1m', M5: '5m', M15: '15m', H1: '1h' };

interface Props {
  value: Granularity;
  onChange: (granularity: Granularity) => void;
  disabled?: boolean;
}

/** TradingView-style interval buttons in the top toolbar; switches timeframe mid-replay. */
export function TimeframeSwitcher({ value, onChange, disabled }: Props) {
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Chart timeframe">
      {GRANULARITIES.map((g) => (
        <button
          key={g}
          type="button"
          role="radio"
          aria-checked={value === g}
          disabled={disabled}
          onClick={() => onChange(g)}
          title={`Switch to ${LABELS[g]} — the replay continues from the same moment`}
          className={`rounded px-2 py-1 text-sm transition disabled:cursor-wait disabled:opacity-50 ${
            value === g ? 'bg-terminal-raised font-semibold text-accent' : 'text-terminal-text/80 hover:bg-terminal-raised hover:text-terminal-text'
          }`}
        >
          {LABELS[g]}
        </button>
      ))}
    </div>
  );
}
