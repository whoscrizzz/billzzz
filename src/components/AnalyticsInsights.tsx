import { useMemo, useState } from 'react';
import { categoryColor } from '../lib/categories';
import { formatMoney, formatMoneyCompact } from '../lib/format-money';
import { type CategoryRange, computeCategoryTotals } from '../lib/spending-stats';
import type { PaymentRecord, Subscription } from '../types/subscription';

interface Props {
  subscriptions: Subscription[];
  payments: PaymentRecord[];
  currency: string;
}

const RANGE_LABEL: Record<CategoryRange, string> = {
  month: 'Este mes',
  quarter: '3 meses',
};

/** Dona por categoría vía conic-gradient — sin librería de charts, mismos
 * datos que CategoryTotalsPanel (computeCategoryTotals sobre pagos reales,
 * no estimado). El mockup de referencia ofrecía "1 año" además de mes/3
 * meses; spending-stats solo soporta mes/trimestre hoy, así que se muestran
 * solo esos dos en vez de inventar un tercer rango sin datos reales detrás. */
export function AnalyticsInsights({ subscriptions, payments, currency }: Props) {
  const [range, setRange] = useState<CategoryRange>('month');

  const totals = useMemo(
    () => computeCategoryTotals(subscriptions, payments, range),
    [subscriptions, payments, range]
  );
  const grandTotal = totals.reduce((sum, t) => sum + t.total, 0);

  const gradient = useMemo(() => {
    if (totals.length === 0) return 'var(--surface-2)';
    let acc = 0;
    const stops = totals.map((t) => {
      const color = categoryColor(t.category);
      const start = acc;
      acc += t.pct;
      return `${color} ${start}% ${acc}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [totals]);

  return (
    <div className="analytics-insights">
      <div className="layout-toggle analytics-range" role="tablist">
        {(Object.keys(RANGE_LABEL) as CategoryRange[]).map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            className={`layout-toggle-btn ${range === r ? 'active' : ''}`}
            onClick={() => setRange(r)}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      <div className="analytics-donut-wrap">
        <div className="analytics-donut" style={{ background: gradient }}>
          <div className="analytics-donut-hole">
            <p className="analytics-donut-label">Total pagado</p>
            <p className="analytics-donut-total">{formatMoneyCompact(grandTotal, currency)}</p>
          </div>
        </div>
      </div>

      {totals.length === 0 ? (
        <p className="chart-empty-caption">Sin pagos registrados en este rango.</p>
      ) : (
        <ul className="analytics-category-list">
          {totals.map((t) => {
            const color = categoryColor(t.category);
            return (
              <li key={t.category} className="analytics-category-row">
                <span
                  className="analytics-category-dot"
                  style={{ background: color }}
                  aria-hidden
                />
                <span className="analytics-category-name">{t.category}</span>
                <span className="analytics-category-pct">{Math.round(t.pct)}%</span>
                <span className="analytics-category-amount">{formatMoney(t.total, currency)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
