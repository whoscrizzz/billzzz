import { useRef, useState } from "react";
import type { SubscriptionInput } from "../types/subscription";

interface Props {
  onImport: (inputs: SubscriptionInput[]) => Promise<void>;
}

function mapExportRow(row: Record<string, unknown>): SubscriptionInput | null {
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const amount = typeof row.amount === "number" ? row.amount : parseFloat(String(row.amount));
  const frequency = row.frequency;
  if (!name || !Number.isFinite(amount) || typeof frequency !== "string") return null;

  let due_dates: string[] | undefined;
  if (typeof row.due_dates === "string" && row.due_dates) {
    try {
      const parsed = JSON.parse(row.due_dates) as unknown;
      if (Array.isArray(parsed)) {
        due_dates = parsed.filter((d): d is string => typeof d === "string");
      }
    } catch {
      /* ignore malformed */
    }
  }

  return {
    name,
    amount,
    currency: typeof row.currency === "string" ? row.currency : "MXN",
    frequency: frequency as SubscriptionInput["frequency"],
    due_day: typeof row.due_day === "number" ? row.due_day : undefined,
    due_date: typeof row.due_date === "string" ? row.due_date : undefined,
    due_dates,
    category: typeof row.category === "string" ? row.category : undefined,
    notes: typeof row.notes === "string" ? row.notes : undefined,
    notify_days_before:
      typeof row.notify_days_before === "number" ? row.notify_days_before : undefined,
    notify_hour: typeof row.notify_hour === "number" ? row.notify_hour : undefined,
  };
}

export function ImportJsonPanel({ onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = async (file: File) => {
    setImporting(true);
    setStatus(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as { subscriptions?: unknown[] };
      const rows = Array.isArray(data.subscriptions) ? data.subscriptions : [];
      const inputs = rows
        .map((row) => mapExportRow(row as Record<string, unknown>))
        .filter((r): r is SubscriptionInput => r != null);
      if (inputs.length === 0) {
        setStatus("No se encontraron pagos válidos en el archivo.");
        return;
      }
      await onImport(inputs);
      setStatus(`${inputs.length} pago(s) importado(s).`);
    } catch {
      setStatus("Archivo JSON inválido.");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="import-json-panel">
      <h3>Importar JSON</h3>
      <p className="panel-hint">Restaura pagos desde un export de Bills (.json).</p>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="import-json-input"
        disabled={importing}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      {status && <p className="banner">{status}</p>}
    </div>
  );
}
