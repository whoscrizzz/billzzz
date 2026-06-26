import { useState } from "react";

interface Props {
  dates: string[];
  onChange: (dates: string[]) => void;
  label?: string;
}

export function MultiDateChips({ dates, onChange, label = "Fechas de pago" }: Props) {
  const [draft, setDraft] = useState("");

  const addDate = () => {
    if (!draft || dates.includes(draft)) return;
    onChange([...dates, draft].sort());
    setDraft("");
  };

  const removeDate = (d: string) => {
    onChange(dates.filter((x) => x !== d));
  };

  return (
    <div className="multi-date-field">
      <span className="field-label">{label}</span>
      <p className="field-hint">Varias fechas en el mismo evento (colegiaturas, pagos trimestrales…)</p>
      <div className="multi-date-input-row">
        <input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Agregar fecha"
        />
        <button type="button" className="btn-secondary btn-sm" onClick={addDate} disabled={!draft}>
          + Agregar
        </button>
      </div>
      {dates.length > 0 && (
        <ul className="multi-date-chips">
          {dates.map((d) => (
            <li key={d} className="multi-date-chip">
              <span>{formatChipDate(d)}</span>
              <button type="button" aria-label={`Quitar ${d}`} onClick={() => removeDate(d)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatChipDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
