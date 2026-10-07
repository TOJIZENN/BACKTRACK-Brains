const LOCALE = 'en-US';

const moneyFormatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export function formatMoney(value: number): string {
  return moneyFormatter.format(value);
}

export function formatSignedMoney(value: number): string {
  const formatted = moneyFormatter.format(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

export function formatPrice(value: number, precision: number): string {
  return value.toFixed(precision);
}

export function formatR(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}R`;
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatQuantity(value: number, precision: number): string {
  return value.toFixed(precision);
}

export { formatDateTime, formatShortDateTime } from './timezone';

/** "2d 3h 05m", "3h 05m", "45m" */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const mm = String(minutes).padStart(2, '0');
  if (days > 0) return `${days}d ${hours}h ${mm}m`;
  if (hours > 0) return `${hours}h ${mm}m`;
  return `${minutes}m`;
}
