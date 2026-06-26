import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AppLayout } from "./components/AppLayout";
import { BillFilterBar } from "./components/BillFilterBar";
import { LoginForm } from "./components/LoginForm";
import { PaymentHistory } from "./components/PaymentHistory";
import { SearchSortBar } from "./components/SearchSortBar";
import { SpendingOverview } from "./components/SpendingOverview";
import { SubscriptionCard } from "./components/SubscriptionCard";
import { TodayPanel } from "./components/TodayPanel";
import { NavIcon } from "./components/NavIcon";
import { ToastHost, showToast } from "./components/Toast";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { useSubscriptions } from "./hooks/useSubscriptions";
import { fetchSettings } from "./lib/api";
import { daysUntilNextDue, sortByNextDue } from "./lib/due-dates";
import { computeAnnualTotal, computeMonthlyTotal } from "./lib/spending-stats";
import { NAV_ITEMS, type NavPage } from "./types/nav";
import type { BillFilter, MarkPaidInput, SortMode, Subscription } from "./types/subscription";
import "./App.css";

const AddSubscriptionForm = lazy(() =>
  import("./components/AddSubscriptionForm").then((m) => ({ default: m.AddSubscriptionForm })),
);
const CalendarSync = lazy(() =>
  import("./components/CalendarSync").then((m) => ({ default: m.CalendarSync })),
);
const SettingsPanel = lazy(() =>
  import("./components/SettingsPanel").then((m) => ({ default: m.SettingsPanel })),
);
const EditSubscriptionModal = lazy(() =>
  import("./components/EditSubscriptionModal").then((m) => ({ default: m.EditSubscriptionModal })),
);
const MarkPaidModal = lazy(() =>
  import("./components/MarkPaidModal").then((m) => ({ default: m.MarkPaidModal })),
);
const VerifyPage = lazy(() =>
  import("./pages/VerifyPage").then((m) => ({ default: m.VerifyPage })),
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
  home: "Inicio",
  add: "Registrar pago",
  calendar: "Calendario",
  settings: "Ajustes",
};

function applySearchSort(
  list: Subscription[],
  filter: BillFilter,
  query: string,
  sort: SortMode,
) {
  let result = [...list];
  if (filter === "recurring") result = result.filter((s) => s.frequency !== "once");
  if (filter === "once") result = result.filter((s) => s.frequency === "once");
  if (filter === "due-soon") {
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
        (s.notes?.toLowerCase().includes(q) ?? false),
    );
  }
  switch (sort) {
    case "amount-desc":
      return result.sort((a, b) => b.amount - a.amount);
    case "amount-asc":
      return result.sort((a, b) => a.amount - b.amount);
    case "name":
      return result.sort((a, b) => a.name.localeCompare(b.name, "es"));
    case "due":
    default:
      return result.sort(sortByNextDue);
  }
}

function Dashboard() {
  const { user, logout } = useAuth();
  const {
    subscriptions,
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
    restore,
  } = useSubscriptions(true);
  const [page, setPage] = useState<NavPage>("home");
  const [filter, setFilter] = useState<BillFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("due");
  const [budgetLimit, setBudgetLimit] = useState<number | null>(null);
  const [editSub, setEditSub] = useState<Subscription | null>(null);
  const [markPaidSub, setMarkPaidSub] = useState<Subscription | null>(null);

  useEffect(() => {
    void fetchSettings()
      .then((s) => setBudgetLimit(s.budget_limit))
      .catch(() => {});
  }, []);

  const filtered = useMemo(
    () => applySearchSort(subscriptions, filter, query, sort),
    [subscriptions, filter, query, sort],
  );

  const totalMonthly = computeMonthlyTotal(subscriptions);
  const totalAnnual = computeAnnualTotal(subscriptions);

  const dueSoonCount = subscriptions.filter((s) => {
    const d = daysUntilNextDue(s);
    return d != null && d >= 0 && d <= 7;
  }).length;

  const formattedTotal = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(totalMonthly);

  const formattedAnnual = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(totalAnnual);

  const quickMarkPaid = (sub: Subscription) => {
    void markPaid(sub.id, {
      amount: sub.amount,
      paid_at: new Date().toISOString().slice(0, 10),
    });
    showToast(`${sub.name} marcado como pagado`);
  };

  const markAllPaid = (subs: Subscription[]) => {
    for (const sub of subs) {
      void markPaid(sub.id, {
        amount: sub.amount,
        paid_at: new Date().toISOString().slice(0, 10),
      });
    }
    showToast(`${subs.length} pagos registrados`);
  };

  const handleDelete = (id: string) => {
    const backup = subscriptions.find((s) => s.id === id);
    void remove(id);
    if (backup) {
      showToast("Pago eliminado", {
        label: "Deshacer",
        onClick: () => void restore(backup),
      });
    }
  };

  const handleMarkPaid = (input: MarkPaidInput) => {
    if (!markPaidSub) return;
    void markPaid(markPaidSub.id, input);
    setMarkPaidSub(null);
  };

  return (
    <AppLayout
      page={page}
      onNavigate={setPage}
      email={user?.email ?? ""}
      online={online}
      pendingCount={pendingCount}
      title={PAGE_TITLES[page]}
    >
      <ToastHost />
      {error && <p className="banner error">{error}</p>}

      {page === "home" && (
        <>
          <section className="hero-card hero-card-compact">
            <div className="hero-glow" aria-hidden />
            <div className="hero-row">
              <div>
                <p className="hero-label">Gasto mensual est.</p>
                <p className="hero-value">{formattedTotal}</p>
                <p className="hero-annual">{formattedAnnual}/año est.</p>
              </div>
              <div className="hero-stats">
                <span className="stat-chip">{subscriptions.length} activos</span>
                {dueSoonCount > 0 && (
                  <span className="stat-chip stat-chip-warn">{dueSoonCount} en 7d</span>
                )}
                {pendingCount > 0 && (
                  <span className="stat-chip stat-chip-warn">{pendingCount} sync</span>
                )}
              </div>
            </div>
            <SpendingOverview subscriptions={subscriptions} budgetLimit={budgetLimit} />
          </section>

          <TodayPanel
            subscriptions={subscriptions}
            onMarkPaid={quickMarkPaid}
            onMarkAllPaid={markAllPaid}
            onMarkPaidDetail={setMarkPaidSub}
          />

          <BillFilterBar value={filter} onChange={setFilter} />
          <SearchSortBar query={query} sort={sort} onQueryChange={setQuery} onSortChange={setSort} />

          <div className="section-head section-head-inline">
            <h2 className="section-title">
              {filter === "due-soon" ? "Próximos pagos" : "Todos tus pagos"}
            </h2>
            <button type="button" className="btn-text" onClick={() => setPage("add")}>
              + Registrar
            </button>
          </div>

          <section className="list">
            {loading ? (
              <div className="skeleton-list" aria-busy="true" aria-label="Cargando">
                <div className="skeleton-card" />
                <div className="skeleton-card" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon" aria-hidden>
                  <NavIcon name="add" className="empty-icon-svg" />
                </div>
                <p className="empty-title">
                  {filter === "all" && !query ? "Sin pagos registrados" : "Nada en este filtro"}
                </p>
                <button type="button" className="btn-primary btn-sm" onClick={() => setPage("add")}>
                  Registrar
                </button>
              </div>
            ) : (
              filtered.map((sub) => (
                <SubscriptionCard
                  key={sub.id}
                  subscription={sub}
                  onDelete={handleDelete}
                  onMarkPaid={(id) => {
                    const s = subscriptions.find((x) => x.id === id);
                    if (s) quickMarkPaid(s);
                  }}
                  onEdit={setEditSub}
                  onSnooze={(id) => void snooze(id)}
                />
              ))
            )}
          </section>

          <PaymentHistory payments={payments} />
        </>
      )}

      {page === "add" && (
        <Suspense fallback={<PageFallback />}>
          <AddSubscriptionForm
            onSubmit={add}
            onImportMany={addMany}
            subscriptions={subscriptions}
            defaultOpen
          />
        </Suspense>
      )}

      {page === "calendar" && (
        <Suspense fallback={<PageFallback />}>
          <CalendarSync />
        </Suspense>
      )}

      {page === "settings" && (
        <Suspense fallback={<PageFallback />}>
          <SettingsPanel
            email={user?.email ?? ""}
            onLogout={() => void logout()}
            onSettingsChange={(s) => setBudgetLimit(s.budget_limit)}
            onImportMany={addMany}
          />
        </Suspense>
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
            className={`bottom-nav-item ${page === item.id ? "active" : ""}`}
            onClick={() => setPage(item.id)}
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
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  if (route === "/auth/verify") {
    return (
      <div className="auth-shell">
        <Suspense
          fallback={
            <div className="auth-card auth-card-brand">
              <p className="auth-loading-text">Cargando…</p>
            </div>
          }
        >
          <VerifyPage onComplete={() => setRoute("/")} />
        </Suspense>
      </div>
    );
  }

  if (loading && !user) {
    return (
      <div className="auth-shell">
        <div className="auth-card auth-card-brand">
          <div className="brand-mark brand-mark-lg" aria-hidden>
            <NavIcon name="home" className="brand-icon" />
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

  return <Dashboard />;
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
