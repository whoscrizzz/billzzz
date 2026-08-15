import { useState } from 'react';
import {
  registerPasskey,
  isWebAuthnUserCancelled,
  isPasskeyAlreadyRegistered,
} from '../lib/passkeys';
import { ActionIcon } from './ActionIcon';
import { AuthStepIndicator } from './AuthStepIndicator';

interface Props {
  onDone: () => void;
}

const BENEFITS = [
  'Entra en un toque, sin escribir el correo cada vez.',
  'Face ID, huella o PIN — nunca sale de este dispositivo.',
  'Puedes quitarlo cuando quieras desde Ajustes.',
];

export function PasskeySetupPrompt({ onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    setError(null);
    setBusy(true);
    try {
      await registerPasskey();
      onDone();
    } catch (err) {
      if (isWebAuthnUserCancelled(err)) {
        onDone();
        return;
      }
      if (isPasskeyAlreadyRegistered(err)) {
        setError('Ya tienes una llave de acceso en este dispositivo.');
        return;
      }
      setError(err instanceof Error ? err.message : 'No se pudo activar el passkey');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <div
        className="auth-card auth-card-login passkey-setup-card"
        role="dialog"
        aria-labelledby="passkey-setup-title"
      >
        <AuthStepIndicator step="passkey" />
        <div className="auth-offer-icon" aria-hidden>
          <ActionIcon name="faceid" className="action-icon auth-offer-icon-svg" />
        </div>
        <h1 id="passkey-setup-title" className="auth-offer-title">
          La próxima vez, entra con Face ID
        </h1>
        <ul className="auth-offer-benefits">
          {BENEFITS.map((b) => (
            <li key={b}>
              <ActionIcon name="check" className="action-icon auth-offer-check" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn-primary btn-add"
          disabled={busy}
          onClick={() => void handleRegister()}
        >
          {busy ? 'Esperando verificación…' : 'Activar Face ID'}
        </button>
        <button type="button" className="btn-text auth-link-muted" onClick={onDone}>
          Ahora no
        </button>
        {error && <p className="banner error">{error}</p>}
      </div>
    </div>
  );
}
