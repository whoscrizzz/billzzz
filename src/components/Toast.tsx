import { useEffect, useState } from 'react';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastState {
  message: string;
  action?: ToastAction;
}

let showToastFn: ((message: string, action?: ToastAction, durationMs?: number) => void) | null =
  null;

export function showToast(message: string, action?: ToastAction, durationMs?: number) {
  showToastFn?.(message, action, durationMs);
}

export function ToastHost() {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    showToastFn = (message, action, durationMs) => {
      setToast({ message, action });
      const t = setTimeout(() => setToast(null), durationMs ?? (action ? 5000 : 3000));
      return () => clearTimeout(t);
    };
    return () => {
      showToastFn = null;
    };
  }, []);

  if (!toast) return null;

  return (
    <div className="toast-host" role="status">
      <span>{toast.message}</span>
      <div className="toast-controls">
        {toast.action && (
          <button type="button" className="btn-text toast-action" onClick={toast.action.onClick}>
            {toast.action.label}
          </button>
        )}
        <button
          type="button"
          className="btn-text toast-close"
          aria-label="Cerrar notificación"
          onClick={() => setToast(null)}
        >
          ×
        </button>
      </div>
    </div>
  );
}
