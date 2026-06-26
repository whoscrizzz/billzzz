import { useEffect, useRef, useState } from "react";

interface Props {
  onSnooze: (days: number) => void;
  onClearSnooze?: () => void;
  isSnoozed?: boolean;
}

const OPTIONS = [
  { days: 1, label: "Mañana" },
  { days: 3, label: "3 días" },
  { days: 7, label: "1 semana" },
] as const;

export function SnoozeMenu({ onSnooze, onClearSnooze, isSnoozed }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="snooze-menu" ref={ref}>
      <button
        type="button"
        className={`btn-icon ${isSnoozed ? "btn-icon-warn" : ""}`}
        title="Posponer"
        aria-label="Posponer"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⏸
      </button>
      {open && (
        <div className="snooze-menu-popover" role="menu">
          {OPTIONS.map((o) => (
            <button
              key={o.days}
              type="button"
              role="menuitem"
              className="snooze-menu-item"
              onClick={() => {
                onSnooze(o.days);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
          {isSnoozed && onClearSnooze && (
            <button
              type="button"
              role="menuitem"
              className="snooze-menu-item snooze-menu-clear"
              onClick={() => {
                onClearSnooze();
                setOpen(false);
              }}
            >
              Quitar posponer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
