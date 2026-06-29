import { useEffect, useState, type ReactNode } from 'react';
import { canUsePlatformPasskey, isPasskeyApiAvailable } from '../lib/passkeys';
import { PasskeySetupPrompt } from './PasskeySetupPrompt';

const OFFER_KEY = 'bills-offer-passkey';

export function markPasskeyOfferPending(): void {
  try {
    sessionStorage.setItem(OFFER_KEY, '1');
  } catch {
    /* private mode */
  }
}

function clearPasskeyOfferPending(): void {
  try {
    sessionStorage.removeItem(OFFER_KEY);
  } catch {
    /* private mode */
  }
}

function shouldOfferPasskey(): boolean {
  try {
    return sessionStorage.getItem(OFFER_KEY) === '1';
  } catch {
    return false;
  }
}

interface Props {
  children: ReactNode;
}

export function PostLoginPasskeyOffer({ children }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!shouldOfferPasskey()) return;

    void (async () => {
      if (!isPasskeyApiAvailable() || !(await canUsePlatformPasskey())) {
        clearPasskeyOfferPending();
        return;
      }
      setShow(true);
    })();
  }, []);

  const handleDone = () => {
    clearPasskeyOfferPending();
    setShow(false);
  };

  if (show) {
    return <PasskeySetupPrompt onDone={handleDone} />;
  }

  return children;
}
