import { useEffect, useState } from 'react';
import { isStandalonePwa } from '../lib/pwa';

const DISMISSED_KEY = 'bills-install-pwa-dismissed';

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function dismiss(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    /* private mode */
  }
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Banner no bloqueante — a diferencia de PostLoginPushOffer/PasskeyOffer no es
 * parte del wizard de login: se muestra encima de la app ya en uso, una sola
 * vez (si se descarta, se guarda para siempre). Solo aparece donde realmente
 * se puede instalar: iOS Safari (guía manual) o Chrome/Android/desktop con
 * `beforeinstallprompt` disponible — nunca en navegadores sin ese camino. */
export function InstallPwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalonePwa() || isDismissed()) return;

    if (isIos()) {
      setShowIosGuide(true);
      setVisible(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const handleDismiss = () => {
    dismiss();
    setVisible(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    dismiss();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="update-banner" role="status">
      {showIosGuide ? (
        <p>
          Instala Billzzz: en Safari toca <strong>Compartir</strong> →{' '}
          <strong>Agregar a pantalla de inicio</strong>.
        </p>
      ) : (
        <>
          <p>Instala Billzzz para abrirla como app, con avisos y sin la barra del navegador.</p>
          <button type="button" className="btn-primary btn-sm" onClick={() => void handleInstall()}>
            Instalar
          </button>
        </>
      )}
      <button type="button" className="btn-link update-dismiss" onClick={handleDismiss}>
        {showIosGuide ? 'Entendido' : 'Ahora no'}
      </button>
    </div>
  );
}
