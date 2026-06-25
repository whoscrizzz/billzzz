import { useState } from "react";
import type { PaymentRecord } from "../types/subscription";

interface Props {
  payments: PaymentRecord[];
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function PaymentHistory({ payments }: Props) {
  const [open, setOpen] = useState(false);

  if (payments.length === 0) return null;

  return (
    <section className="panel-card payment-history payment-history-collapsible">
      <button
        type="button"
        className="payment-history-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="section-title">Historial ({payments.length})</span>
        <span className="payment-history-chevron">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <ul className="payment-list">
          {payments.slice(0, 8).map((p) => (
            <li key={p.id} className="payment-row">
              <div>
                <p className="payment-name">{p.subscription_name ?? "Pago"}</p>
                <p className="payment-date">{formatDate(p.paid_at)}</p>
              </div>
              <p className="payment-amount">{formatMoney(p.amount, p.currency)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
