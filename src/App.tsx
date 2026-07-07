import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
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
import { daysUntilNextDue, sortByNextDue } from './lib/due-dates';
import { localIsoDate } from './lib/local-date';
import { loadListLayout, loadSortMode, saveListLayout, saveSortMode } from './lib/ui-prefs';
import { computeTotalsByCurrency } from './lib/spending-stats';
import { parseDueDates } from './lib/due-dates-json';
import { readNavPageFromLocation, writeNavPageToLocation } from './lib/nav-route';
import { NAV_ITEMS, type NavPage } from './types/nav';
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
  } = useSubscriptions(true);
  const [page, setPage] = useState<NavPage>(() => readNavPageFromLocation());
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [filter, setFilter] = useState<BillFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>(() => loadSortMode());
  const [listLayout, setListLayout] = useState<ListLayout>(() => loadListLayout());
  const [budgetLimit, setBudgetLimit] = useState<number | null>(null);
  const [editSub, setEditSub] = useState<Subscription | null>(null);
  const [markPaidSub, setMarkPaidSub] = useState<Subscription | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const isPhone = useMediaQuery('(max-width: 767px)');
  const showCategoryBoard = listLayout === 'category';

  const navigate = (next: NavPage) => {
    setPage(next);
    writeNavPageToLocation(next);
  };

  useEffect(() => {
    const onPopState = () => setPage(readNavPageFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    void fetchSettings()
      .then((s) => setBudgetLimit(s.budget_limit))
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

  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);

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
      amount: sub.amount,
      paid_at: localIsoDate(),
    });
    showToast(`${sub.name} marcado como pagado`);
  };

  const markAllPaid = async (subs: Subscription[]) => {
    const today = localIsoDate();
    for (const sub of subs) {
      await markPaid(sub.id, {
        amount: sub.amount,
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
      showToast('Pago eliminado', {
        label: 'Deshacer',
        onClick: () => void restore(backup),
      });
    }
  };

  const handleMarkPaid = (input: MarkPaidInput) => {
    if (!markPaidSub) return;
    void markPaid(markPaidSub.id, input);
    setMarkPaidSub(null);
  };

  const heroLines = Object.entries(currencyTotals);

  return (
    <AppLayout
      page={page}
      onNavigate={navigate}
      email={user?.email ?? ''}
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
              budgetLimit={budgetLimit}
              hideCurrencySummary
            />
          </section>

          <div className="home-today">
            <TodayPanel
              subscriptions={subscriptions}
              onMarkPaid={requestMarkPaid}
              onMarkPaidDetailed={requestMarkPaidDetailed}
              onMarkAllPaid={requestMarkAllPaid}
              onEdit={setEditSub}
            />
          </div>

          <div className="home-filters">
            <BillFilterBar value={filter} onChange={setFilter} />
            <SearchSortBar
              query={query}
              sort={sort}
              layout={listLayout}
              onQueryChange={setQuery}
              onSortChange={handleSortChange}
              onLayoutChange={handleLayoutChange}
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
              <button type="button" className="btn-text" onClick={() => navigate('add')}>
                + Registrar
              </button>
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
                  onDelete={requestDelete}
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
                    onDelete={requestDelete}
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
              onClose={() => setQuickAddOpen(false)}
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
          />
        </Suspense>
      )}

      {page === 'calendar' && (
        <Suspense fallback={<PageFallback />}>
          <CalendarSync />
        </Suspense>
      )}

      {page === 'settings' && (
        <Suspense fallback={<PageFallback />}>
          <SettingsPanel
            email={user?.email ?? ''}
            onLogout={() => void logout()}
            onSettingsChange={(s) => setBudgetLimit(s.budget_limit)}
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
