import { useState } from 'react';
import {
  registerPasskey,
  isWebAuthnUserCancelled,
  isPasskeyAlreadyRegistered,
} from '../lib/passkeys';

interface Props {
  onDone: () => void;
}

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
        onDone();
        return;
      }
      setError(err instanceof Error ? err.message : 'No se pudo activar el passkey');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="passkey-setup-overlay" role="dialog" aria-labelledby="passkey-setup-title">
      <div className="auth-card passkey-setup-card">
        <h1 id="passkey-setup-title">Activar passkey</h1>
        <p className="subtitle">
          Entra más rápido la próxima vez con Face ID, huella o PIN — sin pedir correo.
        </p>
        <button
          type="button"
          className="btn-primary btn-passkey btn-add"
          disabled={busy}
          onClick={() => void handleRegister()}
        >
          {busy ? 'Esperando verificación…' : 'Activar en este dispositivo'}
        </button>
        <button type="button" className="btn-text" onClick={onDone}>
          Ahora no
        </button>
        {error && <p className="banner error">{error}</p>}
      </div>
    </div>
  );
}
