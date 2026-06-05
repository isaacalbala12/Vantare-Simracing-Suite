import { hasFeature, type Feature } from './feature-gate';
import type { AuthResult, AuthUser, LicenseStatus, LicenseTier } from './types';

interface RegisteredUser {
  email: string;
  password: string;
  tier: LicenseTier;
}

export class MockAuthService {
  private currentUser: AuthUser | null = null;
  private users = new Map<string, RegisteredUser>();
  private currentLicense: LicenseStatus = { tier: 'free', isValid: true };

  async login(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = this.users.get(normalizedEmail);

    if (!user || user.password !== password) {
      return { success: false, error: 'Invalid email or password', user: null };
    }

    this.currentUser = { id: crypto.randomUUID(), email: user.email, tier: user.tier };
    this.currentLicense = { tier: user.tier, isValid: true };
    return { success: true, user: this.currentUser };
  }

  async register(email: string, password: string, tier: LicenseTier = 'free'): Promise<AuthResult> {
    const normalizedEmail = email.toLowerCase().trim();

    if (!email || !password) {
      return { success: false, error: 'Email and password are required', user: null };
    }

    if (this.users.has(normalizedEmail)) {
      return { success: false, error: 'Email already registered', user: null };
    }

    this.users.set(normalizedEmail, { email: normalizedEmail, password, tier });
    this.currentUser = { id: crypto.randomUUID(), email: normalizedEmail, tier };
    this.currentLicense = { tier, isValid: true };
    return { success: true, user: this.currentUser };
  }

  async logout(): Promise<void> {
    this.currentUser = null;
    this.currentLicense = { tier: 'free', isValid: true };
  }

  async getSession(): Promise<AuthUser | null> {
    return this.currentUser;
  }

  async getLicenseStatus(): Promise<LicenseStatus> {
    return { ...this.currentLicense };
  }

  canAccess(feature: Feature | 'pro-features' | 'ultimate-features'): boolean {
    const tier = this.currentLicense.tier;
    if (feature === 'pro-features') return tier === 'pro' || tier === 'ultimate';
    if (feature === 'ultimate-features') return tier === 'ultimate';
    return hasFeature(tier, feature);
  }
}
