import { useCallback, useRef, useState, type TouchEvent } from 'react';

const CLOSE_THRESHOLD_PX = 70;
const OPEN_EDGE_PX = 28;
const OPEN_THRESHOLD_PX = 80;

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

/** Swipe panel left to close; swipe from left edge on main to open. */
export function useSidebarSwipe(open: boolean, onOpen: () => void, onClose: () => void) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const fromEdge = useRef(false);

  const resetDrag = useCallback(() => {
    setDragX(0);
    setDragging(false);
    fromEdge.current = false;
  }, []);

  const panelTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!open || !isMobileViewport()) return;
      startX.current = e.touches[0]?.clientX ?? 0;
      setDragging(true);
    },
    [open]
  );

  const panelTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!dragging || !open) return;
      const x = e.touches[0]?.clientX ?? 0;
      const delta = x - startX.current;
      setDragX(Math.min(0, delta));
    },
    [dragging, open]
  );

  const panelTouchEnd = useCallback(() => {
    if (!dragging) return;
    if (dragX < -CLOSE_THRESHOLD_PX) onClose();
    resetDrag();
  }, [dragging, dragX, onClose, resetDrag]);

  const mainTouchStart = useCallback(
    (e: TouchEvent) => {
      if (open || !isMobileViewport()) return;
      const x = e.touches[0]?.clientX ?? 0;
      if (x > OPEN_EDGE_PX) return;
      fromEdge.current = true;
      startX.current = x;
      setDragging(true);
    },
    [open]
  );

  const mainTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!dragging || open || !fromEdge.current) return;
      const x = e.touches[0]?.clientX ?? 0;
      const delta = x - startX.current;
      if (delta > OPEN_THRESHOLD_PX) {
        onOpen();
        resetDrag();
      }
    },
    [dragging, open, onOpen, resetDrag]
  );

  const mainTouchEnd = useCallback(() => {
    if (fromEdge.current) resetDrag();
  }, [resetDrag]);

  const panelStyle = open && dragX !== 0 ? { transform: `translateX(${dragX}px)` } : undefined;

  return {
    dragging,
    panelStyle,
    panelTouchStart,
    panelTouchMove,
    panelTouchEnd,
    mainTouchStart,
    mainTouchMove,
    mainTouchEnd,
  };
}
