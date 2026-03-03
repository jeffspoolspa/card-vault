import { useEffect } from 'react';
import { Outlet, useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useVaultSession } from '../hooks/useVaultSession';
import { VaultPasswordPrompt } from '../components/VaultPasswordPrompt';

export function DashboardPage() {
  const { user, vaultUser, loading, logout } = useAuth();
  const vault = useVaultSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [loading, user, navigate]);

  if (loading) {
    return <div className="page-loading">Loading...</div>;
  }

  if (!user || !vaultUser) {
    return null;
  }

  if (!vault.isUnlocked) {
    return (
      <VaultPasswordPrompt
        onUnlock={vault.unlock}
        unlocking={vault.unlocking}
        error={vault.error}
      />
    );
  }

  const isFullAccess = vaultUser.access_level === 'full_access';

  return (
    <div className="dashboard">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h2>Card Vault</h2>
          <span className="user-email">{user.email}</span>
        </div>

        <ul className="nav-links">
          {isFullAccess && (
            <li>
              <NavLink to="/" end>Cards</NavLink>
            </li>
          )}
          <li>
            <NavLink to="/generate-link">Generate Link</NavLink>
          </li>
          {isFullAccess && (
            <li>
              <NavLink to="/access-log">Access Log</NavLink>
            </li>
          )}
        </ul>

        <div className="sidebar-footer">
          <button onClick={vault.lock} className="btn btn-sm btn-muted">Lock Vault</button>
          <button onClick={logout} className="btn btn-sm btn-muted">Sign Out</button>
        </div>
      </nav>

      <main className="main-content">
        <Outlet context={{ vault, user, vaultUser }} />
      </main>
    </div>
  );
}
