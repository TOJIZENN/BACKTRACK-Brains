interface Props {
  title?: string;
  message: string;
  onDismiss?: () => void;
  action?: { label: string; onClick: () => void };
}

export function ErrorBanner({ title = 'Error', message, onDismiss, action }: Props) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-md border border-bear/40 bg-bear/10 px-3 py-2 text-sm">
      <div className="flex-1">
        <span className="font-semibold text-bear">{title}: </span>
        <span className="text-terminal-text">{message}</span>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded border border-bear/50 px-2 py-0.5 text-xs font-semibold text-terminal-text hover:bg-bear/20"
        >
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-terminal-muted hover:text-terminal-text" aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}
