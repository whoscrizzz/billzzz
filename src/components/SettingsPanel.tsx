import { useEffect, useState } from 'react';
import {
  exportData,
  fetchHealth,
  fetchSettings,
  subscribeToPush,
  updateSettings,
} from '../lib/api';
import type { UserSettings } from '../types/subscription';
import { PasskeySettings } from './PasskeySettings';

interface SettingsPanelProps {
  email: string;
  onLogout: () => void;
  onSettingsChange?: (s: UserSettings) => void;
}

export function SettingsPanel({ email, onLogout, onSettingsChange }: SettingsPanelProps) {
  const [pushActive, setPushActive] = useState<boolean | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [budget, setBudget] = useState('');
  const [emailReminders, setEmailReminders] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [health, setHealth] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void fetchSettings().then((s) => {
      setBudget(s.budget_limit != null ? String(s.budget_limit) : '');
      setEmailReminders(s.email_reminders);
      onSettingsChange?.(s);
    });
    void fetchHealth().then((h) => {
      setHealth(
        `v${h.version} · DB ${h.db ? 'OK' : '—'} · Push ${h.push ? 'OK' : 'off'} · Email ${h.email ? 'OK' : 'off'}`
      );
    });
    void (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushActive(false);
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        setPushActive(!!sub);
      } catch {
        setPushActive(false);
      }
    })();
  }, [onSettingsChange]);

  const handleEnablePush = async () => {
    const ok = await subscribeToPush();
    setPushActive(ok);
    setPushStatus(
      ok ? 'Notificaciones activadas.' : 'No se pudieron activar (revisa permisos o VAPID).'
    );
  };

  const handleSaveSettings = async () => {
    const budget_limit = budget.trim() ? parseFloat(budget) : null;
    const s = await updateSettings({
      budget_limit: budget_limit != null && !Number.isNaN(budget_limit) ? budget_limit : null,
      email_reminders: emailReminders,
    });
    onSettingsChange?.(s);
    setSaveStatus('Preferencias guardadas');
    setTimeout(() => setSaveStatus(null), 2500);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bills-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-block panel-card">
        <h2>Cuenta</h2>
        <p className="panel-value">{email}</p>
        {health && <p className="panel-hint panel-mono">{health}</p>}
      </div>

      <div className="panel-block panel-card">
        <h2>Presupuesto mensual</h2>
        <p className="panel-hint">Meta de gasto estimado. Se muestra en el inicio.</p>
        <label>
          Límite (MXN)
          <input
            type="number"
            min="0"
            step="100"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="Ej. 15000"
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={emailReminders}
            onChange={(e) => setEmailReminders(e.target.checked)}
          />
          Recibir correo diario con pagos de la semana
        </label>
        <button
          type="button"
          className="btn-primary btn-sm"
          onClick={() => void handleSaveSettings()}
        >
          Guardar preferencias
        </button>
        {saveStatus && <p className="banner">{saveStatus}</p>}
      </div>

      <PasskeySettings />

      <div className="panel-block">
        <h2>Notificaciones push</h2>
        <p className="panel-hint">
          {pushActive === null
            ? 'Comprobando estado…'
            : pushActive
              ? 'Activas en este dispositivo.'
              : 'Sin suscripción push en este dispositivo.'}
        </p>
        <button type="button" className="btn-primary" onClick={() => void handleEnablePush()}>
          {pushActive ? 'Renovar avisos' : 'Activar avisos'}
        </button>
        {pushStatus && <p className="banner">{pushStatus}</p>}
      </div>

      <div className="panel-block panel-card">
        <h2>Exportar datos</h2>
        <p className="panel-hint">Descarga JSON con pagos e historial.</p>
        <button
          type="button"
          className="btn-secondary"
          disabled={exporting}
          onClick={() => void handleExport()}
        >
          {exporting ? 'Exportando…' : 'Descargar JSON'}
        </button>
      </div>

      <div className="panel-block">
        <h2>Instalar PWA</h2>
        <p className="panel-hint">
          <strong>iPhone:</strong> Safari → Compartir → Agregar a pantalla de inicio.
          <br />
          <strong>Android / PC:</strong> Chrome → Instalar app o Añadir a inicio.
        </p>
      </div>

      <button type="button" className="btn-danger btn-logout" onClick={() => void onLogout()}>
        Cerrar sesión
      </button>
    </section>
  );
}
