import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSessions, revokeOtherSessions, revokeSession } from '../lib/api';
import { ActionIcon } from './ActionIcon';

interface SessionItem {
  id: string;
  device_name: string;
  ip: string | null;
  created_at: string;
  expires_at: string;
  is_current: boolean;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function SessionSettings() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<SessionItem | null>(null);
  const [confirmingRevokeAll, setConfirmingRevokeAll] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const revokeAllDialogRef = useRef<HTMLDialogElement>(null);

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

  useEffect(() => {
    if (confirmingRevokeAll) {
      revokeAllDialogRef.current?.showModal();
    } else {
      revokeAllDialogRef.current?.close();
    }
  }, [confirmingRevokeAll]);

  const handleConfirmRevoke = async () => {
    if (!pendingRevoke) return;
    setError(null);
    try {
      await revokeSession(pendingRevoke.id);
      setStatus(`Sesión en «${pendingRevoke.device_name}» cerrada.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar esa sesión');
    } finally {
      setPendingRevoke(null);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    setError(null);
    try {
      const { revoked } = await revokeOtherSessions();
      setStatus(
        revoked > 0
          ? `Listo. Cerramos la sesión en ${revoked} otro${revoked === 1 ? '' : 's'} dispositivo${revoked === 1 ? '' : 's'}.`
          : 'No había otras sesiones activas.'
      );
      await refresh();
    } catch {
      setError('No se pudo cerrar sesión en los otros dispositivos.');
    } finally {
      setRevokingAll(false);
      setConfirmingRevokeAll(false);
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

      {sessions.length > 1 && (
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => setConfirmingRevokeAll(true)}
        >
          Cerrar sesión en todos los demás
        </button>
      )}

      {status && <p className="banner">{status}</p>}
      {error && <p className="banner error">{error}</p>}

      <dialog
        ref={revokeAllDialogRef}
        className="modal"
        onClose={() => setConfirmingRevokeAll(false)}
      >
        <div className="modal-card confirm-modal">
          <h3>
            <ActionIcon name="shield" className="action-icon confirm-modal-icon" />
            Cerrar sesión en todos los demás
          </h3>
          <p className="confirm-modal-body">
            Esto cierra la sesión en todos tus demás dispositivos. Este en el que estás ahora
            seguirá con sesión activa. Tendrás que volver a entrar en los demás con passkey o enlace
            mágico.
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirmingRevokeAll(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={revokingAll}
              onClick={() => void handleRevokeAll()}
            >
              {revokingAll ? 'Cerrando sesiones…' : 'Cerrar sesión en otros'}
            </button>
          </div>
        </div>
      </dialog>

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
