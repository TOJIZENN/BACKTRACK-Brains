export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-terminal-border border-t-gold" />
      {label && <span className="text-sm text-terminal-muted">{label}</span>}
    </span>
  );
}
