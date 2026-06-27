import type { CSSProperties, TouchEvent } from "react";
import { ActionIcon } from "./ActionIcon";
import { NavIcon } from "./NavIcon";
import { NAV_ITEMS, type NavPage } from "../types/nav";

interface SidebarProps {
  page: NavPage;
  onNavigate: (page: NavPage) => void;
  email: string;
  online: boolean;
  pendingCount: number;
  open: boolean;
  dragging?: boolean;
  panelStyle?: CSSProperties;
  onClose: () => void;
  onPanelTouchStart?: (e: TouchEvent) => void;
  onPanelTouchMove?: (e: TouchEvent) => void;
  onPanelTouchEnd?: (e: TouchEvent) => void;
}

export function Sidebar({
  page,
  onNavigate,
  email,
  online,
  pendingCount,
  open,
  dragging = false,
  panelStyle,
  onClose,
  onPanelTouchStart,
  onPanelTouchMove,
  onPanelTouchEnd,
}: SidebarProps) {
  const handleNav = (id: NavPage) => {
    onNavigate(id);
    onClose();
  };

  return (
    <>
      <div
        className={`sidebar-backdrop ${open ? "visible" : ""}`}
        onClick={onClose}
        onKeyDown={(e) => e.key === "Enter" && onClose()}
        role="button"
        tabIndex={open ? 0 : -1}
        aria-label="Cerrar menú"
        aria-hidden={!open}
      />
      <aside
        className={`sidebar ${open ? "open" : ""} ${dragging ? "sidebar-dragging" : ""}`}
        style={panelStyle}
        aria-label="Navegación"
        aria-hidden={false}
        onTouchStart={onPanelTouchStart}
        onTouchMove={onPanelTouchMove}
        onTouchEnd={onPanelTouchEnd}
      >
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden>
            <NavIcon name="home" className="brand-icon" />
          </div>
          <div className="sidebar-brand-text">
            <p className="sidebar-title">Bills</p>
            <p className="sidebar-tagline">Suscripciones</p>
            <p className="sidebar-email">{email}</p>
          </div>
          <button
            type="button"
            className="sidebar-close"
            onClick={onClose}
            aria-label="Cerrar menú"
          >
            <ActionIcon name="close" />
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`sidebar-link ${page === item.id ? "active" : ""}`}
              onClick={() => handleNav(item.id)}
            >
              <span className="sidebar-icon-wrap">
                <NavIcon name={item.icon} />
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className={`status-pill ${online ? "online" : "offline"}`}>
            <span className={`status-dot ${online ? "online" : "offline"}`} />
            {online ? "En línea" : "Sin conexión"}
          </span>
          {pendingCount > 0 && (
            <span className="sidebar-pending">{pendingCount} pendiente(s)</span>
          )}
        </div>
      </aside>
    </>
  );
}
