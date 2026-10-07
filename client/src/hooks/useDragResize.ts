import { useRef, type PointerEvent } from 'react';

/**
 * Pointer handlers for a drag handle that resizes a panel anchored to the right or bottom edge.
 * `getAnchor` runs on pointer-down and returns the value such that `anchor − pointer` (clientX for
 * horizontal, clientY for vertical) is the new size; computing it from the grab point keeps the
 * handle exactly under the cursor without a jump.
 */
export function useDragResize(
  orientation: 'horizontal' | 'vertical',
  getAnchor: (handle: HTMLElement, pointer: number) => number,
  onSize: (px: number) => void,
) {
  const anchor = useRef(0);
  const coord = (e: PointerEvent<HTMLElement>) => (orientation === 'horizontal' ? e.clientX : e.clientY);

  const end = (e: PointerEvent<HTMLElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      anchor.current = getAnchor(e.currentTarget, coord(e));
      e.currentTarget.setPointerCapture(e.pointerId);
      document.body.style.cursor = orientation === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) onSize(anchor.current - coord(e));
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
}
