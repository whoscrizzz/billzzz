import { useEffect, useState, type ReactNode } from 'react';
import { subscribeToPush } from '../lib/api';
import { pushPrerequisitesMet, syncPushSubscription } from '../lib/push-sync';

const OFFER_KEY = 'bills-offer-push';

export function markPushOfferPending(): void {
  try {
    sessionStorage.setItem(OFFER_KEY, '1');
  } catch {
    /* private mode */
  }
}

function clearPushOfferPending(): void {
  try {
    sessionStorage.removeItem(OFFER_KEY);
  } catch {
    /* private mode */
  }
}

function shouldOfferPush(): boolean {
  try {
    return sessionStorage.getItem(OFFER_KEY) === '1';
  } catch {
    return false;
  }
}

interface Props {
  children: ReactNode;
}

export function PostLoginPushOffer({ children }: Props) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldOfferPush()) return;

    const prereq = pushPrerequisitesMet();
    if (!prereq.ok) {
      clearPushOfferPending();
      return;
    }

    void (async () => {
      if (Notification.permission === 'granted') {
        await syncPushSubscription();
        clearPushOfferPending();
        return;
      }
      if (Notification.permission === 'denied') {
        clearPushOfferPending();
        return;
      }
      setShow(true);
    })();
  }, []);

  const handleEnable = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await subscribeToPush();
      clearPushOfferPending();
      setShow(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron activar las notificaciones.');
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = () => {
    clearPushOfferPending();
    setShow(false);
  };

  if (show) {
    return (
      <div className="auth-shell">
        <div className="panel-card auth-card" style={{ maxWidth: '22rem', margin: 'auto' }}>
          <h2>Avisos de pago</h2>
          <p className="panel-hint">
            Activa notificaciones para recordatorios de vencimientos en este dispositivo.
          </p>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={handleSkip} disabled={busy}>
              Ahora no
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => void handleEnable()}
            >
              {busy ? 'Activando...' : 'Activar avisos'}
            </button>
          </div>
          {error && <p className="banner error">{error}</p>}
        </div>
      </div>
    );
  }

  return children;
}
