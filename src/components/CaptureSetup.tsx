import { useEffect, useState } from 'react';
import { fetchCaptureToken, regenerateCaptureToken } from '../lib/api';

/** Fase 7b — token de dispositivo para registrar un gasto desde Atajos/Siri
 *  sin abrir la app. Misma forma que CalendarSync (mostrar / copiar /
 *  regenerar), que ya resuelve el mismo problema para el feed .ics. */
export function CaptureSetup() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchCaptureToken();
      setToken(data.token);
      setLoadError(false);
    } catch {
      setStatus('No se pudo cargar el token de captura');
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const endpoint = `${window.location.origin}/bills-api/capture`;

  const handleCopyToken = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setStatus('Token copiado. Pégalo en el campo X-Capture-Token del Atajo.');
    } catch {
      setStatus('Muestra el token con «Ver token» y cópialo manualmente.');
    }
  };

  const handleCopyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      setStatus('URL copiada. Es la dirección del paso «Obtener contenido de» del Atajo.');
    } catch {
      setStatus(`Copia manualmente: ${endpoint}`);
    }
  };

  const handleRegenerate = async () => {
    if (
      !confirm(
        'El token anterior dejará de funcionar de inmediato y cualquier Atajo que lo use va a ' +
          'fallar hasta que lo actualices con el nuevo. ¿Continuar?'
      )
    ) {
      return;
    }
    try {
      const data = await regenerateCaptureToken();
      setToken(data.token);
      setRevealed(true);
      setStatus('Token nuevo generado. Actualízalo en tus Atajos antes de volver a usarlos.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'No se pudo generar el token nuevo');
    }
  };

  if (loading) {
    return (
      <section className="calendar-card panel-card">
        <p className="subtitle">Preparando captura rápida…</p>
      </section>
    );
  }

  return (
    <section className="calendar-card panel-card">
      <div className="section-head">
        <h2>Captura rápida</h2>
        <p className="section-desc">
          Registra un gasto desde <strong>Atajos o Siri</strong> sin abrir Billzzz. El token
          identifica tu cuenta — trátalo como una contraseña.
        </p>
      </div>

      <div className="calendar-actions">
        <button type="button" className="btn-primary" onClick={() => void handleCopyToken()}>
          Copiar token
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => void handleCopyEndpoint()}
        >
          Copiar URL
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => setRevealed((v) => !v)}
        >
          {revealed ? 'Ocultar token' : 'Ver token'}
        </button>
      </div>

      {revealed && token && <p className="capture-token-value">{token}</p>}

      {status && (
        <p className={`banner ${loadError ? 'error' : ''}`}>
          {status}
          {loadError && (
            <>
              {' '}
              <button type="button" className="btn-link" onClick={() => void load()}>
                Reintentar
              </button>
            </>
          )}
        </p>
      )}

      <details className="calendar-help">
        <summary>Cómo armar el Atajo</summary>
        <ol>
          <li>Abre Atajos → nuevo atajo → «Pedir entrada» de tipo Número, pregunta «¿Cuánto?»</li>
          <li>Otra «Pedir entrada» de tipo Texto, pregunta «¿En qué?» (es la categoría)</li>
          <li>
            Agrega «Obtener contenido de» con la URL copiada arriba, método <strong>POST</strong>
          </li>
          <li>
            En Encabezados, agrega <strong>X-Capture-Token</strong> con el token copiado
          </li>
          <li>
            En Cuerpo de la solicitud (JSON), agrega <strong>amount</strong> (número, la primera
            entrada) y <strong>category</strong> (texto, la segunda)
          </li>
          <li>Nombra el atajo «Billzzz» y ya puedes decir «Oye Siri, Billzzz»</li>
        </ol>
        <p className="panel-hint">
          También puedes compartir texto a Billzzz desde cualquier app: se abre el registro rápido
          con el monto y el nombre ya llenos.
        </p>
      </details>

      <button type="button" className="btn-link" onClick={() => void handleRegenerate()}>
        Generar token nuevo
      </button>
    </section>
  );
}
