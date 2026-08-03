import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSnooze: (days: number) => void;
  onClearSnooze?: () => void;
  isSnoozed?: boolean;
}

const OPTIONS = [
  { days: 1, label: 'Mañana' },
  { days: 3, label: '3 días' },
  { days: 7, label: '1 semana' },
] as const;

/** Popover de "posponer", controlado por el long-press de la tarjeta que lo aloja
 * (no tiene botón propio — se activa manteniendo presionado el recordatorio). */
export function SnoozeMenu({ open, onOpenChange, onSnooze, onClearSnooze, isSnoozed }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="snooze-menu-popover snooze-menu-popover-card" ref={ref} role="menu">
      {OPTIONS.map((o) => (
        <button
          key={o.days}
          type="button"
          role="menuitem"
          className="snooze-menu-item"
          onClick={() => onSnooze(o.days)}
        >
          {o.label}
        </button>
      ))}
      {isSnoozed && onClearSnooze && (
        <button
          type="button"
          role="menuitem"
          className="snooze-menu-item snooze-menu-clear"
          onClick={onClearSnooze}
        >
          Quitar posponer
        </button>
      )}
    </div>
  );
}
