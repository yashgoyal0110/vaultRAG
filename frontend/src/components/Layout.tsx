import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function Layout() {
  const { user, tenant, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <span className="brand-dot" />
            VaultRAG
          </div>
          <div className="tenant-name">{tenant?.name}</div>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Workspace</div>
          <NavLink to="/documents" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Documents
          </NavLink>
          <NavLink to="/chat" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Chat
          </NavLink>
        </div>

        <div className="sidebar-footer">
          <div className="user-email">{user?.email}</div>
          <button className="btn-secondary" onClick={handleLogout} style={{ width: '100%' }}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main-area">
        <Outlet />
      </main>
    </div>
  );
}
