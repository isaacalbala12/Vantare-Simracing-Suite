import { create } from 'zustand';
import type { LicenseStatus } from '@vantare/auth';

export interface AuthUser {
  id: string;
  email: string;
  tier: 'free' | 'pro' | 'ultimate';
}

interface AuthState {
  user: AuthUser | null;
  license: LicenseStatus | null;
  isLoading: boolean;
  error: string | null;
  loadSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshLicense: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  license: null,
  isLoading: false,
  error: null,

  loadSession: async () => {
    try {
      set({ isLoading: true, error: null });
      const [user, license] = await Promise.all([
        window.vantare.getSession(),
        window.vantare.getLicenseStatus(),
      ]);
      set({ user, license, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load session';
      set({ error: message, isLoading: false });
    }
  },

  login: async (email, password) => {
    try {
      set({ isLoading: true, error: null });
      const result = await window.vantare.login(email, password);
      if (!result.success || !result.user) {
        set({ error: result.error ?? 'Login failed', isLoading: false });
        return false;
      }
      const license = await window.vantare.getLicenseStatus();
      set({ user: result.user, license, isLoading: false });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ error: message, isLoading: false });
      return false;
    }
  },

  register: async (email, password) => {
    try {
      set({ isLoading: true, error: null });
      const result = await window.vantare.register(email, password);
      if (!result.success || !result.user) {
        set({ error: result.error ?? 'Registration failed', isLoading: false });
        return false;
      }
      const license = await window.vantare.getLicenseStatus();
      set({ user: result.user, license, isLoading: false });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      set({ error: message, isLoading: false });
      return false;
    }
  },

  logout: async () => {
    try {
      set({ error: null });
      await window.vantare.logout();
      set({ user: null, license: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Logout failed';
      set({ error: message });
    }
  },

  refreshLicense: async () => {
    try {
      const license = await window.vantare.getLicenseStatus();
      set({ license });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh license';
      set({ error: message });
    }
  },
}));
