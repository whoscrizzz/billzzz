import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  canUsePlatformPasskey,
  isPasskeyApiAvailable,
  isWebAuthnUserCancelled,
  loginWithPasskey,
} from '../lib/passkeys';
import { markPushOfferPending } from './PostLoginPushOffer';
import { markOnboardingOfferPending } from './PostLoginOnboarding';
import { ActionIcon } from './ActionIcon';

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
      markPushOfferPending();
      markOnboardingOfferPending();
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
        className="btn-faceid"
        disabled={loading || available === null}
        onClick={() => void handleLogin()}
      >
        <ActionIcon name="faceid" className="action-icon btn-faceid-icon" />
        {loading ? 'Verificando…' : 'Entrar con Face ID'}
      </button>
      {error && <p className="banner error">{error}</p>}
      <div className="auth-divider">
        <span>o con tu correo</span>
      </div>
    </div>
  );
}
