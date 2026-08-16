import { useEffect, useState } from 'react';
import { fetchCalendarUrls, regenerateCalendarToken } from '../lib/api';

export function CalendarSync() {
  const [webcalUrl, setWebcalUrl] = useState<string | null>(null);
  const [subscribeUrl, setSubscribeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const [loadError, setLoadError] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchCalendarUrls();
      setWebcalUrl(data.webcalUrl);
      setSubscribeUrl(data.subscribeUrl);
      setLoadError(false);
    } catch {
      setStatus('No se pudo cargar el enlace del calendario');
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSubscribe = () => {
    if (!webcalUrl) return;
    window.location.href = webcalUrl;
    setStatus('Si no se abre Calendario, usa la suscripción manual abajo.');
  };

  const handleRegenerate = async () => {
    if (
      !confirm(
        'El enlace anterior dejará de funcionar, pero iPhone no borra solo el calendario viejo — ' +
          'se queda ahí sin actualizarse. Antes de suscribirte al nuevo, borra "Billzzz — Pagos" en ' +
          'Calendario → Calendarios → Editar, o vas a terminar con eventos duplicados. ¿Continuar?'
      )
    ) {
      return;
    }
    try {
      await regenerateCalendarToken();
      await load();
      setStatus(
        'Enlace nuevo generado. Primero borra el calendario "Billzzz — Pagos" viejo en tu iPhone ' +
          '(Calendario → Calendarios → Editar), y después suscríbete al nuevo enlace de abajo.'
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'No se pudo generar el enlace nuevo');
    }
  };

  const handleCopy = async () => {
    if (!subscribeUrl) return;
    try {
      await navigator.clipboard.writeText(subscribeUrl);
      setStatus('Enlace copiado. Pégalo en Calendario → Añadir calendario suscrito.');
    } catch {
      setStatus('Copia manualmente el enlace de abajo.');
    }
  };

  if (loading) {
    return (
      <section className="calendar-card">
        <p className="subtitle">Preparando calendario…</p>
      </section>
    );
  }

  return (
    <section className="calendar-card panel-card">
      <div className="section-head">
        <h2>Calendario iPhone</h2>
        <p className="section-desc">
          Cada pago genera un <strong>evento en Calendario</strong> a la hora que configures en cada
          suscripción, con alarmas X días antes y el mismo día.
        </p>
      </div>
      <ul className="calendar-features">
        <li>Evento en Calendario con alarma configurable</li>
        <li>iOS revisa el feed periódicamente (normalmente cada hora, a veces tarda más)</li>
        <li>Pagos únicos y recurrentes incluidos</li>
      </ul>
      <div className="calendar-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={handleSubscribe}
          disabled={!webcalUrl}
        >
          Abrir en Calendario
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={handleCopy}
          disabled={!subscribeUrl}
        >
          Copiar enlace
        </button>
      </div>
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
        <summary>Suscripción manual</summary>
        <ol>
          <li>Abre la app Calendario en iPhone</li>
          <li>Calendarios → Añadir calendario → Añadir calendario suscrito</li>
          <li>Pega el enlace HTTPS que copiaste</li>
          <li>Activa el calendario &quot;Billzzz — Pagos&quot;</li>
          <li>
            En Ajustes del calendario, activa <strong>Alertas</strong> y{' '}
            <strong>Recordatorios</strong>
          </li>
        </ol>
      </details>
      <button type="button" className="btn-link" onClick={handleRegenerate}>
        Generar nuevo enlace
      </button>
    </section>
  );
}
