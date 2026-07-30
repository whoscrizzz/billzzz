import { useState } from 'react';
import type { SubscriptionInput } from '../types/subscription';
import {
  parseRemindersImport,
  toSubscriptionInput,
  type ParsedImportRow,
} from '../lib/import-reminders';
import { formatMoney } from '../lib/format-money';

interface Props {
  onImport: (rows: SubscriptionInput[]) => Promise<void>;
}

const FREQ_LABEL: Record<string, string> = {
  weekly: 'Semanal',
  monthly: 'Mensual',
  yearly: 'Anual',
  once: 'Único',
};

export function ImportRemindersPanel({ onImport }: Props) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ParsedImportRow[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleParse = () => {
    setError(null);
    const rows = parseRemindersImport(text);
    if (rows.length === 0) {
      setError('No se detectaron pagos. Copia líneas desde Recordatorios o usa CSV.');
      setPreview(null);
      return;
    }
    setPreview(rows);
    setSelected(new Set(rows.map((_, i) => i)));
  };

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleImport = async () => {
    if (!preview) return;
    const rows = preview.filter((_, i) => selected.has(i)).map(toSubscriptionInput);
    if (rows.length === 0) return;
    setImporting(true);
    try {
      await onImport(rows);
      setText('');
      setPreview(null);
      setSelected(new Set());
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="import-panel">
      <div className="section-head">
        <h3 className="import-title">Importar desde Recordatorios</h3>
        <p className="section-desc">
          En Recordatorios (Mac): selecciona varios recordatorios → Copiar. Pega aquí. También
          acepta CSV con columnas nombre, monto, fecha, frecuencia.
        </p>
      </div>

      <textarea
        className="import-textarea"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Ejemplo pegado desde Recordatorios:\nSpotify $79\n28/06/26 Cada mes\n\nPréstamo Stori $1037.70\n03/07/26 9:00 a.m. Cada semana`}
      />

      {error && <p className="banner error">{error}</p>}

      <div className="import-actions">
        <button type="button" className="btn-secondary btn-sm" onClick={handleParse}>
          Analizar texto
        </button>
      </div>

      {preview && (
        <>
          <p className="import-preview-label">
            {preview.length} detectado(s) — revisa antes de importar
          </p>
          <ul className="import-preview-list">
            {preview.map((row, i) => (
              <li key={i} className={`import-preview-row import-confidence-${row.confidence}`}>
                <label className="import-row-check">
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                  <span>
                    <strong>{row.name}</strong>
                    {row.amount > 0 && (
                      <span className="import-row-amount">
                        {' '}
                        {formatMoney(row.amount, row.currency)}
                      </span>
                    )}
                    <span className="import-row-meta">
                      {row.due_date ?? 'sin fecha'} · {FREQ_LABEL[row.frequency]}
                      {row.category ? ` · ${row.category}` : ''}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={importing || selected.size === 0}
            onClick={() => void handleImport()}
          >
            {importing ? 'Importando…' : `Importar ${selected.size} pago(s)`}
          </button>
        </>
      )}
    </section>
  );
}
