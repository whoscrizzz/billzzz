import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { initUpdateChecker } from '../services/update';

let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | undefined;

export function initServiceWorker(): void {
  const register = () => {
    applyUpdate = registerSW({
      immediate: true,
      onNeedRefresh() {
        window.dispatchEvent(new Event('bills-sw-need-refresh'));
      },
    });
    initUpdateChecker();
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(register);
  } else {
    window.addEventListener('load', register, { once: true });
  }
}

export function UpdatePrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = () => setVisible(true);
    window.addEventListener('bills-sw-need-refresh', show);
    return () => window.removeEventListener('bills-sw-need-refresh', show);
  }, []);

  if (!visible) return null;

  return (
    <div className="update-banner" role="status">
      <p>Hay una nueva versión de Bills. Actualiza para corregir el inicio de sesión en la app.</p>
      <button type="button" className="btn-primary btn-sm" onClick={() => void applyUpdate?.(true)}>
        Actualizar ahora
      </button>
      <button type="button" className="btn-link update-dismiss" onClick={() => setVisible(false)}>
        Después
      </button>
    </div>
  );
}
