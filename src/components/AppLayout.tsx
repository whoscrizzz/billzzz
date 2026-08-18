import { type ReactNode, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { FloatingCalculator } from './FloatingCalculator';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  loadSidebarCollapsed,
  saveSidebarCollapsed,
  loadAvatarColor,
  loadShowAvatar,
} from '../lib/ui-prefs';
import { CalculatorProvider } from '../contexts/CalculatorContext';
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

function getInitials(name: string | null, email: string): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length >= 2) {
    return (parts[0]![0] + parts[1]![0]).toUpperCase();
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  // Fallback: primera letra del email
  const emailStart = email.split('@')[0];
  return emailStart?.[0]?.toUpperCase() ?? '?';
}

function getUserColor(email: string, customColor: string): string {
  // Si el usuario personalizó el color, usar ese
  if (customColor && customColor !== '') {
    return customColor;
  }

  // Generar color único basado en hash del email
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    const char = email.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convertir a 32-bit integer
  }

  // Palette de colores accesibles y vivos
  const colors = [
    '#FF6B6B', // Rojo
    '#FF9F3D', // Naranja
    '#FFD93D', // Amarillo
    '#6BCB77', // Verde
    '#4D96FF', // Azul
    '#9D84B7', // Púrpura
    '#FF6B9D', // Rosa
    '#00D9FF', // Cian
    '#FFB703', // Ámbar
    '#FB5607', // Rojo naranja
  ];

  return colors[Math.abs(hash) % colors.length]!;
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
  const [avatarColor, setAvatarColor] = useState(() => loadAvatarColor());
  const [showAvatar, setShowAvatar] = useState(() => loadShowAvatar());

  useEffect(() => {
    setAvatarColor(loadAvatarColor());
    setShowAvatar(loadShowAvatar());
  }, []);

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
              <p className="topbar-eyebrow">Billzzz</p>
              <h1 className="topbar-title">{title}</h1>
            </div>
            <span className="topbar-status">
              {!isDesktop && pendingCount > 0 && (
                <span className="topbar-pending" title={`${pendingCount} pendiente(s) de sync`}>
                  {pendingCount}
                </span>
              )}
              {!isDesktop && showAvatar && (
                <span
                  className={`topbar-avatar ${online ? 'online' : 'offline'}`}
                  title={online ? 'En línea' : 'Sin conexión'}
                  style={{ backgroundColor: getUserColor(email, avatarColor) }}
                >
                  {getInitials(displayName, email)}
                </span>
              )}
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
