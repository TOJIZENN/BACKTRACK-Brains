import type { ReactNode } from 'react';

interface Props {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, children }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium uppercase tracking-wide text-terminal-muted">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-bear">{error}</p> : hint ? <p className="text-xs text-terminal-muted">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  'w-full rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 font-mono text-sm text-terminal-text outline-none transition focus:border-gold disabled:opacity-50';
