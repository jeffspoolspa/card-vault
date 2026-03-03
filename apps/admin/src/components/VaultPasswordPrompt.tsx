import { useState } from 'react';

interface VaultPasswordPromptProps {
  onUnlock: (password: string) => Promise<boolean>;
  unlocking: boolean;
  error: string | null;
}

export function VaultPasswordPrompt({ onUnlock, unlocking, error }: VaultPasswordPromptProps) {
  const [password, setPassword] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    const success = await onUnlock(password);
    if (!success) setPassword('');
  }

  return (
    <div className="vault-overlay">
      <div className="vault-prompt">
        <div className="vault-icon">&#128272;</div>
        <h2>Vault Locked</h2>
        <p>Enter the vault master password to decrypt card data.</p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Master password"
            className="input"
            autoFocus
            disabled={unlocking}
          />
          {error && <div className="error-message">{error}</div>}
          <button type="submit" disabled={unlocking} className="btn btn-primary">
            {unlocking ? 'Unlocking...' : 'Unlock Vault'}
          </button>
        </form>
      </div>
    </div>
  );
}
