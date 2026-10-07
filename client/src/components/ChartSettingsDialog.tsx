import { useState } from 'react';
import { CHART_PRESETS, DEFAULT_CHART_SETTINGS, type ChartSettings } from '../chart/chartSettings';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

type Tab = 'symbol' | 'canvas';
type ColorKey = { [K in keyof ChartSettings]: ChartSettings[K] extends string ? K : never }[keyof ChartSettings];
type ToggleKey = { [K in keyof ChartSettings]: ChartSettings[K] extends boolean ? K : never }[keyof ChartSettings];

interface Props {
  settings: ChartSettings;
  onChange: (settings: ChartSettings) => void;
  onClose: () => void;
}

/** TradingView-style chart settings: candle colours (Symbol) and background/grid/scales (Canvas). Applies live. */
export function ChartSettingsDialog({ settings, onChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('symbol');
  const set = (patch: Partial<ChartSettings>) => onChange({ ...settings, ...patch });

  const swatch = (key: ColorKey, label: string, disabled = false) => (
    <label className={`flex items-center gap-2 ${disabled ? 'opacity-40' : ''}`}>
      <input
        type="color"
        value={settings[key]}
        disabled={disabled}
        onChange={(e) => set({ [key]: e.target.value } as Partial<ChartSettings>)}
        aria-label={label}
        className="h-7 w-9 cursor-pointer rounded border border-terminal-strong bg-transparent p-0.5 disabled:cursor-not-allowed"
      />
      <span className="text-xs text-terminal-muted">{label}</span>
    </label>
  );

  const row = (title: string, children: React.ReactNode, toggle?: ToggleKey) => (
    <div className="flex items-center gap-4 border-t border-terminal-border/60 py-2.5 first:border-0">
      <label className="flex w-28 shrink-0 items-center gap-2 text-sm">
        {toggle && (
          <input
            type="checkbox"
            checked={settings[toggle]}
            onChange={(e) => set({ [toggle]: e.target.checked } as Partial<ChartSettings>)}
            className="accent-accent"
            aria-label={`Show ${title.toLowerCase()}`}
          />
        )}
        {title}
      </label>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </div>
  );

  return (
    <Modal
      title="Chart settings"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={() => onChange({ ...DEFAULT_CHART_SETTINGS })}>
            Reset to defaults
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="mb-3 flex gap-1 border-b border-terminal-border" role="tablist">
        {(['symbol', 'canvas'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm capitalize ${tab === t ? 'border-accent text-terminal-text' : 'border-transparent text-terminal-muted hover:text-terminal-text'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'symbol' ? (
        <div data-testid="settings-symbol">
          {row('Body', <>{swatch('upColor', 'Up')}{swatch('downColor', 'Down')}</>)}
          {row('Borders', <>{swatch('borderUpColor', 'Up', !settings.borderVisible)}{swatch('borderDownColor', 'Down', !settings.borderVisible)}</>, 'borderVisible')}
          {row('Wick', <>{swatch('wickUpColor', 'Up', !settings.wickVisible)}{swatch('wickDownColor', 'Down', !settings.wickVisible)}</>, 'wickVisible')}
        </div>
      ) : (
        <div data-testid="settings-canvas">
          {row('Background', swatch('background', 'Solid'))}
          {row('Grid lines', swatch('gridColor', 'Colour', !settings.gridVisible), 'gridVisible')}
          {row('Crosshair', swatch('crosshairColor', 'Colour'))}
          {row('Scales text', swatch('scaleTextColor', 'Colour'))}
        </div>
      )}

      <div className="mt-4">
        <p className="mb-1.5 text-xs uppercase tracking-wide text-terminal-muted">Presets</p>
        <div className="flex flex-wrap gap-2">
          {CHART_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange({ ...preset.settings })}
              className="flex items-center gap-1.5 rounded border border-terminal-strong px-2 py-1 text-xs hover:bg-terminal-raised"
            >
              <span className="flex h-3.5 w-5 overflow-hidden rounded-sm" style={{ background: preset.settings.background }}>
                <span className="m-auto h-2.5 w-1" style={{ background: preset.settings.upColor }} />
                <span className="m-auto h-2.5 w-1" style={{ background: preset.settings.downColor }} />
              </span>
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
