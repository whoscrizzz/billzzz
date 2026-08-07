import { useState } from 'react';
import { ActionIcon } from './ActionIcon';
import { AnalyticsInsights } from './AnalyticsInsights';
import { AssistantChat } from './AssistantChat';
import { PayBillSheet } from './PayBillSheet';
import { PaymentSuccessSheet } from './PaymentSuccessSheet';
import { WalletView } from './WalletView';
import type { NavPage } from '../types/nav';
import type { MarkPaidInput, PaymentRecord, Subscription } from '../types/subscription';

interface Props {
  subscriptions: Subscription[];
  payments: PaymentRecord[];
  budgetLimit: number | null;
  displayName: string | null;
  onMarkPaid: (id: string, input: MarkPaidInput) => void;
  onNavigate: (page: NavPage) => void;
}

type FinanzasView = 'wallet' | 'analytics' | 'assistant';

function primaryCurrencyOf(subscriptions: Subscription[]): string {
  return Array.from(new Set(subscriptions.map((s) => s.currency || 'MXN'))).sort()[0] ?? 'MXN';
}

/** Contenedor de las 3 pantallas "idénticas" al layout de referencia
 * (Wallet / Analytics / Assistant), con el mismo selector flotante de 3
 * iconos que aparece al pie de cada mockup — acá es navegación real entre
 * las 3 vistas en vez de decoración. Vive como una sola pestaña nueva
 * ('finanzas') dentro del nav existente: no reemplaza Inicio/Calendario. */
export function FinanzasHub({
  subscriptions,
  payments,
  budgetLimit,
  displayName,
  onMarkPaid,
  onNavigate,
}: Props) {
  const [view, setView] = useState<FinanzasView>('wallet');
  const [payOpen, setPayOpen] = useState(false);
  const [success, setSuccess] = useState<{
    name: string;
    amount: number;
    currency: string;
    paidAt: string;
  } | null>(null);

  const currency = primaryCurrencyOf(subscriptions);

  const handleConfirmPay = (subscription: Subscription, amount: number, paidAt: string) => {
    onMarkPaid(subscription.id, { amount, paid_at: paidAt });
    setPayOpen(false);
    setSuccess({ name: subscription.name, amount, currency: subscription.currency, paidAt });
  };

  return (
    <div className="finanzas-hub">
      <div className="finanzas-view">
        {view === 'wallet' && (
          <WalletView
            subscriptions={subscriptions}
            payments={payments}
            budgetLimit={budgetLimit}
            onPagarFactura={() => setPayOpen(true)}
            onNavigate={onNavigate}
          />
        )}
        {view === 'analytics' && (
          <AnalyticsInsights
            subscriptions={subscriptions}
            payments={payments}
            currency={currency}
          />
        )}
        {view === 'assistant' && <AssistantChat displayName={displayName} />}
      </div>

      <nav className="finanzas-pill-nav" aria-label="Cambiar de vista">
        <button
          type="button"
          className={`finanzas-pill-btn ${view === 'wallet' ? 'active' : ''}`}
          onClick={() => setView('wallet')}
          aria-label="Wallet"
        >
          <ActionIcon name="calculator" />
        </button>
        <button
          type="button"
          className={`finanzas-pill-btn ${view === 'analytics' ? 'active' : ''}`}
          onClick={() => setView('analytics')}
          aria-label="Analytics"
        >
          <ActionIcon name="trending-up" />
        </button>
        <button
          type="button"
          className={`finanzas-pill-btn ${view === 'assistant' ? 'active' : ''}`}
          onClick={() => setView('assistant')}
          aria-label="Asistente"
        >
          <ActionIcon name="shield" />
        </button>
      </nav>

      {payOpen && (
        <PayBillSheet
          subscriptions={subscriptions}
          onConfirm={handleConfirmPay}
          onClose={() => setPayOpen(false)}
        />
      )}

      {success && (
        <PaymentSuccessSheet
          subscriptionName={success.name}
          amount={success.amount}
          currency={success.currency}
          paidAt={success.paidAt}
          onClose={() => setSuccess(null)}
        />
      )}
    </div>
  );
}
