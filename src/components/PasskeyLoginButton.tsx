import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  canUsePlatformPasskey,
  isPasskeyApiAvailable,
  isWebAuthnUserCancelled,
  loginWithPasskey,
} from '../lib/passkeys';

interface Props {
  onFallback?: () => void;
}

export function PasskeyLoginButton({ onFallback }: Props) {
  const { login } = useAuth();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      if (!isPasskeyApiAvailable()) {
        setAvailable(false);
        return;
      }
      setAvailable(await canUsePlatformPasskey());
    })();
  }, []);

  if (available === false) return null;

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await loginWithPasskey();
      login(result.token, result.user);
    } catch (err) {
      if (isWebAuthnUserCancelled(err)) {
        setError(null);
        return;
      }
      const message = err instanceof Error ? err.message : 'No se pudo usar el passkey';
      setError(message);
      onFallback?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="passkey-login-block">
      <button
        type="button"
        className="btn-primary btn-passkey"
        disabled={loading || available === null}
        onClick={() => void handleLogin()}
      >
        {loading ? 'Verificando…' : 'Entrar con passkey'}
      </button>
      <p className="panel-hint passkey-login-hint">Face ID, huella o PIN del dispositivo</p>
      {error && <p className="banner error">{error}</p>}
      <div className="auth-divider">
        <span>o con correo</span>
      </div>
    </div>
  );
}
