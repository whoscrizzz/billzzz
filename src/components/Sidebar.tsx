import { ActionIcon } from './ActionIcon';
import { BrandMark } from './BrandMark';
import { NavIcon } from './NavIcon';
import { NAV_ITEMS, type NavPage } from '../types/nav';
import { useTheme, THEME_CYCLE, THEME_LABEL } from '../lib/theme';

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
  const { theme, setTheme } = useTheme();

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

      <div className="sidebar-brand">
        <div className="brand-mark" aria-hidden>
          <BrandMark className="brand-icon" />
        </div>
        <div className="sidebar-brand-text">
          <p className="sidebar-title">{displayName || 'Bills'}</p>
          <p className="sidebar-tagline">Suscripciones</p>
          <p className="sidebar-email">{email}</p>
        </div>
      </div>

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
        <button
          type="button"
          className="sidebar-theme-btn"
          onClick={() => setTheme(THEME_CYCLE[theme])}
          title={`Tema: ${THEME_LABEL[theme]}`}
        >
          <span className="sidebar-icon-wrap">
            <ActionIcon name="theme" />
          </span>
          <span className="sidebar-theme-label">{THEME_LABEL[theme]}</span>
        </button>
        <span className={`status-pill ${online ? 'online' : 'offline'}`}>
          <span className={`status-dot ${online ? 'online' : 'offline'}`} />
          <span className="status-pill-label">{online ? 'En línea' : 'Sin conexión'}</span>
        </span>
        {pendingCount > 0 && <span className="sidebar-pending">{pendingCount} pendiente(s)</span>}
      </div>
    </aside>
  );
}
