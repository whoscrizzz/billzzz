import { useEffect, useRef, useState } from 'react';
import {
  exportData,
  fetchHealth,
  fetchSettings,
  revokeOtherSessions,
  subscribeToPush,
  updateSettings,
} from '../lib/api';
import { getPushHealth, pushPrerequisitesMet, syncPushSubscription } from '../lib/push-sync';
import type { NotificationHealth } from '../lib/api';
import { SUPPORTED_TIMEZONES } from '../lib/notify-timezone';
import { useTheme } from '../lib/theme';
import {
  loadRoundCents,
  loadStartScreen,
  saveRoundCents,
  saveStartScreen,
  loadAvatarColor,
  saveAvatarColor,
  loadShowAvatar,
  saveShowAvatar,
} from '../lib/ui-prefs';
import { useCalculator } from '../contexts/CalculatorContext';
import type { Subscription, UserSettings } from '../types/subscription';
import { ActionIcon } from './ActionIcon';
import { CalendarSync } from './CalendarSync';
import { CaptureSetup } from './CaptureSetup';
import { PasskeySettings } from './PasskeySettings';
import { SessionSettings } from './SessionSettings';
import { TrashPanel } from './TrashPanel';

interface SettingsPanelProps {
  email: string;
  onLogout: () => void;
  onSettingsChange?: (s: UserSettings) => void;
  trashed: Subscription[];
  onRestoreTrashed: (id: string) => Promise<void>;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return 'hace menos de una hora';
  if (hours < 24) return `hace ${hours} hora${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `hace ${days} día${days === 1 ? '' : 's'}`;
}

export function SettingsPanel({
  email,
  onLogout,
  onSettingsChange,
  trashed,
  onRestoreTrashed,
}: SettingsPanelProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { openCalculator } = useCalculator();
  const [roundCents, setRoundCents] = useState(() => loadRoundCents());
  const [startScreen, setStartScreen] = useState(() => loadStartScreen());
  const [avatarColor, setAvatarColor] = useState(() => loadAvatarColor());
  const [showAvatar, setShowAvatar] = useState(() => loadShowAvatar());
  const [pushActive, setPushActive] = useState<boolean | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [deliveryHealth, setDeliveryHealth] = useState<NotificationHealth | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [budget, setBudget] = useState('');
  const [emailReminders, setEmailReminders] = useState(false);
  const [timezone, setTimezone] = useState('America/Mexico_City');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [health, setHealth] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [activeSessions, setActiveSessions] = useState<number | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [revokeStatus, setRevokeStatus] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const revokeDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    void fetchSettings().then((s) => {
      setDisplayName(s.display_name ?? '');
      setBudget(s.budget_limit != null ? String(s.budget_limit) : '');
      setEmailReminders(s.email_reminders);
      setTimezone(s.timezone);
      setActiveSessions(s.active_sessions);
      onSettingsChange?.(s);
    });
    void fetchHealth().then((h) => {
      setHealth(
        `v${h.version} · DB ${h.db ? 'OK' : '—'} · Push ${h.push ? 'OK' : 'off'} · Email ${h.email ? 'OK' : 'off'}`
      );
    });
    void (async () => {
      const prereq = pushPrerequisitesMet();
      if (!prereq.ok) {
        setPushActive(false);
        setPushStatus(prereq.reason ?? null);
        return;
      }
      try {
        const health = await getPushHealth();
        setPushActive(health.clientSubscribed);
        setDeliveryHealth(health.delivery);
        if (health.needsRenewal) {
          setPushStatus(
            health.serverCount === 0
              ? 'Tu suscripción push expiró — actívala de nuevo.'
              : 'Renueva avisos: el servidor tiene una suscripción antigua.'
          );
        }
      } catch {
        setPushActive(false);
      }
    })();
  }, [onSettingsChange]);

  const handleEnablePush = async () => {
    const prereq = pushPrerequisitesMet();
    if (!prereq.ok) {
      setPushActive(false);
      setPushStatus(prereq.reason ?? 'No se pudieron activar (revisa permisos o VAPID).');
      return;
    }
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const ok = (await subscribeToPush()) || (await syncPushSubscription());
      setPushActive(ok);
      setPushStatus(
        ok ? 'Notificaciones activadas.' : 'No se pudieron activar (revisa permisos o VAPID).'
      );
    } catch (err) {
      setPushStatus(
        err instanceof Error ? err.message : 'No se pudieron activar las notificaciones.'
      );
    } finally {
      setPushBusy(false);
    }
  };

  const handleSaveSettings = async () => {
    const budget_limit = budget.trim() ? parseFloat(budget) : null;
    const s = await updateSettings({
      budget_limit: budget_limit != null && !Number.isNaN(budget_limit) ? budget_limit : null,
      email_reminders: emailReminders,
      timezone,
      display_name: displayName.trim() || null,
    });
    onSettingsChange?.(s);
    setSaveStatus('Preferencias guardadas');
    setTimeout(() => setSaveStatus(null), 2500);
  };

  useEffect(() => {
    if (confirmingRevoke) {
      revokeDialogRef.current?.showModal();
    } else {
      revokeDialogRef.current?.close();
    }
  }, [confirmingRevoke]);

  const handleRevokeOthers = async () => {
    setRevoking(true);
    try {
      const { revoked } = await revokeOtherSessions();
      setRevokeStatus(
        revoked > 0
          ? `Listo. Cerramos la sesión en ${revoked} otro${revoked === 1 ? '' : 's'} dispositivo${revoked === 1 ? '' : 's'}.`
          : 'No había otras sesiones activas.'
      );
      setActiveSessions(1);
    } catch {
      setRevokeStatus('No se pudo cerrar sesión en los otros dispositivos.');
    } finally {
      setRevoking(false);
      setConfirmingRevoke(false);
    }
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
        <h2>Apariencia</h2>
        <div className="layout-toggle" role="group" aria-label="Tema de la app">
          <button
            type="button"
            className={`layout-toggle-btn ${theme === 'light' ? 'active' : ''}`}
            onClick={() => setTheme('light')}
          >
            Claro
          </button>
          <button
            type="button"
            className={`layout-toggle-btn ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => setTheme('dark')}
          >
            Oscuro
          </button>
          <button
            type="button"
            className={`layout-toggle-btn ${theme === 'auto' ? 'active' : ''}`}
            onClick={() => setTheme('auto')}
          >
            Auto
          </button>
        </div>
        {theme === 'auto' && (
          <p className="panel-hint">
            Sigue el modo del sistema — ahora mismo, {resolvedTheme === 'dark' ? 'oscuro' : 'claro'}
            .
          </p>
        )}

        <p className="panel-subhead">Abrir la app en</p>
        <div className="layout-toggle" role="group" aria-label="Pantalla de arranque">
          <button
            type="button"
            className={`layout-toggle-btn ${startScreen === 'home' ? 'active' : ''}`}
            onClick={() => {
              setStartScreen('home');
              saveStartScreen('home');
            }}
          >
            Hoy
          </button>
          <button
            type="button"
            className={`layout-toggle-btn ${startScreen === 'summary' ? 'active' : ''}`}
            onClick={() => {
              setStartScreen('summary');
              saveStartScreen('summary');
            }}
          >
            Resumen
          </button>
        </div>
        <p className="panel-hint">
          {startScreen === 'summary'
            ? 'La app abre en el resumen, pensado para capturarlo y ponerlo en la pantalla de bloqueo.'
            : 'La app abre en Inicio. El resumen sigue disponible en /#/resumen.'}
        </p>
      </div>

      <div className="panel-block panel-card">
        <h2>Avatar</h2>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showAvatar}
            onChange={(e) => {
              const checked = e.target.checked;
              setShowAvatar(checked);
              saveShowAvatar(checked);
            }}
          />
          Mostrar monograma en la barra
        </label>
        {showAvatar && (
          <>
            <label>
              Color personalizado
              <input
                type="color"
                value={avatarColor || '#0a84ff'}
                onChange={(e) => {
                  setAvatarColor(e.target.value);
                  saveAvatarColor(e.target.value);
                }}
              />
            </label>
            <p className="panel-hint">
              Deja vacío para usar un color generado automáticamente según tu email.
            </p>
            <button
              type="button"
              onClick={() => {
                setAvatarColor('');
                saveAvatarColor('');
              }}
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Restablecer a automático
            </button>
          </>
        )}
      </div>

      <div className="panel-block panel-card">
        <h2>Cuenta</h2>
        <p className="panel-value">{email}</p>
        <label>
          Nombre para mostrar
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ej. Cristofer"
            maxLength={40}
          />
        </label>
        <p className="panel-hint">
          Reemplaza el correo y el indicador de conexión en el menú. Se guarda con "Guardar
          preferencias" más abajo.
        </p>
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
        <label>
          Zona horaria de los avisos
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {SUPPORTED_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
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

      <div className="panel-block panel-card">
        <h2>Herramientas</h2>
        <div className="settings-tool-row">
          <span>Calculadora flotante</span>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() =>
              openCalculator({
                initialValue: budget.trim() ? parseFloat(budget) : undefined,
                onUseAsBudget: (value) => setBudget(String(value)),
              })
            }
          >
            Abrir
          </button>
        </div>
        <label className="switch-row">
          <span>Redondear centavos</span>
          <span className="switch">
            <input
              type="checkbox"
              checked={roundCents}
              onChange={(e) => {
                setRoundCents(e.target.checked);
                saveRoundCents(e.target.checked);
              }}
            />
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
          </span>
        </label>
      </div>

      <CalendarSync />

      <CaptureSetup />

      <PasskeySettings />

      <SessionSettings onRevoked={setActiveSessions} />

      <div className="panel-block panel-card">
        <h2>
          <ActionIcon name="shield" className="action-icon panel-title-icon" />
          Seguridad
        </h2>
        <p className="panel-hint">
          {activeSessions == null
            ? 'Comprobando sesiones activas…'
            : activeSessions <= 1
              ? 'Solo este dispositivo tiene sesión iniciada.'
              : `Sesión iniciada en ${activeSessions} dispositivos.`}
        </p>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={activeSessions != null && activeSessions <= 1}
          onClick={() => setConfirmingRevoke(true)}
        >
          Cerrar sesión en otros dispositivos
        </button>
        {revokeStatus && <p className="banner">{revokeStatus}</p>}
      </div>

      <dialog ref={revokeDialogRef} className="modal" onClose={() => setConfirmingRevoke(false)}>
        <div className="modal-card confirm-modal">
          <h3>
            <ActionIcon name="shield" className="action-icon confirm-modal-icon" />
            Cerrar sesión en otros dispositivos
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
              onClick={() => setConfirmingRevoke(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={revoking}
              onClick={() => void handleRevokeOthers()}
            >
              {revoking ? 'Cerrando sesiones…' : 'Cerrar sesión en otros'}
            </button>
          </div>
        </div>
      </dialog>

      <div className="panel-block">
        <h2>Notificaciones push</h2>
        <p className="panel-hint">
          {pushActive === null
            ? 'Comprobando estado…'
            : pushActive
              ? 'Activas en este dispositivo.'
              : 'Sin suscripción push en este dispositivo.'}
        </p>
        {deliveryHealth &&
          (deliveryHealth.last_attempt_at == null ? (
            <p className="panel-hint">Sin envíos registrados todavía.</p>
          ) : deliveryHealth.consecutive_failures >= 3 ? (
            <p className="banner error">
              Los últimos {deliveryHealth.consecutive_failures} avisos fallaron — intenta reactivar.
            </p>
          ) : (
            <p className="panel-hint">
              Último aviso {deliveryHealth.last_status === 'sent' ? 'entregado' : 'con problema'}{' '}
              {formatRelative(deliveryHealth.last_attempt_at)}.
            </p>
          ))}
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={pushBusy}
          onClick={() => void handleEnablePush()}
        >
          {pushBusy ? 'Activando...' : pushActive ? 'Renovar avisos' : 'Activar avisos'}
        </button>
        {pushStatus && <p className="banner">{pushStatus}</p>}
      </div>

      <div className="panel-block panel-card">
        <h2>Exportar datos</h2>
        <p className="panel-hint">Descarga JSON con pagos e historial.</p>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={exporting}
          onClick={() => void handleExport()}
        >
          {exporting ? 'Exportando…' : 'Descargar JSON'}
        </button>
      </div>

      <div className="panel-block panel-card">
        <h2>Papelera</h2>
        <p className="panel-hint">
          {trashed.length === 0
            ? 'Vacía. Los pagos que elimines quedan aquí 30 días antes de borrarse para siempre.'
            : `${trashed.length} pago${trashed.length === 1 ? '' : 's'} en la papelera.`}
        </p>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setShowTrash(true)}>
          Abrir papelera
        </button>
      </div>

      {showTrash && (
        <TrashPanel
          trashed={trashed}
          onRestore={onRestoreTrashed}
          onClose={() => setShowTrash(false)}
        />
      )}

      <div className="panel-block">
        <h2>Instalar PWA</h2>
        <p className="panel-hint">
          <strong>iPhone:</strong> Safari → Compartir → Agregar a pantalla de inicio.
          <br />
          <strong>Android / PC:</strong> Chrome → Instalar app o Añadir a inicio.
        </p>
      </div>

      <button
        type="button"
        className="btn-danger btn-logout btn-sm"
        onClick={() => void onLogout()}
      >
        Cerrar sesión
      </button>
    </section>
  );
}
