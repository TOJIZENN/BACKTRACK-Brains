import { useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Field, inputClass } from '../components/ui/Field';
import { Spinner } from '../components/ui/Spinner';
import { SAME_CANDLE_RULE_LABELS, type SameCandleRule } from '../trading/types';
import { GRANULARITIES, INSTRUMENTS } from '../types/market';
import type { SessionSetup } from '../types/session';
import {
  defaultSetupValues,
  loadSavedSetup,
  randomStart,
  saveSetup,
  validateSetup,
  type SetupFormErrors,
  type SetupFormValues,
} from '../utils/setupForm';

interface Props {
  onStart: (setup: SessionSetup) => void;
  loading: boolean;
  error: string | null;
  onDismissError: () => void;
}

export function SetupPage({ onStart, loading, error, onDismissError }: Props) {
  const [values, setValues] = useState<SetupFormValues>(() => loadSavedSetup() ?? defaultSetupValues());
  const [errors, setErrors] = useState<SetupFormErrors>({});

  const update = <K extends keyof SetupFormValues>(key: K, value: SetupFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateSetup(values);
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    saveSetup(values);
    onStart(result.setup);
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-lg rounded-xl border border-terminal-border bg-terminal-panel p-8 shadow-2xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">
            <span className="text-gold">BACKTRACK</span> · Replay setup
          </h1>
          <p className="mt-1 text-sm text-terminal-muted">
            Manual historical replay. Simulation only — no live orders are ever placed.
          </p>
        </div>

        <fieldset disabled={loading} className="grid grid-cols-2 gap-4">
          <Field label="Instrument" htmlFor="instrument">
            <select id="instrument" className={inputClass} value={values.instrument} onChange={(e) => update('instrument', e.target.value)}>
              {Object.values(INSTRUMENTS).map((i) => (
                <option key={i.symbol} value={i.symbol}>
                  {i.displayName}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Timeframe">
            <div className="grid grid-cols-4 gap-1 rounded-md border border-terminal-border bg-terminal-bg p-1" role="radiogroup">
              {GRANULARITIES.map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={values.granularity === g}
                  onClick={() => update('granularity', g)}
                  className={`rounded py-1 font-mono text-sm ${values.granularity === g ? 'bg-gold text-terminal-bg font-semibold' : 'text-terminal-muted hover:text-terminal-text'}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Date (UTC)" htmlFor="date" error={errors.date}>
            <input id="date" type="date" className={inputClass} value={values.date} onChange={(e) => update('date', e.target.value)} />
          </Field>

          <Field label="Start time (UTC)" htmlFor="time" error={errors.time}>
            <input id="time" type="time" className={inputClass} value={values.time} onChange={(e) => update('time', e.target.value)} />
          </Field>

          <div className="col-span-2 -mt-2">
            <button
              type="button"
              className="text-xs text-terminal-muted underline-offset-2 hover:text-gold hover:underline"
              onClick={() => setValues((prev) => ({ ...prev, ...randomStart() }))}
            >
              🎲 Pick a random date &amp; time
            </button>
          </div>

          <Field label="Starting balance ($)" htmlFor="balance" error={errors.startingBalance}>
            <input
              id="balance"
              type="number"
              min="1"
              step="any"
              className={inputClass}
              value={values.startingBalance}
              onChange={(e) => update('startingBalance', e.target.value)}
            />
          </Field>

          <Field label="Risk per trade (%)" htmlFor="risk" error={errors.riskPercent}>
            <input
              id="risk"
              type="number"
              min="0.01"
              step="any"
              className={inputClass}
              value={values.riskPercent}
              onChange={(e) => update('riskPercent', e.target.value)}
            />
          </Field>

          <div className="col-span-2">
            <Field
              label="Same-candle rule"
              htmlFor="rule"
              hint="When one candle touches both SL and TP, OHLC data cannot tell which came first."
            >
              <select
                id="rule"
                className={inputClass}
                value={values.sameCandleRule}
                onChange={(e) => update('sameCandleRule', e.target.value as SameCandleRule)}
              >
                {Object.entries(SAME_CANDLE_RULE_LABELS).map(([rule, label]) => (
                  <option key={rule} value={rule}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </fieldset>

        {error && (
          <div className="mt-5">
            <ErrorBanner title="Could not start replay" message={error} onDismiss={onDismissError} />
          </div>
        )}

        <Button type="submit" variant="primary" className="mt-6 w-full py-2.5 tracking-wide" disabled={loading}>
          {loading ? <Spinner label="Loading historical candles..." /> : 'START REPLAY'}
        </Button>
      </form>
    </div>
  );
}
