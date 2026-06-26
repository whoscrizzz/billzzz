import type { ListLayout, SortMode } from "../types/subscription";

interface Props {
  query: string;
  sort: SortMode;
  layout: ListLayout;
  onQueryChange: (q: string) => void;
  onSortChange: (s: SortMode) => void;
  onLayoutChange: (layout: ListLayout) => void;
}

const sorts: { value: SortMode; label: string }[] = [
  { value: "due", label: "Más pronto" },
  { value: "amount-desc", label: "Monto ↓" },
  { value: "amount-asc", label: "Monto ↑" },
  { value: "name", label: "Nombre" },
];

export function SearchSortBar({
  query,
  sort,
  layout,
  onQueryChange,
  onSortChange,
  onLayoutChange,
}: Props) {
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
      <div className="layout-toggle" role="group" aria-label="Vista de lista">
        <button
          type="button"
          className={`layout-toggle-btn ${layout === "flat" ? "active" : ""}`}
          onClick={() => onLayoutChange("flat")}
        >
          Lista
        </button>
        <button
          type="button"
          className={`layout-toggle-btn ${layout === "category" ? "active" : ""}`}
          onClick={() => onLayoutChange("category")}
        >
          Categorías
        </button>
      </div>
    </div>
  );
}
