import type { SortMode } from "../types/subscription";

interface Props {
  query: string;
  sort: SortMode;
  onQueryChange: (q: string) => void;
  onSortChange: (s: SortMode) => void;
}

const sorts: { value: SortMode; label: string }[] = [
  { value: "due", label: "Fecha" },
  { value: "amount-desc", label: "Monto ↓" },
  { value: "amount-asc", label: "Monto ↑" },
  { value: "name", label: "Nombre" },
];

export function SearchSortBar({ query, sort, onQueryChange, onSortChange }: Props) {
  return (
    <div className="search-sort-bar">
      <input
        type="search"
        className="search-input"
        placeholder="Buscar pago o categoría…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        aria-label="Buscar"
      />
      <select
        className="sort-select"
        value={sort}
        onChange={(e) => onSortChange(e.target.value as SortMode)}
        aria-label="Ordenar"
      >
        {sorts.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
