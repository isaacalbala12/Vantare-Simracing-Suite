import { FormEvent, useEffect, useState } from 'react';
import { useAuthStore } from '../../shared/stores/auth-store';

export default function AccountPage() {
  const { user, license, isLoading, error, loadSession, login, register, logout } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = mode === 'login'
      ? await login(email, password)
      : await register(email, password);
    if (ok) {
      setPassword('');
    }
  };

  if (isLoading && !user) {
    return (
      <div data-testid="account-page" className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
        <div className="text-sm">Loading account...</div>
      </div>
    );
  }

  if (user) {
    return (
      <div data-testid="account-page" className="p-6 h-full overflow-auto">
        <div className="max-w-lg space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-[var(--color-text)]">Account</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">Manage your Vantare license</p>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
            <div>
              <div className="text-xs text-[var(--color-text-muted)]">Email</div>
              <div data-testid="account-email" className="text-sm text-[var(--color-text)]">{user.email}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-text-muted)]">License tier</div>
              <div data-testid="account-tier" className="text-sm font-medium uppercase text-[var(--color-primary)]">
                {license?.tier ?? user.tier}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-text-muted)]">Status</div>
              <div data-testid="account-license-status" className="text-sm text-[var(--color-text)]">
                {license?.isValid ? 'Valid' : 'Invalid / offline'}
              </div>
            </div>
          </div>

          <button
            type="button"
            data-testid="account-logout-btn"
            onClick={() => void logout()}
            className="px-4 py-2 text-sm rounded-md border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-elevated)]"
          >
            Log out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="account-page" className="p-6 h-full overflow-auto">
      <div className="max-w-md mx-auto space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text)]">Account</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Sign in to sync your license across devices.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            data-testid="account-mode-login"
            onClick={() => setMode('login')}
            className={`flex-1 px-3 py-2 text-sm rounded-md ${
              mode === 'login' ? 'bg-[var(--color-primary)] text-black' : 'bg-[var(--color-surface-elevated)] text-[var(--color-text)]'
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            data-testid="account-mode-register"
            onClick={() => setMode('register')}
            className={`flex-1 px-3 py-2 text-sm rounded-md ${
              mode === 'register' ? 'bg-[var(--color-primary)] text-black' : 'bg-[var(--color-surface-elevated)] text-[var(--color-text)]'
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs text-[var(--color-text-muted)]">Email</span>
            <input
              type="email"
              data-testid="account-email-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--color-text-muted)]">Password</span>
            <input
              type="password"
              data-testid="account-password-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
            />
          </label>

          {error && (
            <p data-testid="account-error" className="text-xs text-red-400">{error}</p>
          )}

          <button
            type="submit"
            data-testid="account-submit-btn"
            disabled={isLoading}
            className="w-full px-4 py-2 text-sm font-medium rounded-md bg-[var(--color-primary)] text-black hover:opacity-90 disabled:opacity-50"
          >
            {mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
