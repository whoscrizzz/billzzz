import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from './components/AppLayout';
import { BillFilterBar } from './components/BillFilterBar';
import { LoginForm } from './components/LoginForm';
import { PostLoginPasskeyOffer } from './components/PostLoginPasskeyOffer';
import { PostLoginPushOffer } from './components/PostLoginPushOffer';
import { SearchSortBar } from './components/SearchSortBar';
import { SpendingOverview } from './components/SpendingOverview';
import { SubscriptionCard } from './components/SubscriptionCard';
import { SubscriptionListGrouped } from './components/SubscriptionListGrouped';
import { TodayPanel } from './components/TodayPanel';
import { ConfirmActionModal, type ConfirmAction } from './components/ConfirmActionModal';
import { BrandMark } from './components/BrandMark';
import { NavIcon } from './components/NavIcon';
import { ToastHost, showToast } from './components/Toast';
import { UpdatePrompt } from './components/UpdatePrompt';
import { useMediaQuery } from './hooks/useMediaQuery';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useSubscriptions } from './hooks/useSubscriptions';
import { fetchSettings } from './lib/api';
import { parseRemindersImport } from './lib/import-reminders';
import { daysUntilNextDue, sortByNextDue } from './lib/due-dates';
import { localIsoDate } from './lib/local-date';
import { NOTIFY_TIMEZONE } from './lib/notify-timezone';
import {
  loadListLayout,
  loadSortMode,
  loadStartScreen,
  saveListLayout,
  saveSortMode,
} from './lib/ui-prefs';
import { formatMoney as formatCurrency } from './lib/format-money';
import { useTheme } from './lib/theme';
import { computeTotalsByCurrency } from './lib/spending-stats';
import { currentDueAmount, parseDueDates } from './lib/due-dates-json';
import { readNavPageFromLocation, writeNavPageToLocation } from './lib/nav-route';
import { NAV_ITEMS, type NavPage } from './types/nav';
import { PostLoginOnboarding, shouldOfferOnboarding } from './components/PostLoginOnboarding';
import { isClickSuppressed } from './lib/swipe-click-guard';
import type {
  BillFilter,
  ListLayout,
  MarkPaidInput,
  SortMode,
  Subscription,
} from './types/subscription';
import './App.css';

const AddSubscriptionForm = lazy(() =>
  import('./components/AddSubscriptionForm').then((m) => ({ default: m.AddSubscriptionForm }))
);
const CalendarSync = lazy(() =>
  import('./components/CalendarSync').then((m) => ({ default: m.CalendarSync }))
);
const CaptureSetup = lazy(() =>
  import('./components/CaptureSetup').then((m) => ({ default: m.CaptureSetup }))
);
const SettingsPanel = lazy(() =>
  import('./components/SettingsPanel').then((m) => ({ default: m.SettingsPanel }))
);
const EditSubscriptionModal = lazy(() =>
  import('./components/EditSubscriptionModal').then((m) => ({ default: m.EditSubscriptionModal }))
);
const MarkPaidModal = lazy(() =>
  import('./components/MarkPaidModal').then((m) => ({ default: m.MarkPaidModal }))
);
const QuickAddSheet = lazy(() =>
  import('./components/QuickAddSheet').then((m) => ({ default: m.QuickAddSheet }))
);
const VerifyPage = lazy(() =>
  import('./pages/VerifyPage').then((m) => ({ default: m.VerifyPage }))
);
const SummaryScreen = lazy(() =>
  import('./components/SummaryScreen').then((m) => ({ default: m.SummaryScreen }))
);

/** Fase 7a — ruta de la vista de captura. Hash y no `?p=`: no es una pestaña
 *  de la app, es una pantalla aparte sin nav, y así no compite con nav-route. */
const SUMMARY_HASH = '#/resumen';

/** Grace period between tapping TodayPanel's check button and the mark-paid mutation firing. */
const CONFIRM_MARK_PAID_MS = 4000;

function PageFallback() {
  return (
    <div className="skeleton-list" aria-busy="true" aria-label="Cargando">
      <div className="skeleton-card" />
      <div className="skeleton-card" />
    </div>
  );
}

const PAGE_TITLES: Record<NavPage, string> = {
  home: 'Inicio',
  add: 'Registrar pago',
  calendar: 'Calendario',
  settings: 'Ajustes',
};

function applySearchSort(list: Subscription[], filter: BillFilter, query: string, sort: SortMode) {
  let result = [...list];
  if (filter === 'recurring') result = result.filter((s) => s.frequency !== 'once');
  if (filter === 'once') result = result.filter((s) => s.frequency === 'once');
  if (filter === 'due-soon') {
    result = result.filter((s) => {
      const d = daysUntilNextDue(s);
      return d != null && d >= 0 && d <= 7;
    });
  }
  const q = query.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.category?.toLowerCase().includes(q) ?? false) ||
        (s.notes?.toLowerCase().includes(q) ?? false)
    );
  }
  switch (sort) {
    case 'amount-desc':
      return result.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':
      return result.sort((a, b) => a.amount - b.amount);
    case 'name':
      return result.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    case 'due':
    default:
      return result.sort(sortByNextDue);
  }
}

function Dashboard() {
  const { user, logout } = useAuth();
  const {
    subscriptions,
    archived,
    trashed,
    payments,
    loading,
    online,
    error,
    pendingCount,
    add,
    addMany,
    remove,
    update,
    markPaid,
    snooze,
    clearSnooze,
    restore,
    restoreArchived,
    restoreTrashed,
    restoreFromTrash,
    deletePayment,
    clearHistory,
  } = useSubscriptions(true);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [page, setPage] = useState<NavPage>(() => readNavPageFromLocation());
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [sharePrefill, setSharePrefill] = useState<{ name?: string; amount?: number } | null>(null);
  const [filter, setFilter] = useState<BillFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>(() => loadSortMode());
  const [listLayout, setListLayout] = useState<ListLayout>(() => loadListLayout());
  const [budgetLimit, setBudgetLimit] = useState<number | null>(null);
  const [userTimezone, setUserTimezone] = useState(NOTIFY_TIMEZONE);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [editSub, setEditSub] = useState<Subscription | null>(null);
  const [markPaidSub, setMarkPaidSub] = useState<Subscription | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const isPhone = useMediaQuery('(max-width: 767px)');
  const showCategoryBoard = listLayout === 'category';

  /**
   * Pending "mark paid" confirmations from TodayPanel's check button, keyed by
   * subscription id. Lives here (not inside TodayPanel/ActionRow) so the grace
   * period survives navigating to another tab and back — only the visible
   * section unmounts, not this state.
   */
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set());
  const confirmTimers = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; updatedAt: string }>()
  );

  useEffect(() => {
    const timers = confirmTimers.current;
    return () => {
      for (const { timer } of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  // El click sintético que el navegador dispara tras un gesto táctil puede
  // aterrizar sobre cualquier elemento bajo el dedo, incluidos modales que se
  // acaban de montar (ConfirmActionModal no es descendiente de la card, así
  // que un onClickCapture puesto ahí no lo vería) — se filtra a nivel document.
  useEffect(() => {
    const guard = (e: MouseEvent) => {
      if (isClickSuppressed()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('click', guard, true);
    return () => document.removeEventListener('click', guard, true);
  }, []);

  // Once a confirmed sub actually leaves the overdue/today set (mutation
  // resolved and data refetched, or it was deleted), drop its stale id so a
  // future recurrence of the same subscription doesn't render pre-checked.
  // Also cancel a still-pending timer if another actor (a different device,
  // a background sync) already resolved this subscription while we were
  // waiting — otherwise our own timer would fire later and mark it paid a
  // second time.
  useEffect(() => {
    const byId = new Map(subscriptions.map((s) => [s.id, s]));
    for (const [id, entry] of confirmTimers.current) {
      const current = byId.get(id);
      if (!current || current.updated_at !== entry.updatedAt) {
        clearTimeout(entry.timer);
        confirmTimers.current.delete(id);
      }
    }

    setConfirmingIds((prev) => {
      if (prev.size === 0) return prev;
      const stillDue = new Set(
        subscriptions.filter((s) => (daysUntilNextDue(s) ?? 1) <= 0).map((s) => s.id)
      );
      const pending = new Set(confirmTimers.current.keys());
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (pending.has(id) || stillDue.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [subscriptions]);

  const startConfirmMarkPaid = (sub: Subscription) => {
    // Clear a leftover timer from a prior tap on this same row first — two
    // timers racing for the same id is what causes markPaid to fire twice.
    const existing = confirmTimers.current.get(sub.id);
    if (existing) clearTimeout(existing.timer);

    setConfirmingIds((prev) => new Set(prev).add(sub.id));
    const timer = setTimeout(() => {
      // Leave the id "confirmed" — it naturally drops out of confirmingIds
      // once the row itself disappears from `subscriptions` below, rather
      // than flashing back to the unchecked state while the mutation is
      // still in flight.
      confirmTimers.current.delete(sub.id);
      requestMarkPaid(sub);
    }, CONFIRM_MARK_PAID_MS);
    confirmTimers.current.set(sub.id, { timer, updatedAt: sub.updated_at });
  };

  const cancelConfirmMarkPaid = (subId: string) => {
    const entry = confirmTimers.current.get(subId);
    if (entry) {
      clearTimeout(entry.timer);
      confirmTimers.current.delete(subId);
    }
    setConfirmingIds((prev) => {
      if (!prev.has(subId)) return prev;
      const next = new Set(prev);
      next.delete(subId);
      return next;
    });
  };

  const navigate = (next: NavPage) => {
    setPage(next);
    writeNavPageToLocation(next);
  };

  // Fase 7a: `#/resumen` vive acá y no en AppRoutes porque necesita las mismas
  // suscripciones/pagos que ya trae useSubscriptions — sacarlo afuera
  // duplicaría el hook y con él las peticiones.
  const [showSummary, setShowSummary] = useState(() => {
    if (window.location.hash === SUMMARY_HASH) return true;
    // Arranque configurable: solo aplica si no venías a una pestaña concreta,
    // para no pisar un enlace compartido tipo `?p=calendar`.
    return loadStartScreen() === 'summary' && !window.location.search.includes('p=');
  });

  useEffect(() => {
    const onHashChange = () => setShowSummary(window.location.hash === SUMMARY_HASH);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const exitSummary = () => {
    setShowSummary(false);
    if (window.location.hash === SUMMARY_HASH) {
      const url = new URL(window.location.href);
      url.hash = '';
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
    }
  };

  useEffect(() => {
    const onPopState = () => setPage(readNavPageFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Deep-link a la hoja de una suscripción (?open=<id>) — lo arma sw-push.js
  // como fallback cuando el dispositivo no soporta `actions` en la
  // notificación (Fase 6b): sin botones, tocar el cuerpo debe abrir directo
  // el detalle, no Inicio. Se limpia el parámetro tras usarlo, mismo
  // criterio que writeNavPageToLocation, para que un refresh no reabra el modal.
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(window.location.search);
    const openId = params.get('open');
    if (!openId) return;

    const target = subscriptions.find((s) => s.id === openId);
    if (target) setEditSub(target);

    params.delete('open');
    const search = params.toString();
    const next = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', next);
  }, [subscriptions, loading]);

  // Texto compartido desde otra app (share_target, Fase 7b) — mismo patrón de
  // "leer el param, actuar, limpiarlo" que el ?open= de arriba. El parseo
  // corre acá, en el cliente, y no en el Worker: así se reusa
  // parseRemindersImport tal cual, sin duplicarlo en worker/src/.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('share')) return;

    const shared = [params.get('title'), params.get('text'), params.get('url')]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (shared) {
      // Solo la primera fila: compartir es un gesto de una captura, no una
      // importación masiva — para eso ya está ImportRemindersPanel.
      const first = parseRemindersImport(shared)[0];
      // Deliberadamente NO se mira `first.confidence`: ese campo es
      // date-driven (sin fecha parseada siempre da 'low', ver
      // import-reminders.ts), y un gasto compartido nunca trae fecha — es de
      // hoy. Usarlo acá descartaría el monto incluso cuando se leyó bien.
      const weak = !first || first.amount <= 0;

      // Parseo débil: se conserva el texto crudo como nombre y el monto queda
      // vacío para que el usuario lo complete. Nunca se descarta lo
      // compartido — perder el texto es el único desenlace inaceptable.
      setSharePrefill(weak ? { name: shared } : { name: first.name, amount: first.amount });
      setQuickAddOpen(true);
    }

    params.delete('share');
    params.delete('title');
    params.delete('text');
    params.delete('url');
    const search = params.toString();
    const next = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', next);
  }, []);

  useEffect(() => {
    void fetchSettings()
      .then((s) => {
        setBudgetLimit(s.budget_limit);
        setUserTimezone(s.timezone);
        setDisplayName(s.display_name);
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(
    () => applySearchSort(subscriptions, filter, query, sort),
    [subscriptions, filter, query, sort]
  );

  /** Overdue/today appear in TodayPanel — keep them out of the main list. */
  const listForMain = useMemo(
    () =>
      filtered.filter((s) => {
        const d = daysUntilNextDue(s);
        return d == null || d > 0;
      }),
    [filtered]
  );

  const handleSortChange = (next: SortMode) => {
    setSort(next);
    saveSortMode(next);
  };

  const handleLayoutChange = (next: ListLayout) => {
    setListLayout(next);
    saveListLayout(next);
  };

  const currencyTotals = useMemo(() => computeTotalsByCurrency(subscriptions), [subscriptions]);

  const dueSoonCount = subscriptions.filter((s) => {
    const d = daysUntilNextDue(s);
    return d != null && d >= 0 && d <= 7;
  }).length;

  const duplicateSub = (sub: Subscription) => {
    void add({
      name: `${sub.name} (copia)`,
      amount: sub.amount,
      currency: sub.currency,
      frequency: sub.frequency,
      due_day: sub.due_day,
      due_date: sub.due_date ?? undefined,
      due_dates: sub.due_dates ? parseDueDates(sub) : undefined,
      category: sub.category ?? undefined,
      notes: sub.notes ?? undefined,
      notify_days_before: sub.notify_days_before,
      notify_hour: sub.notify_hour,
    });
    showToast('Pago duplicado — ajusta la fecha si hace falta');
  };

  const quickMarkPaid = (sub: Subscription) => {
    void markPaid(sub.id, {
      amount: currentDueAmount(sub),
      paid_at: localIsoDate(),
    });
    showToast(`${sub.name} marcado como pagado`);
  };

  const markAllPaid = async (subs: Subscription[]) => {
    const today = localIsoDate();
    for (const sub of subs) {
      // Cancel right before processing this one (not in an upfront pass) so
      // a checkmark tapped on a not-yet-processed row — which starts a
      // fresh grace-period timer — never survives past its own turn here.
      cancelConfirmMarkPaid(sub.id);
      await markPaid(sub.id, {
        amount: currentDueAmount(sub),
        paid_at: today,
      });
    }
    showToast(`${subs.length} pagos registrados`);
  };

  const requestMarkPaidDetailed = (sub: Subscription) => {
    setMarkPaidSub(sub);
  };

  const requestMarkPaid = (sub: Subscription) => {
    // Direct mark — no confirmation modal. User can see the effect immediately
    // and undo via the toast if they tapped by mistake.
    const backup = { ...sub };
    quickMarkPaid(sub);
    // Override the toast with an Undo option
    showToast(`${sub.name} marcado como pagado`, {
      label: 'Deshacer',
      onClick: () => void restore(backup),
    });
  };

  const requestMarkAllPaid = (subs: Subscription[]) => {
    if (subs.length === 0) return;
    setConfirmAction({ type: 'mark-all', subscriptions: subs });
  };

  const requestDelete = (id: string) => {
    const sub = subscriptions.find((s) => s.id === id);
    if (sub) setConfirmAction({ type: 'delete', subscription: sub });
  };

  const handleConfirmAction = () => {
    if (!confirmAction) return;
    switch (confirmAction.type) {
      case 'delete':
        handleDelete(confirmAction.subscription.id);
        break;
      case 'mark-all':
        void markAllPaid(confirmAction.subscriptions);
        break;
      default: {
        const _exhaustive: never = confirmAction;
        void _exhaustive;
      }
    }
  };

  const handleDelete = (id: string) => {
    const backup = subscriptions.find((s) => s.id === id);
    void remove(id);
    if (backup) {
      showToast(
        'Pago eliminado',
        {
          label: 'Deshacer',
          onClick: () => void restoreTrashed(backup),
        },
        12000
      );
    }
  };

  const handleMarkPaid = (input: MarkPaidInput) => {
    if (!markPaidSub) return;
    void markPaid(markPaidSub.id, input);
    setMarkPaidSub(null);
  };

  const heroLines = Object.entries(currencyTotals);

  if (!onboardingDismissed && !loading && subscriptions.length === 0 && shouldOfferOnboarding()) {
    return (
      <PostLoginOnboarding onCreateMany={addMany} onDismiss={() => setOnboardingDismissed(true)} />
    );
  }

  // Va después del onboarding: sin suscripciones no hay resumen que mostrar,
  // y arrancar en una tarjeta vacía sería peor que el alta guiada.
  if (showSummary) {
    return (
      <Suspense fallback={<PageFallback />}>
        <SummaryScreen
          subscriptions={subscriptions}
          payments={payments}
          budgetLimit={budgetLimit}
          onExit={exitSummary}
        />
      </Suspense>
    );
  }

  return (
    <AppLayout
      page={page}
      onNavigate={navigate}
      email={user?.email ?? ''}
      displayName={displayName}
      online={online}
      pendingCount={pendingCount}
      title={PAGE_TITLES[page]}
      contentClassName={
        isPhone
          ? 'layout-content-phone'
          : listLayout === 'category'
            ? 'layout-content-board'
            : undefined
      }
    >
      <ToastHost />
      {error && <p className="banner error">{error}</p>}

      {page === 'home' && (
        <div className={isPhone ? 'home-stack home-stack-phone' : 'home-stack'}>
          <section className={`hero-card hero-card-compact${isPhone ? ' hero-card-phone' : ''}`}>
            <div className="hero-glow" aria-hidden />
            <div className="hero-head">
              <div className="hero-head-main">
                <p className="hero-label">Gasto mensual est.</p>
                {heroLines.length === 0 ? (
                  <p className="hero-value">—</p>
                ) : (
                  <div className="hero-totals">
                    {heroLines.map(([cur, t]) => (
                      <div key={cur} className="hero-total-row">
                        <span className="hero-value hero-value-inline">
                          {formatCurrency(t.monthly, cur)}
                        </span>
                        {heroLines.length > 1 && <span className="hero-currency-tag">{cur}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="hero-meta">
                {subscriptions.length} activos
                {dueSoonCount > 0 && ` · ${dueSoonCount} en 7 días`}
                {pendingCount > 0 && ` · ${pendingCount} pendiente sync`}
              </p>
            </div>
            <SpendingOverview
              subscriptions={subscriptions}
              payments={payments}
              budgetLimit={budgetLimit}
              hideCurrencySummary
            />
          </section>

          <div className="home-today">
            <TodayPanel
              subscriptions={subscriptions}
              payments={payments}
              budgetLimit={budgetLimit}
              confirmingIds={confirmingIds}
              onStartConfirm={startConfirmMarkPaid}
              onCancelConfirm={cancelConfirmMarkPaid}
              onMarkPaidDetailed={requestMarkPaidDetailed}
              onMarkAllPaid={requestMarkAllPaid}
              onEdit={setEditSub}
            />
          </div>

          <div className="home-filters">
            <SearchSortBar
              query={query}
              sort={sort}
              filterSlot={<BillFilterBar value={filter} onChange={setFilter} />}
              onQueryChange={setQuery}
              onSortChange={handleSortChange}
            />
          </div>

          <div className="home-list">
            <div className="section-head section-head-inline">
              <h2 className="section-title">
                {filter === 'due-soon'
                  ? 'Próximos pagos'
                  : showCategoryBoard
                    ? 'Por categoría'
                    : 'Todos tus pagos'}
              </h2>
              <div className="section-head-actions">
                <div className="layout-toggle" role="group" aria-label="Vista de lista">
                  <button
                    type="button"
                    className={`layout-toggle-btn ${listLayout === 'flat' ? 'active' : ''}`}
                    onClick={() => handleLayoutChange('flat')}
                  >
                    Lista
                  </button>
                  <button
                    type="button"
                    className={`layout-toggle-btn ${listLayout === 'category' ? 'active' : ''}`}
                    onClick={() => handleLayoutChange('category')}
                  >
                    Columnas
                  </button>
                </div>
                <button type="button" className="btn-text" onClick={() => navigate('add')}>
                  + Registrar
                </button>
              </div>
            </div>

            <section className={showCategoryBoard ? 'list list-category-board' : `list list-dense`}>
              {loading ? (
                <div className="skeleton-list" aria-busy="true" aria-label="Cargando">
                  <div className="skeleton-card" />
                  <div className="skeleton-card" />
                </div>
              ) : listForMain.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon" aria-hidden>
                    <NavIcon name="add" className="empty-icon-svg" />
                  </div>
                  <p className="empty-title">
                    {filter === 'all' && !query
                      ? subscriptions.length > 0
                        ? 'Nada más pendiente'
                        : 'Sin pagos registrados'
                      : 'Nada en este filtro'}
                  </p>
                  {subscriptions.length === 0 && (
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() => navigate('add')}
                    >
                      Registrar
                    </button>
                  )}
                </div>
              ) : showCategoryBoard ? (
                <SubscriptionListGrouped
                  subscriptions={listForMain}
                  stacked={isPhone}
                  onMarkPaid={(id) => {
                    const s = subscriptions.find((x) => x.id === id);
                    if (s) requestMarkPaid(s);
                  }}
                  onMarkPaidDetailed={(sub) => requestMarkPaidDetailed(sub)}
                  onEdit={setEditSub}
                  onSnooze={(id, days) => void snooze(id, days)}
                  onClearSnooze={(id) => void clearSnooze(id)}
                  onDuplicate={duplicateSub}
                />
              ) : (
                listForMain.map((sub) => (
                  <SubscriptionCard
                    key={sub.id}
                    subscription={sub}
                    onMarkPaid={(id) => {
                      const s = subscriptions.find((x) => x.id === id);
                      if (s) requestMarkPaid(s);
                    }}
                    onMarkPaidDetailed={requestMarkPaidDetailed}
                    onEdit={setEditSub}
                    onSnooze={(id, days) => void snooze(id, days)}
                    onClearSnooze={(id) => void clearSnooze(id)}
                    onDuplicate={duplicateSub}
                  />
                ))
              )}
            </section>
          </div>

          <button
            type="button"
            className="fab-quick-add"
            aria-label="Registro rápido"
            title="Registro rápido"
            onClick={() => setQuickAddOpen(true)}
          >
            +
          </button>
          <Suspense fallback={null}>
            <QuickAddSheet
              subscriptions={subscriptions}
              open={quickAddOpen}
              prefill={sharePrefill}
              onClose={() => {
                setQuickAddOpen(false);
                setSharePrefill(null);
              }}
              onSubmit={async (input) => {
                await add(input);
                showToast(`${input.name} registrado`);
              }}
            />
          </Suspense>
        </div>
      )}

      {page === 'add' && (
        <Suspense fallback={<PageFallback />}>
          <AddSubscriptionForm
            onSubmit={add}
            onImportMany={addMany}
            subscriptions={subscriptions}
            payments={payments}
            archived={archived}
            onRestoreArchived={async (id) => {
              const name = await restoreArchived(id);
              if (name) showToast(`${name} restaurado en tus pagos activos`);
            }}
            onDeletePayment={deletePayment}
            onClearHistory={clearHistory}
            online={online}
            timezone={userTimezone}
          />
        </Suspense>
      )}

      {page === 'calendar' && (
        <Suspense fallback={<PageFallback />}>
          <CalendarSync />
          <CaptureSetup />
        </Suspense>
      )}

      {page === 'settings' && (
        <Suspense fallback={<PageFallback />}>
          <SettingsPanel
            email={user?.email ?? ''}
            onLogout={() => void logout()}
            onSettingsChange={(s) => {
              setBudgetLimit(s.budget_limit);
              setUserTimezone(s.timezone);
              setDisplayName(s.display_name);
            }}
            trashed={trashed}
            onRestoreTrashed={async (id) => {
              const name = await restoreFromTrash(id);
              if (name) showToast(`${name} restaurado en tus pagos activos`);
            }}
          />
        </Suspense>
      )}

      {confirmAction && (
        <ConfirmActionModal
          action={confirmAction}
          onConfirm={handleConfirmAction}
          onClose={() => setConfirmAction(null)}
        />
      )}

      {editSub && (
        <Suspense fallback={null}>
          <EditSubscriptionModal
            subscription={editSub}
            onSubmit={(input) => update(editSub.id, input)}
            onClose={() => setEditSub(null)}
            onDelete={requestDelete}
            timezone={userTimezone}
          />
        </Suspense>
      )}

      {markPaidSub && (
        <Suspense fallback={null}>
          <MarkPaidModal
            subscription={markPaidSub}
            onConfirm={handleMarkPaid}
            onClose={() => setMarkPaidSub(null)}
          />
        </Suspense>
      )}

      <nav className="bottom-nav" aria-label="Navegación rápida">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`bottom-nav-item ${page === item.id ? 'active' : ''}`}
            onClick={() => navigate(item.id)}
          >
            <span className="bottom-nav-icon-wrap">
              <NavIcon name={item.icon} />
            </span>
            <span className="bottom-nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </AppLayout>
  );
}

function AppRoutes() {
  useTheme();
  const { user, loading } = useAuth();
  const [route, setRoute] = useState(() => window.location.pathname);

  useEffect(() => {
    const syncRoute = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  if (route === '/auth/verify') {
    return (
      <div className="auth-shell">
        <Suspense
          fallback={
            <div className="auth-card auth-card-brand">
              <p className="auth-loading-text">Cargando…</p>
            </div>
          }
        >
          <VerifyPage onComplete={() => setRoute('/')} />
        </Suspense>
      </div>
    );
  }

  if (loading && !user) {
    return (
      <div className="auth-shell">
        <div className="auth-card auth-card-brand">
          <div className="brand-mark brand-mark-lg" aria-hidden>
            <BrandMark className="brand-icon" />
          </div>
          <p className="auth-loading-text">Cargando sesión…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-shell">
        <LoginForm />
      </div>
    );
  }

  return (
    <PostLoginPushOffer>
      <PostLoginPasskeyOffer>
        <Dashboard />
      </PostLoginPasskeyOffer>
    </PostLoginPushOffer>
  );
}

function App() {
  return (
    <AuthProvider>
      <UpdatePrompt />
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
