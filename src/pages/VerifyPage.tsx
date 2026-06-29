import { useState } from 'react';
import { PasskeySetupPrompt } from '../components/PasskeySetupPrompt';
import { useAuth } from '../contexts/AuthContext';
import { verifyMagicLink } from '../lib/api';
import { canUsePlatformPasskey, isPasskeyApiAvailable } from '../lib/passkeys';

interface VerifyPageProps {
  onComplete: () => void;
}

export function VerifyPage({ onComplete }: VerifyPageProps) {
  const { login } = useAuth();
  const [magicToken] = useState(
    () => new URLSearchParams(window.location.search).get('token') ?? ''
  );
  const [error, setError] = useState<string | null>(
    magicToken ? null : 'Enlace inválido — falta el token.'
  );
  const [busy, setBusy] = useState(false);
  const [passkeyStep, setPasskeyStep] = useState(false);

  const finish = () => {
    window.history.replaceState({}, '', '/');
    onComplete();
  };

  const handleConfirm = async () => {
    if (!magicToken || busy) return;

    setBusy(true);
    setError(null);

    try {
      const result = await verifyMagicLink(magicToken);
      login(result.token, result.user);

      if (isPasskeyApiAvailable() && (await canUsePlatformPasskey())) {
        setPasskeyStep(true);
      } else {
        finish();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo verificar');
    } finally {
      setBusy(false);
    }
  };

  if (passkeyStep) {
    return <PasskeySetupPrompt onDone={finish} />;
  }

  return (
    <div className="auth-card">
      <h1>Confirmar acceso</h1>
      {error ? (
        <>
          <p className="banner error">{error}</p>
          <p className="panel-hint">
            Si dice «Enlace ya usado», pide uno nuevo desde la pantalla de inicio de sesión.
          </p>
        </>
      ) : (
        <>
          <p className="subtitle">
            Toca el botón para entrar a Bills. Esto evita que el correo consuma el enlace antes que
            tú.
          </p>
          <button
            type="button"
            className="btn-primary btn-add"
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? 'Entrando...' : 'Entrar a Bills'}
          </button>
        </>
      )}
    </div>
  );
}
