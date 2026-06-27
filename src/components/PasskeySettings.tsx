import { useCallback, useEffect, useState } from "react";
import { deletePasskeyCredential, fetchPasskeys } from "../lib/api";
import {
  canUsePlatformPasskey,
  isPasskeyApiAvailable,
  isWebAuthnUserCancelled,
  registerPasskey,
} from "../lib/passkeys";

interface PasskeyItem {
  id: string;
  device_name: string;
  created_at: string;
  last_used_at: string | null;
  backed_up: boolean;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function PasskeySettings() {
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { passkeys: list } = await fetchPasskeys();
      setPasskeys(list);
    } catch {
      setPasskeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      if (!isPasskeyApiAvailable()) {
        setSupported(false);
        setLoading(false);
        return;
      }
      setSupported(await canUsePlatformPasskey());
      await refresh();
    })();
  }, [refresh]);

  const handleRegister = async () => {
    setError(null);
    setStatus(null);
    setRegistering(true);
    try {
      await registerPasskey();
      setStatus("Passkey activado en este dispositivo.");
      await refresh();
    } catch (err) {
      if (isWebAuthnUserCancelled(err)) return;
      setError(err instanceof Error ? err.message : "No se pudo registrar el passkey");
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await deletePasskeyCredential(id);
      setStatus("Passkey eliminado.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  };

  return (
    <div className="panel-block panel-card passkey-settings">
      <h2>Passkey (acceso rápido)</h2>
      <p className="panel-hint">
        Entra con Face ID, huella o PIN del dispositivo sin pedir correo cada vez. El magic link
        sigue disponible como respaldo.
      </p>

      {supported === false && (
        <p className="banner">
          Este navegador o dispositivo no admite passkeys. Usa el enlace mágico.
        </p>
      )}

      {supported && (
        <>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={registering}
            onClick={() => void handleRegister()}
          >
            {registering ? "Esperando Face ID / huella…" : "Activar passkey en este dispositivo"}
          </button>

          {loading ? (
            <p className="panel-hint">Cargando passkeys…</p>
          ) : passkeys.length === 0 ? (
            <p className="panel-hint">Aún no tienes passkeys registrados.</p>
          ) : (
            <ul className="passkey-list">
              {passkeys.map((pk) => (
                <li key={pk.id} className="passkey-row">
                  <div>
                    <p className="passkey-name">{pk.device_name}</p>
                    <p className="passkey-meta">
                      Registrado {formatDate(pk.created_at)}
                      {pk.last_used_at && ` · Último uso ${formatDate(pk.last_used_at)}`}
                      {pk.backed_up && " · Sincronizado"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-text btn-text-danger"
                    onClick={() => void handleDelete(pk.id)}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {status && <p className="banner">{status}</p>}
      {error && <p className="banner error">{error}</p>}
    </div>
  );
}
