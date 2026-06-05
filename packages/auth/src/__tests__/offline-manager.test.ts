import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineManager } from '../offline-manager';
import type { LicenseCache, LicenseCacheStore, LicenseStatus } from '../types';

function createMemoryStore(): LicenseCacheStore & { value: LicenseCache | null } {
  const store = {
    value: null as LicenseCache | null,
    async get() {
      return store.value;
    },
    async set(cache: LicenseCache) {
      store.value = cache;
    },
    async clear() {
      store.value = null;
    },
  };
  return store;
}

describe('OfflineManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches and returns tier within TTL', async () => {
    const store = createMemoryStore();
    const manager = new OfflineManager(store);
    const status: LicenseStatus = {
      tier: 'pro',
      isValid: true,
      licenseId: 'lic-1',
      expiresAt: '2027-01-01T00:00:00Z',
    };

    await manager.cacheLicense(status);
    expect(await manager.getEffectiveTier('free')).toBe('pro');
  });

  it('keeps tier during grace period after TTL', async () => {
    const store = createMemoryStore();
    const manager = new OfflineManager(store);
    await manager.cacheLicense({
      tier: 'ultimate',
      isValid: true,
      licenseId: 'lic-2',
    });

    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    expect(await manager.getEffectiveTier('free')).toBe('ultimate');
  });

  it('falls back to free after grace period', async () => {
    const store = createMemoryStore();
    const manager = new OfflineManager(store);
    await manager.cacheLicense({
      tier: 'pro',
      isValid: true,
      licenseId: 'lic-3',
    });

    vi.advanceTimersByTime(73 * 60 * 60 * 1000);
    expect(await manager.getEffectiveTier('free')).toBe('free');
    expect(await manager.isOfflineValid()).toBe(false);
  });
});
