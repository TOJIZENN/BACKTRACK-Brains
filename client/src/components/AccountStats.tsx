import type { AccountStats as Stats } from '../trading/statistics';
import { formatMoney, formatPercent, formatR, formatSignedMoney } from '../utils/format';

function tone(value: number | null): string {
  if (value === null || value === 0) return 'text-terminal-text';
  return value > 0 ? 'text-bull' : 'text-bear';
}

function formatProfitFactor(value: number | null): string {
  if (value === null) return '—';
  return Number.isFinite(value) ? value.toFixed(2) : '∞';
}

export function AccountStats({ stats }: { stats: Stats }) {
  const items: { label: string; value: string; className?: string; title?: string }[] = [
    { label: 'Starting balance', value: formatMoney(stats.startingBalance) },
    { label: 'Current balance', value: formatMoney(stats.balance) },
    { label: 'Equity', value: formatMoney(stats.equity), title: 'Balance plus unrealized P&L of open positions' },
    { label: 'Total P&L', value: formatSignedMoney(stats.totalPnl), className: tone(stats.totalPnl) },
    { label: 'Win rate', value: stats.winRate === null ? '—' : formatPercent(stats.winRate) },
    { label: 'Trades', value: String(stats.totalTrades), title: `${stats.openTrades} open` },
    { label: 'Winning', value: String(stats.wins), className: 'text-bull' },
    { label: 'Losing', value: String(stats.losses), className: 'text-bear' },
    { label: 'Average R', value: stats.averageR === null ? '—' : formatR(stats.averageR), className: tone(stats.averageR) },
    { label: 'Profit factor', value: formatProfitFactor(stats.profitFactor), title: 'Gross profit ÷ gross loss' },
    {
      label: 'Max drawdown',
      value: stats.maxDrawdown > 0 ? `${formatMoney(stats.maxDrawdown)} (${formatPercent(stats.maxDrawdownPercent)})` : '—',
      className: stats.maxDrawdown > 0 ? 'text-bear' : undefined,
      title: 'Largest peak-to-trough decline of the closed-trade balance',
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs" data-testid="account-stats">
      {items.map((item) => (
        <div key={item.label} title={item.title} className="flex flex-col">
          <dt className="text-terminal-muted">{item.label}</dt>
          <dd className={`font-mono text-[13px] ${item.className ?? 'text-terminal-text'}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
