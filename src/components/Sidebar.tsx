import { BrandMark } from './BrandMark';
import { NavIcon } from './NavIcon';
import { NAV_ITEMS, type NavPage } from '../types/nav';

interface SidebarProps {
  page: NavPage;
  onNavigate: (page: NavPage) => void;
  email: string;
  online: boolean;
  pendingCount: number;
}

export function Sidebar({ page, onNavigate, email, online, pendingCount }: SidebarProps) {
  return (
    <aside className="sidebar open" aria-label="Navegación">
      <div className="sidebar-brand">
        <div className="brand-mark" aria-hidden>
          <BrandMark className="brand-icon" />
        </div>
        <div className="sidebar-brand-text">
          <p className="sidebar-title">Bills</p>
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
          >
            <span className="sidebar-icon-wrap">
              <NavIcon name={item.icon} />
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className={`status-pill ${online ? 'online' : 'offline'}`}>
          <span className={`status-dot ${online ? 'online' : 'offline'}`} />
          {online ? 'En línea' : 'Sin conexión'}
        </span>
        {pendingCount > 0 && <span className="sidebar-pending">{pendingCount} pendiente(s)</span>}
      </div>
    </aside>
  );
}
