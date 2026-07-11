import type { ReactNode } from 'react';
import type { SortMode } from '../types/subscription';

interface Props {
  query: string;
  sort: SortMode;
  /** Rendered alongside the sort select, e.g. the filter chip row. */
  filterSlot?: ReactNode;
  onQueryChange: (q: string) => void;
  onSortChange: (s: SortMode) => void;
}

const sorts: { value: SortMode; label: string }[] = [
  { value: 'due', label: 'Más pronto' },
  { value: 'amount-desc', label: 'Monto ↓' },
  { value: 'amount-asc', label: 'Monto ↑' },
  { value: 'name', label: 'Nombre' },
];

export function SearchSortBar({ query, sort, filterSlot, onQueryChange, onSortChange }: Props) {
  return (
    <div className="search-sort-bar">
      <div className="search-input-wrap">
        <input
          type="search"
          className="search-input"
          placeholder="Buscar pago o categoría…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Buscar"
        />
        {query && (
          <button
            type="button"
            className="search-clear"
            aria-label="Limpiar búsqueda"
            onClick={() => onQueryChange('')}
          >
            ×
          </button>
        )}
      </div>
      <div className="search-sort-row-2">
        {filterSlot}
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
    </div>
  );
}
