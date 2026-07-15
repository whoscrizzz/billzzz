import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSessions, revokeSession } from '../lib/api';
import { ActionIcon } from './ActionIcon';

interface SessionItem {
  id: string;
  device_name: string;
  ip: string | null;
  created_at: string;
  expires_at: string;
  is_current: boolean;
}

interface Props {
  /** Called after a session is revoked, so a parent-level session count stays in sync. */
  onRevoked?: (remaining: number) => void;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function SessionSettings({ onRevoked }: Props) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<SessionItem | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { sessions: list } = await fetchSessions();
      setSessions(list);
      return list;
    } catch {
      setSessions([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (pendingRevoke) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [pendingRevoke]);

  const handleConfirmRevoke = async () => {
    if (!pendingRevoke) return;
    setError(null);
    try {
      await revokeSession(pendingRevoke.id);
      setStatus(`Sesión en «${pendingRevoke.device_name}» cerrada.`);
      const remaining = await refresh();
      onRevoked?.(remaining.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar esa sesión');
    } finally {
      setPendingRevoke(null);
    }
  };

  return (
    <div className="panel-block panel-card session-settings">
      <h2>
        <ActionIcon name="shield" className="action-icon panel-title-icon" />
        Sesiones activas
      </h2>
      <p className="panel-hint">Dispositivos con sesión iniciada en tu cuenta.</p>

      {loading ? (
        <p className="panel-hint">Cargando sesiones…</p>
      ) : sessions.length === 0 ? (
        <p className="panel-hint">No hay sesiones activas.</p>
      ) : (
        <ul className="passkey-list">
          {sessions.map((s) => (
            <li key={s.id} className="passkey-row">
              <div>
                <p className="passkey-name">
                  {s.device_name}
                  {s.is_current && ' · Este dispositivo'}
                </p>
                <p className="passkey-meta">
                  Iniciada {formatDate(s.created_at)}
                  {s.ip && ` · ${s.ip}`}
                </p>
              </div>
              {!s.is_current && (
                <button
                  type="button"
                  className="btn-text btn-text-danger"
                  onClick={() => setPendingRevoke(s)}
                >
                  Cerrar sesión
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {status && <p className="banner">{status}</p>}
      {error && <p className="banner error">{error}</p>}

      <dialog ref={dialogRef} className="modal" onClose={() => setPendingRevoke(null)}>
        {pendingRevoke && (
          <div className="modal-card confirm-modal">
            <h3>
              <ActionIcon name="shield" className="action-icon confirm-modal-icon" />
              Cerrar sesión en «{pendingRevoke.device_name}»
            </h3>
            <p className="confirm-modal-body">
              Ese dispositivo tendrá que volver a entrar con passkey o enlace mágico.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPendingRevoke(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => void handleConfirmRevoke()}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
