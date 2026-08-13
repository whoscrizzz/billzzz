import { ActionIcon } from './ActionIcon';
import { BrandMark } from './BrandMark';
import { NavIcon } from './NavIcon';
import { NAV_ITEMS, type NavPage } from '../types/nav';

interface SidebarProps {
  page: NavPage;
  onNavigate: (page: NavPage) => void;
  email: string;
  displayName: string | null;
  online: boolean;
  pendingCount: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Sidebar({
  page,
  onNavigate,
  email,
  displayName,
  online,
  pendingCount,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  return (
    <aside className={`sidebar open${collapsed ? ' collapsed' : ''}`} aria-label="Navegación">
      <button
        type="button"
        className="sidebar-toggle"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
        title={collapsed ? 'Expandir menú' : 'Contraer menú'}
      >
        <ActionIcon name={collapsed ? 'chevron-right' : 'chevron-left'} />
      </button>

      <button
        type="button"
        className="sidebar-brand"
        onClick={() => onNavigate('settings')}
        title="Ir a Ajustes"
      >
        <div className="brand-mark" aria-hidden>
          <BrandMark className="brand-icon" />
        </div>
        <div className="sidebar-brand-text">
          <p className="sidebar-title">{displayName || 'Billzzz'}</p>
          <p className="sidebar-email">{email}</p>
        </div>
      </button>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar-link ${page === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
            title={item.label}
          >
            <span className="sidebar-icon-wrap">
              <NavIcon name={item.icon} />
            </span>
            <span className="sidebar-link-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className={`status-pill ${online ? 'online' : 'offline'}`}>
          <span className={`status-dot ${online ? 'online' : 'offline'}`} />
          <span className="status-pill-label">{online ? 'En línea' : 'Sin conexión'}</span>
        </span>
        {pendingCount > 0 && <span className="sidebar-pending">{pendingCount} pendiente(s)</span>}
      </div>
    </aside>
  );
}
