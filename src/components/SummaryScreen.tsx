import { useState } from 'react';
import type { PaymentRecord, Subscription } from '../types/subscription';
import { daysUntilNextDue, formatDueUrgency, sortByNextDue } from '../lib/due-dates';
import { currentDueAmount } from '../lib/due-dates-json';
import { computeBudgetOutlook } from '../lib/spending-stats';
import { formatMoney } from '../lib/format-money';
import { BrandMark } from './BrandMark';

/** Fase 7a — sustituto del widget de pantalla de inicio.
 *
 * iOS **no permite widgets nativos desde una PWA**: WidgetKit exige una app
 * firmada con su propia extensión, y una PWA no puede declarar una. Tampoco
 * hay API web equivalente — la Widgets API de la W3C sigue en borrador y
 * Safari no la implementa. Así que la ruta viable, y la que marca el propio
 * doc de la fase, es esta: una pantalla pensada para que el usuario le tome
 * captura y la ponga en su pantalla de bloqueo, más la opción de arrancar la
 * app directo acá (Ajustes → «Abrir la app en»).
 *
 * Por eso el layout evita todo lo que estorbaría en una captura: sin nav, sin
 * scroll, sin estados vacíos ruidosos. Dos datos y nada más — el doc es
 * explícito en que «un widget con seis datos no se lee».
 */

export type SummaryVariant = 'line' | 'square';

interface Props {
  subscriptions: Subscription[];
  payments: PaymentRecord[];
  budgetLimit: number | null;
  onExit: () => void;
}

function nextPayment(subscriptions: Subscription[]): Subscription | null {
  const upcoming = subscriptions
    .filter((s) => daysUntilNextDue(s) != null)
    .slice()
    .sort(sortByNextDue);
  return upcoming[0] ?? null;
}

/** «vence hoy» / «en N días» / «vencido hace N días» — mismo criterio de
 *  urgencia que usa SubscriptionCard, no una escala nueva. */
function whenLabel(days: number | null): string {
  if (days == null) return '';
  if (days === 0) return 'vence hoy';
  if (days === 1) return 'mañana';
  if (days > 0) return `en ${days} días`;
  const n = Math.abs(days);
  return n === 1 ? 'venció ayer' : `vencido hace ${n} días`;
}

export function SummaryScreen({ subscriptions, payments, budgetLimit, onExit }: Props) {
  const [variant, setVariant] = useState<SummaryVariant>('square');

  const next = nextPayment(subscriptions);
  const days = next ? daysUntilNextDue(next) : null;
  const urgency = formatDueUrgency(days);
  const outlook = computeBudgetOutlook(subscriptions, payments, budgetLimit);

  const amount = next ? formatMoney(currentDueAmount(next), next.currency) : null;

  return (
    <div className="summary-screen">
      <div className={`summary-card summary-card-${variant}`}>
        <div className="summary-brand" aria-hidden>
          <BrandMark className="summary-brand-icon" />
        </div>

        {next ? (
          <>
            <p className="summary-eyebrow">Próximo pago</p>
            <p className="summary-name">{next.name}</p>
            <p className="summary-amount">{amount}</p>
            <p className={`summary-when summary-when-${urgency}`}>{whenLabel(days)}</p>
          </>
        ) : (
          <>
            <p className="summary-eyebrow">Próximo pago</p>
            <p className="summary-name">Nada pendiente</p>
            <p className="summary-when summary-when-normal">Estás al día</p>
          </>
        )}

        {variant === 'square' && (
          <div className="summary-budget">
            {budgetLimit != null && budgetLimit > 0 ? (
              <>
                <div className="summary-budget-head">
                  <span className="summary-budget-label">Disponible del mes</span>
                  <span className="summary-budget-value">
                    {formatMoney(outlook.remaining, 'MXN')}
                  </span>
                </div>
                <div
                  className="summary-budget-bar"
                  role="img"
                  aria-label={`${Math.round(outlook.pctOfBudget ?? 0)}% del presupuesto`}
                >
                  <span
                    className={`summary-budget-fill${(outlook.pctOfBudget ?? 0) > 100 ? ' over' : ''}`}
                    style={{ width: `${Math.min(100, outlook.pctOfBudget ?? 0)}%` }}
                  />
                </div>
                <p className="summary-perday">{formatMoney(outlook.perDay, 'MXN')} por día</p>
              </>
            ) : (
              <p className="summary-perday summary-perday-empty">
                Define un presupuesto en Ajustes para ver el disponible
              </p>
            )}
          </div>
        )}
      </div>

      {/* Controles fuera de la tarjeta: quedan afuera del encuadre útil de la
          captura, así el usuario recorta la tarjeta y ya. */}
      <div className="summary-controls">
        <div className="layout-toggle" role="group" aria-label="Tamaño del resumen">
          <button
            type="button"
            className={`layout-toggle-btn ${variant === 'line' ? 'active' : ''}`}
            onClick={() => setVariant('line')}
          >
            Línea
          </button>
          <button
            type="button"
            className={`layout-toggle-btn ${variant === 'square' ? 'active' : ''}`}
            onClick={() => setVariant('square')}
          >
            Cuadrado
          </button>
        </div>
        <button type="button" className="btn-secondary btn-sm" onClick={onExit}>
          Ver todo
        </button>
      </div>
    </div>
  );
}
