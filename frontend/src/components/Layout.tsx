import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Logo, DocIcon, ChatIcon, LogoutIcon } from './icons';

export function Layout() {
  const { user, tenant, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const tenantInitial = (tenant?.name || '?').trim().charAt(0).toUpperCase();
  const userInitial = (user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <Logo />
            <span className="wordmark"><b>Vault</b><span>RAG</span></span>
          </div>
          <div className="tenant">
            <div className="tenant-badge">{tenantInitial}</div>
            <div style={{ minWidth: 0 }}>
              <div className="tenant-name">{tenant?.name || 'Workspace'}</div>
              <div className="tenant-plan">{(tenant?.plan || 'free')} plan</div>
            </div>
          </div>
        </div>

        <nav className="nav-section">
          <div className="nav-section-title">Workspace</div>
          <NavLink to="/documents" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <DocIcon />
            <span className="label">Documents</span>
          </NavLink>
          <NavLink to="/chat" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <ChatIcon />
            <span className="label">Chat</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-row">
            <div className="avatar">{userInitial}</div>
            <div className="user-email">{user?.email}</div>
          </div>
          <button className="btn-secondary" onClick={handleLogout} style={{ width: '100%' }}>
            <LogoutIcon />
            <span className="label">Sign out</span>
          </button>
        </div>
      </aside>
      <main className="main-area">
        <Outlet />
      </main>
    </div>
  );
}
