import { useEffect, useState, type FormEvent } from 'react';
import { fetchHealth, type ProviderStatus } from '../services/health';
import { PROVIDER_IDS, PROVIDER_INFO, type ProviderId } from '../types/providers';
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
import { TIME_ZONES, timeZoneShort } from '../utils/timezone';

interface Props {
  onStart: (setup: SessionSetup) => void;
  loading: boolean;
  error: string | null;
  onDismissError: () => void;
}

export function SetupPage({ onStart, loading, error, onDismissError }: Props) {
  const [saved] = useState(loadSavedSetup);
  const [values, setValues] = useState<SetupFormValues>(() => saved ?? defaultSetupValues());
  const [errors, setErrors] = useState<SetupFormErrors>({});
  const [serverWarning, setServerWarning] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((health) => {
        setProviders(health.providers);
        // First visit: start from the server's default source (DATA_PROVIDER in .env).
        if (!saved) setValues((prev) => ({ ...prev, provider: health.dataProvider }));
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setServerWarning(err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const zone = timeZoneShort(values.timeZone);
  const providerStatus = (id: ProviderId) => providers?.find((p) => p.id === id);
  const selectedProvider = providerStatus(values.provider);
  const providerError =
    selectedProvider && !selectedProvider.configured
      ? `${PROVIDER_INFO[values.provider].name} needs an API key: add ${selectedProvider.keyVariable} to .env (the server restarts automatically), or pick Dukascopy.`
      : null;

  const update = <K extends keyof SetupFormValues>(key: K, value: SetupFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateSetup(values);
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    if (providerError) return;
    setErrors({});
    saveSetup(values);
    onStart(result.setup);
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={submit} noValidate className="w-full max-w-lg rounded-xl border border-terminal-border bg-terminal-panel p-5 shadow-2xl sm:p-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">
            <span className="font-bold tracking-wide">BACK<span className="text-accent">TRACK</span></span> · Replay setup
          </h1>
          <p className="mt-1 text-sm text-terminal-muted">
            Manual historical replay. Simulation only — no live orders are ever placed.
          </p>
        </div>

        {serverWarning && (
          <div className="mb-5">
            <ErrorBanner title="Server" message={serverWarning} />
          </div>
        )}

        <fieldset disabled={loading} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              label="Data source"
              htmlFor="provider"
              error={providerError}
              hint={`${PROVIDER_INFO[values.provider].note}. API keys stay on the server.`}
            >
              <select
                id="provider"
                className={inputClass}
                value={values.provider}
                onChange={(e) => update('provider', e.target.value as ProviderId)}
              >
                {PROVIDER_IDS.map((id) => {
                  const status = providerStatus(id);
                  const missingKey = status && !status.configured;
                  return (
                    <option key={id} value={id} disabled={missingKey}>
                      {PROVIDER_INFO[id].name}
                      {missingKey ? ` — needs ${status.keyVariable} in .env` : ''}
                    </option>
                  );
                })}
              </select>
            </Field>
          </div>

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
            <div className="grid grid-cols-4 gap-1 rounded-md border border-terminal-border bg-terminal-bg p-1" role="radiogroup" aria-label="Timeframe">
              {GRANULARITIES.map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={values.granularity === g}
                  onClick={() => update('granularity', g)}
                  className={`rounded py-1 font-mono text-sm ${values.granularity === g ? 'bg-accent text-white font-semibold' : 'text-terminal-muted hover:text-terminal-text'}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </Field>

          <Field label={`Date (${zone})`} htmlFor="date" error={errors.date}>
            <input id="date" type="date" className={inputClass} value={values.date} onChange={(e) => update('date', e.target.value)} />
          </Field>

          <Field label={`Start time (${zone})`} htmlFor="time" error={errors.time}>
            <input id="time" type="time" className={inputClass} value={values.time} onChange={(e) => update('time', e.target.value)} />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Time zone" htmlFor="timezone" hint="Times on the chart, in the journal and in this form use this zone.">
              <select id="timezone" className={inputClass} value={values.timeZone} onChange={(e) => update('timeZone', e.target.value)}>
                {TIME_ZONES.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="-mt-2 sm:col-span-2">
            <button
              type="button"
              className="text-xs text-terminal-muted underline-offset-2 hover:text-accent hover:underline"
              onClick={() => setValues((prev) => ({ ...prev, ...randomStart(Date.now(), prev.timeZone) }))}
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

          <div className="sm:col-span-2">
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
