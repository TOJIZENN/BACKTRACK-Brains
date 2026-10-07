import { Icon } from './ui/Icon';

interface Props {
  openPositions: number;
  onExpand: () => void;
}

/** Thin rail shown when the order panel is hidden, so the chart can use the full width. */
export function CollapsedPanelRail({ openPositions, onExpand }: Props) {
  return (
    <button
      type="button"
      onClick={onExpand}
      title="Show order panel"
      aria-label="Show order panel"
      data-testid="panel-rail"
      className="flex w-8 shrink-0 flex-col items-center gap-3 border-l border-terminal-border bg-terminal-panel py-2 text-terminal-muted hover:bg-terminal-raised hover:text-terminal-text max-lg:hidden"
    >
      <Icon name="chevronLeft" />
      <span className="text-[11px] font-semibold uppercase tracking-wider [writing-mode:vertical-rl]">Order ticket</span>
      {openPositions > 0 && (
        <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white" title={`${openPositions} open position(s)`}>
          {openPositions}
        </span>
      )}
    </button>
  );
}
