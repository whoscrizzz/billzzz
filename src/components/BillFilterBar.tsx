import { useEffect, useRef, useState } from 'react';
import type { BillFilter } from '../types/subscription';

interface Props {
  value: BillFilter;
  onChange: (filter: BillFilter) => void;
}

const FILTERS: { id: BillFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'due-soon', label: 'Próximos' },
  { id: 'recurring', label: 'Recurrentes' },
  { id: 'once', label: 'Únicos' },
];

export function BillFilterBar({ value, onChange }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  // Only fade the trailing edge when the chips actually overflow — otherwise
  // the mask permanently dims the last chip on viewports where they all fit.
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const check = () => setScrollable(el.scrollWidth > el.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    window.addEventListener('resize', check);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', check);
    };
  }, []);

  return (
    <div
      ref={barRef}
      className={`filter-bar${scrollable ? ' filter-bar-scrollable' : ''}`}
      role="tablist"
      aria-label="Filtrar pagos"
    >
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          role="tab"
          aria-selected={value === f.id}
          className={`filter-chip ${value === f.id ? 'active' : ''}`}
          onClick={() => onChange(f.id)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
