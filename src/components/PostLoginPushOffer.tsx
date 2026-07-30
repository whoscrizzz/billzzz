import { useEffect, useState, type ReactNode } from 'react';
import { subscribeToPush } from '../lib/api';
import { pushPrerequisitesMet, syncPushSubscription } from '../lib/push-sync';
import { ActionIcon } from './ActionIcon';
import { AuthStepIndicator } from './AuthStepIndicator';

const OFFER_KEY = 'bills-offer-push';
const NOTIFY_DEFAULT_KEY = 'bills-notify-default';

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

export interface NotifyDefault {
  days: number;
  hour?: number;
}

/** Preferencia de aviso elegida en la oferta de push, para prellenar el primer uso. */
export function loadNotifyDefault(): NotifyDefault | null {
  try {
    const raw = sessionStorage.getItem(NOTIFY_DEFAULT_KEY);
    return raw ? (JSON.parse(raw) as NotifyDefault) : null;
  } catch {
    return null;
  }
}

function saveNotifyDefault(value: NotifyDefault): void {
  try {
    sessionStorage.setItem(NOTIFY_DEFAULT_KEY, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

interface DayOption {
  id: string;
  label: string;
  value: NotifyDefault;
}

const DAY_OPTIONS: DayOption[] = [
  { id: '1d', label: '1 día antes', value: { days: 1 } },
  { id: '2d9', label: '2 días antes · 9:00', value: { days: 2, hour: 9 } },
  { id: '1w', label: '1 semana antes', value: { days: 7 } },
];

interface Props {
  children: ReactNode;
}

export function PostLoginPushOffer({ children }: Props) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(DAY_OPTIONS[1].id);

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
    const chosen = DAY_OPTIONS.find((o) => o.id === selected);
    if (chosen) saveNotifyDefault(chosen.value);
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
        <div className="auth-card auth-card-login passkey-setup-card">
          <AuthStepIndicator step="push" />
          <div className="auth-offer-icon" aria-hidden>
            <ActionIcon name="bell" className="action-icon auth-offer-icon-svg" />
          </div>
          <h1 className="auth-offer-title">Avísanos cuándo recordarte</h1>
          <div className="auth-offer-options">
            {DAY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`auth-offer-option ${selected === opt.id ? 'active' : ''}`}
                onClick={() => setSelected(opt.id)}
              >
                <span>{opt.label}</span>
                {selected === opt.id && (
                  <ActionIcon name="check" className="action-icon auth-offer-option-check" />
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-primary btn-add"
            disabled={busy}
            onClick={() => void handleEnable()}
          >
            {busy ? 'Activando...' : 'Permitir notificaciones'}
          </button>
          <button type="button" className="btn-text auth-link-muted" onClick={handleSkip}>
            Sin avisos por ahora
          </button>
          {error && <p className="banner error">{error}</p>}
        </div>
      </div>
    );
  }

  return children;
}
