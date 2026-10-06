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

/** "2026-01-15 10:05 UTC" — all replay times are shown in UTC to match the chart. */
export function formatDateTimeUtc(input: number | string): string {
  const iso = new Date(input).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
