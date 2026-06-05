export type LicenseTier = 'free' | 'pro' | 'ultimate';

export interface AuthUser {
  id: string;
  email: string;
  tier: LicenseTier;
}

export interface AuthResult {
  success: boolean;
  error?: string;
  user: AuthUser | null;
}

export interface LicenseStatus {
  tier: LicenseTier;
  isValid: boolean;
  expiresAt?: string;
  licenseId?: string;
}

export interface LicenseCache {
  tier: LicenseTier;
  valid: boolean;
  cachedAt: string;
  expiresAt: string | null;
  licenseId: string;
}

export interface SecureStorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface LicenseCacheStore {
  get(): Promise<LicenseCache | null>;
  set(cache: LicenseCache): Promise<void>;
  clear(): Promise<void>;
}

export interface AuthServiceConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  storage?: SecureStorageAdapter;
  licenseCacheStore?: LicenseCacheStore;
  mock?: boolean;
}
