import { useState } from 'react';
import { AuthStepIndicator } from './AuthStepIndicator';
import { ImportJsonPanel } from './ImportJsonPanel';
import { ImportRemindersPanel } from './ImportRemindersPanel';
import type { SubscriptionInput } from '../types/subscription';

const OFFER_KEY = 'bills-offer-onboarding';

export function markOnboardingOfferPending(): void {
  try {
    sessionStorage.setItem(OFFER_KEY, '1');
  } catch {
    /* private mode */
  }
}

export function clearOnboardingOfferPending(): void {
  try {
    sessionStorage.removeItem(OFFER_KEY);
  } catch {
    /* private mode */
  }
}

export function shouldOfferOnboarding(): boolean {
  try {
    return sessionStorage.getItem(OFFER_KEY) === '1';
  } catch {
    return false;
  }
}

interface Props {
  onCreateMany: (inputs: SubscriptionInput[]) => Promise<void>;
  onDismiss: () => void;
}

export function PostLoginOnboarding({ onCreateMany, onDismiss }: Props) {
  const [importMode, setImportMode] = useState<'json' | 'reminders' | null>(null);

  const handleImportDone = async (inputs: SubscriptionInput[]) => {
    await onCreateMany(inputs);
    clearOnboardingOfferPending();
    onDismiss();
  };

  const handleStart = () => {
    clearOnboardingOfferPending();
    onDismiss();
  };

  return (
    <div className="auth-shell">
      <div className="auth-card auth-card-login passkey-setup-card onboarding-card">
        <AuthStepIndicator step="onboarding" />
        <h1 className="auth-offer-title">Bienvenido a Bills</h1>
        <p className="auth-access-subtitle">
          Registra tus suscripciones y pagos recurrentes, y te avisamos antes de cada fecha límite
          para que nunca se te pase uno.
        </p>

        {importMode == null && (
          <>
            <button type="button" className="btn-primary btn-add" onClick={handleStart}>
              Empezar
            </button>

            <div className="onboarding-secondary-actions">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setImportMode('json')}
              >
                Importar JSON
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setImportMode('reminders')}
              >
                Pegar recordatorios
              </button>
            </div>
          </>
        )}

        {importMode === 'json' && <ImportJsonPanel onImport={handleImportDone} />}
        {importMode === 'reminders' && <ImportRemindersPanel onImport={handleImportDone} />}

        {importMode != null && (
          <button type="button" className="btn-text" onClick={() => setImportMode(null)}>
            ← Volver
          </button>
        )}
      </div>
    </div>
  );
}
