import { type ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { FloatingCalculator } from './FloatingCalculator';
import { ActionIcon } from './ActionIcon';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { loadSidebarCollapsed, saveSidebarCollapsed } from '../lib/ui-prefs';
import { CalculatorProvider, useCalculator } from '../contexts/CalculatorContext';
import type { NavPage } from '../types/nav';

interface AppLayoutProps {
  page: NavPage;
  onNavigate: (page: NavPage) => void;
  email: string;
  displayName: string | null;
  online: boolean;
  pendingCount: number;
  title: string;
  contentClassName?: string;
  children: ReactNode;
}

function getInitials(name: string | null): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[1]![0]).toUpperCase();
}

function TopbarCalculatorButton() {
  const { openCalculator } = useCalculator();
  return (
    <button
      type="button"
      className="topbar-icon-btn"
      aria-label="Abrir calculadora"
      title="Calculadora"
      onClick={() => openCalculator()}
    >
      <ActionIcon name="calculator" />
    </button>
  );
}

export function AppLayout({
  page,
  onNavigate,
  email,
  displayName,
  online,
  pendingCount,
  title,
  contentClassName,
  children,
}: AppLayoutProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [collapsed, setCollapsed] = useState(() => loadSidebarCollapsed());

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      saveSidebarCollapsed(next);
      return next;
    });
  };

  return (
    <CalculatorProvider>
      <div className={`layout${collapsed ? ' layout-sidebar-collapsed' : ''}`}>
        {isDesktop && (
          <Sidebar
            page={page}
            onNavigate={onNavigate}
            email={email}
            displayName={displayName}
            online={online}
            pendingCount={pendingCount}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
          />
        )}

        <div className="layout-main">
          <header className="topbar">
            <div className="topbar-center topbar-center-full">
              <p className="topbar-eyebrow">Bills</p>
              <h1 className="topbar-title">{title}</h1>
            </div>
            <span className="topbar-status">
              {page === 'home' && <TopbarCalculatorButton />}
              {!isDesktop && pendingCount > 0 && (
                <span className="topbar-pending" title={`${pendingCount} pendiente(s) de sync`}>
                  {pendingCount}
                </span>
              )}
              <span
                className={`topbar-avatar ${online ? 'online' : 'offline'}`}
                title={online ? 'En línea' : 'Sin conexión'}
              >
                {getInitials(displayName)}
              </span>
            </span>
          </header>

          <main className={`layout-content${contentClassName ? ` ${contentClassName}` : ''}`}>
            {children}
          </main>
        </div>

        <FloatingCalculator />
      </div>
    </CalculatorProvider>
  );
}
