import { useMemo, useState } from 'react';
import { ActionIcon } from './ActionIcon';
import { formatMoney } from '../lib/format-money';
import { computeTotalsByCurrency } from '../lib/spending-stats';
import type { NavPage } from '../types/nav';
import type { PaymentRecord, Subscription } from '../types/subscription';

interface Props {
  subscriptions: Subscription[];
  payments: PaymentRecord[];
  budgetLimit: number | null;
  onPagarFactura: () => void;
  onNavigate: (page: NavPage) => void;
}

const RECENT_LIMIT = 5;

function primaryCurrencyOf(subscriptions: Subscription[]): string {
  return Array.from(new Set(subscriptions.map((s) => s.currency || 'MXN'))).sort()[0] ?? 'MXN';
}

/** Pantalla "Wallet" del layout de referencia — misma estructura visual
 * (tarjeta, 4 acciones, movimientos), pero cada número es real: el balance
 * sale de budget_limit y del gasto del mes (spending-stats), y las 4
 * acciones navegan a funcionalidad real de Bills. No hay número de cuenta
 * ni tarjeta bancaria falsos — Bills no tiene banco conectado. */
export function WalletView({
  subscriptions,
  payments,
  budgetLimit,
  onPagarFactura,
  onNavigate,
}: Props) {
  const [showAllMovements, setShowAllMovements] = useState(false);
  const currency = useMemo(() => primaryCurrencyOf(subscriptions), [subscriptions]);
  const totals = useMemo(() => computeTotalsByCurrency(subscriptions), [subscriptions]);
  const spent = totals[currency]?.monthly ?? 0;

  const hasBudget = budgetLimit != null && budgetLimit > 0;
  const available = hasBudget ? budgetLimit! - spent : null;

  const primaryPayments = payments.filter((p) => (p.currency || 'MXN') === currency);
  const shown = showAllMovements ? primaryPayments : primaryPayments.slice(0, RECENT_LIMIT);

  return (
    <div className="wallet-view">
      <section className="wallet-card" aria-label="Resumen de cuenta">
        <p className="wallet-card-label">
          {hasBudget ? 'Presupuesto disponible' : 'Gasto este mes'}
        </p>
        <p
          className={`wallet-card-balance ${hasBudget && available! < 0 ? 'wallet-card-balance-over' : ''}`}
        >
          {formatMoney(hasBudget ? available! : spent, currency)}
        </p>
        {hasBudget && (
          <p className="wallet-card-sub">de {formatMoney(budgetLimit!, currency)} presupuestados</p>
        )}
        {!hasBudget && (
          <button
            type="button"
            className="btn-text wallet-card-cta"
            onClick={() => onNavigate('settings')}
          >
            Configurar presupuesto
          </button>
        )}
      </section>

      <div className="wallet-actions" role="group" aria-label="Acciones">
        <button type="button" className="wallet-action" onClick={onPagarFactura}>
          <span className="wallet-action-icon" aria-hidden>
            <ActionIcon name="check" />
          </span>
          Pagar factura
        </button>
        <button type="button" className="wallet-action" onClick={() => onNavigate('add')}>
          <span className="wallet-action-icon" aria-hidden>
            <ActionIcon name="calculator" />
          </span>
          Registrar
        </button>
        <button
          type="button"
          className="wallet-action"
          onClick={() => setShowAllMovements((v) => !v)}
        >
          <span className="wallet-action-icon" aria-hidden>
            <ActionIcon name="trending-up" />
          </span>
          Movimientos
        </button>
        <button type="button" className="wallet-action" onClick={() => onNavigate('settings')}>
          <span className="wallet-action-icon" aria-hidden>
            <ActionIcon name="shield" />
          </span>
          Ajustes
        </button>
      </div>

      <div className="wallet-movements">
        <div className="section-head section-head-inline">
          <h2 className="section-title">Movimientos</h2>
          {primaryPayments.length > RECENT_LIMIT && (
            <button
              type="button"
              className="btn-text"
              onClick={() => setShowAllMovements((v) => !v)}
            >
              {showAllMovements ? 'Ver menos' : 'Ver todos'}
            </button>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="chart-empty-caption">Aún no hay movimientos.</p>
        ) : (
          <ul className="wallet-movements-list">
            {shown.map((p) => (
              <li key={p.id} className="wallet-movement-row">
                <div className="wallet-movement-main">
                  <p className="wallet-movement-name">{p.subscription_name ?? 'Pago'}</p>
                  <p className="wallet-movement-meta">{p.paid_at}</p>
                </div>
                <p className="wallet-movement-amount">-{formatMoney(p.amount, p.currency)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
