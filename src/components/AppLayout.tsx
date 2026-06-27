import { type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { useMediaQuery } from "../hooks/useMediaQuery";
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
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <div className="layout">
      {isDesktop && (
        <Sidebar
          page={page}
          onNavigate={onNavigate}
          email={email}
          online={online}
          pendingCount={pendingCount}
          open={true}
          onClose={() => {}}
        />
      )}

      <div className="layout-main">
        <header className="topbar">
          <div className="topbar-center topbar-center-full">
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
