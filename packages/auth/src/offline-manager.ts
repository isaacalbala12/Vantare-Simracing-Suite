import type { LicenseCache, LicenseCacheStore, LicenseStatus, LicenseTier } from './types';

const TTL_MS = 24 * 60 * 60 * 1000;
const GRACE_MS = 72 * 60 * 60 * 1000;

export class OfflineManager {
  private store: LicenseCacheStore | null = null;
  private isOnline = true;

  constructor(store?: LicenseCacheStore) {
    this.store = store ?? null;
  }

  setStore(store: LicenseCacheStore): void {
    this.store = store;
  }

  setOnline(online: boolean): void {
    this.isOnline = online;
  }

  async cacheLicense(status: LicenseStatus): Promise<void> {
    if (!this.store || !status.licenseId) return;

    await this.store.set({
      tier: status.tier,
      valid: status.isValid,
      cachedAt: new Date().toISOString(),
      expiresAt: status.expiresAt ?? null,
      licenseId: status.licenseId,
    });
  }

  async getCachedLicense(): Promise<LicenseCache | null> {
    if (!this.store) return null;
    return this.store.get();
  }

  async getEffectiveTier(fallback: LicenseTier = 'free'): Promise<LicenseTier> {
    const cached = await this.getCachedLicense();
    if (!cached) return fallback;

    const ageMs = Date.now() - new Date(cached.cachedAt).getTime();
    if (ageMs <= TTL_MS) return cached.tier;
    if (ageMs <= GRACE_MS) return cached.tier;
    return 'free';
  }

  async isOfflineValid(): Promise<boolean> {
    const cached = await this.getCachedLicense();
    if (!cached) return false;
    const ageMs = Date.now() - new Date(cached.cachedAt).getTime();
    return ageMs <= GRACE_MS;
  }

  async clearCache(): Promise<void> {
    if (this.store) await this.store.clear();
  }

  get online(): boolean {
    return this.isOnline;
  }
}
