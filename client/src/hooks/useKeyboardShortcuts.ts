import { useEffect, useRef } from 'react';

export type ShortcutHandlers = Partial<Record<'playPause' | 'next' | 'previous' | 'reset' | 'buy' | 'sell' | 'escape', () => void>>;

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Space', action: 'Play / Pause' },
  { keys: '→', action: 'Next candle' },
  { keys: '←', action: 'Previous candle' },
  { keys: 'R', action: 'Reset replay' },
  { keys: 'B', action: 'Buy (uses order ticket SL/TP)' },
  { keys: 'S', action: 'Sell (uses order ticket SL/TP)' },
  { keys: 'Esc', action: 'Close dialog / leave input / cancel drawing' },
  { keys: 'Del', action: 'Delete selected drawing' },
  { keys: 'Enter', action: 'Finish path drawing (or double-click)' },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Global replay/trading shortcuts. Ignored while typing (except Escape) or when disabled. */
export function useKeyboardShortcuts(handlers: ShortcutHandlers, enabled = true) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Holding an arrow scrubs through candles; other keys must not auto-repeat (e.g. double orders).
      if (event.repeat && event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const h = ref.current;

      if (event.key === 'Escape') {
        if (isTypingTarget(event.target)) (event.target as HTMLElement).blur();
        h.escape?.();
        return;
      }
      if (isTypingTarget(event.target)) return;

      const action = (() => {
        switch (event.key) {
          case ' ':
            return h.playPause;
          case 'ArrowRight':
            return h.next;
          case 'ArrowLeft':
            return h.previous;
          case 'r':
          case 'R':
            return h.reset;
          case 'b':
          case 'B':
            return h.buy;
          case 's':
          case 'S':
            return h.sell;
          default:
            return undefined;
        }
      })();
      if (action) {
        // Stops Space from also "clicking" a focused button and arrows from scrolling.
        event.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
