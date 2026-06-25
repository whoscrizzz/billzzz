import { useEffect, useState, type ReactNode } from "react";
import { NavIcon } from "./NavIcon";
import { Sidebar } from "./Sidebar";
import { useSidebarSwipe } from "../hooks/useSidebarSwipe";
import type { NavPage } from "../types/nav";

interface AppLayoutProps {
  page: NavPage;
  onNavigate: (page: NavPage) => void;
  email: string;
  online: boolean;
  pendingCount: number;
  title: string;
  children: ReactNode;
}

export function AppLayout({
  page,
  onNavigate,
  email,
  online,
  pendingCount,
  title,
  children,
}: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openSidebar = () => setSidebarOpen(true);
  const closeSidebar = () => setSidebarOpen(false);

  const swipe = useSidebarSwipe(sidebarOpen, openSidebar, closeSidebar);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  useEffect(() => {
    document.body.classList.toggle("sidebar-open", sidebarOpen);
    return () => document.body.classList.remove("sidebar-open");
  }, [sidebarOpen]);

  return (
    <div className="layout">
      <Sidebar
        page={page}
        onNavigate={onNavigate}
        email={email}
        online={online}
        pendingCount={pendingCount}
        open={sidebarOpen}
        dragging={swipe.dragging}
        panelStyle={swipe.panelStyle}
        onClose={closeSidebar}
        onPanelTouchStart={swipe.panelTouchStart}
        onPanelTouchMove={swipe.panelTouchMove}
        onPanelTouchEnd={swipe.panelTouchEnd}
      />

      <div
        className="layout-main"
        onTouchStart={swipe.mainTouchStart}
        onTouchMove={swipe.mainTouchMove}
        onTouchEnd={swipe.mainTouchEnd}
      >
        <header className="topbar">
          <button
            type="button"
            className="menu-btn"
            onClick={openSidebar}
            aria-label="Abrir menú"
            aria-expanded={sidebarOpen}
          >
            <NavIcon name="menu" className="menu-icon" />
          </button>
          <div className="topbar-center">
            <p className="topbar-eyebrow">Bills</p>
            <h1 className="topbar-title">{title}</h1>
          </div>
          <span
            className={`topbar-status ${online ? "online" : "offline"}`}
            title={online ? "En línea" : "Sin conexión"}
          >
            <span className={`status-dot ${online ? "online" : "offline"}`} />
          </span>
        </header>

        <main className="layout-content">{children}</main>
      </div>
    </div>
  );
}
