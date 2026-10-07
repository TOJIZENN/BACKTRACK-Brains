import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'buy' | 'sell' | 'danger';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-[#1e53e5] font-semibold',
  secondary: 'bg-terminal-raised text-terminal-text border border-terminal-strong hover:bg-[#2e2e2e]',
  ghost: 'text-terminal-text/80 hover:text-terminal-text hover:bg-terminal-raised',
  buy: 'bg-bull text-white hover:brightness-110 font-semibold',
  sell: 'bg-bear text-white hover:brightness-110 font-semibold',
  danger: 'bg-bear/15 text-bear border border-bear/40 hover:bg-bear/25',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'secondary', className = '', type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  );
}
