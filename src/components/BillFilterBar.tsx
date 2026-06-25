import type { BillFilter } from "../types/subscription";

interface Props {
  value: BillFilter;
  onChange: (filter: BillFilter) => void;
}

const FILTERS: { id: BillFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "due-soon", label: "Próximos" },
  { id: "recurring", label: "Recurrentes" },
  { id: "once", label: "Únicos" },
];

export function BillFilterBar({ value, onChange }: Props) {
  return (
    <div className="filter-bar" role="tablist" aria-label="Filtrar pagos">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          role="tab"
          aria-selected={value === f.id}
          className={`filter-chip ${value === f.id ? "active" : ""}`}
          onClick={() => onChange(f.id)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
