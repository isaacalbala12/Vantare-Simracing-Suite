import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from './supabase-client';
import { secureStorage } from './secure-storage';
import { getHardwareId } from './hwid';
import { validateLicense, clearLicenseValidatorCache } from './license-validator';
import { OfflineManager } from './offline-manager';
import { hasFeature, type Feature } from './feature-gate';
import { MockAuthService } from './mock-auth-service';
import type { AuthResult, AuthServiceConfig, AuthUser, LicenseStatus, LicenseTier } from './types';

const SESSION_KEY = 'vantare.auth.session';

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
}

export class AuthService {
  private static mock = new MockAuthService();
  private static useMock = true;
  private static supabase: SupabaseClient | null = null;
  private static offline = new OfflineManager();
  private static currentLicense: LicenseStatus = { tier: 'free', isValid: true };

  static configure(config: AuthServiceConfig): void {
    if (config.mock) {
      this.useMock = true;
      return;
    }

    this.useMock = false;
    this.supabase = createSupabaseClient(config.supabaseUrl, config.supabaseAnonKey);
    if (config.licenseCacheStore) {
      this.offline.setStore(config.licenseCacheStore);
    }
  }

  static enableMockMode(): void {
    this.useMock = true;
  }

  static async login(email: string, password: string): Promise<AuthResult> {
    if (this.useMock) return this.mock.login(email, password);

    const supabase = this.requireSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session || !data.user) {
      return { success: false, error: error?.message ?? 'Invalid email or password', user: null };
    }

    await this.persistSession(data.session.access_token, data.session.refresh_token, data.user.id, data.user.email ?? email);
    const license = await this.refreshLicenseStatus(data.session.access_token);
    const user: AuthUser = {
      id: data.user.id,
      email: data.user.email ?? email,
      tier: license.tier,
    };

    return { success: true, user };
  }

  static async register(email: string, password: string, tier?: LicenseTier): Promise<AuthResult> {
    if (this.useMock) return this.mock.register(email, password, tier ?? 'free');

    const supabase = this.requireSupabase();
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error || !data.user) {
      return { success: false, error: error?.message ?? 'Registration failed', user: null };
    }

    if (data.session) {
      await this.persistSession(
        data.session.access_token,
        data.session.refresh_token,
        data.user.id,
        data.user.email ?? email,
      );
      const license = await this.refreshLicenseStatus(data.session.access_token);
      return {
        success: true,
        user: { id: data.user.id, email: data.user.email ?? email, tier: license.tier },
      };
    }

    return {
      success: true,
      user: { id: data.user.id, email: data.user.email ?? email, tier: 'free' },
    };
  }

  static async logout(): Promise<void> {
    if (this.useMock) {
      await this.mock.logout();
      return;
    }

    const supabase = this.requireSupabase();
    await supabase.auth.signOut();
    await secureStorage.remove(SESSION_KEY);
    clearLicenseValidatorCache();
    this.currentLicense = { tier: 'free', isValid: true };
    await this.offline.clearCache();
  }

  static async getSession(): Promise<AuthUser | null> {
    if (this.useMock) return this.mock.getSession();

    const session = await this.readSession();
    if (!session) return null;

    const license = await this.getLicenseStatus();
    return {
      id: session.userId,
      email: session.email,
      tier: license.tier,
    };
  }

  static async getLicenseStatus(): Promise<LicenseStatus> {
    if (this.useMock) return this.mock.getLicenseStatus();

    const session = await this.readSession();
    if (!session) {
      this.currentLicense = { tier: 'free', isValid: false };
      return this.currentLicense;
    }

    try {
      const status = await this.refreshLicenseStatus(session.accessToken);
      this.offline.setOnline(true);
      return status;
    } catch {
      this.offline.setOnline(false);
      const tier = await this.offline.getEffectiveTier('free');
      const cached = await this.offline.getCachedLicense();
      this.currentLicense = {
        tier,
        isValid: tier !== 'free' || cached?.valid === true,
        expiresAt: cached?.expiresAt ?? undefined,
        licenseId: cached?.licenseId,
      };
      return this.currentLicense;
    }
  }

  static canAccess(feature: Feature | 'pro-features' | 'ultimate-features'): boolean {
    if (this.useMock) return this.mock.canAccess(feature);

    const tier = this.currentLicense.tier;
    if (feature === 'pro-features') return tier === 'pro' || tier === 'ultimate';
    if (feature === 'ultimate-features') return tier === 'ultimate';
    return hasFeature(tier, feature);
  }

  private static requireSupabase(): SupabaseClient {
    if (!this.supabase) {
      throw new Error('AuthService is not configured. Call AuthService.configure() from the Electron main process.');
    }
    return this.supabase;
  }

  private static async persistSession(
    accessToken: string,
    refreshToken: string,
    userId: string,
    email: string,
  ): Promise<void> {
    const payload: StoredSession = { accessToken, refreshToken, userId, email };
    await secureStorage.set(SESSION_KEY, JSON.stringify(payload));
  }

  private static async readSession(): Promise<StoredSession | null> {
    const raw = await secureStorage.get(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  }

  private static async refreshLicenseStatus(accessToken: string): Promise<LicenseStatus> {
    const supabase = this.requireSupabase();
    const hwid = await getHardwareId();
    const status = await validateLicense(supabase, accessToken, hwid);
    this.currentLicense = status;
    await this.offline.cacheLicense(status);
    return status;
  }
}
