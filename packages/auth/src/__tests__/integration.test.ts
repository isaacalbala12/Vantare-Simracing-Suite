import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../auth-service';
import { Feature, hasFeature } from '../feature-gate';
import { OfflineManager } from '../offline-manager';
import type { LicenseCacheStore } from '../types';

function createMemoryStore(): LicenseCacheStore {
  let value = null as Awaited<ReturnType<LicenseCacheStore['get']>>;
  return {
    get: async () => value,
    set: async (cache) => {
      value = cache;
    },
    clear: async () => {
      value = null;
    },
  };
}

describe('auth integration', () => {
  beforeEach(async () => {
    AuthService.enableMockMode();
    await AuthService.logout();
  });

  it('login assigns tier and gates features', async () => {
    await AuthService.register('pro@test.com', 'password', 'pro');
    await AuthService.logout();

    const result = await AuthService.login('pro@test.com', 'password');
    expect(result.success).toBe(true);
    expect(result.user?.tier).toBe('pro');

    const license = await AuthService.getLicenseStatus();
    expect(hasFeature(license.tier, Feature.LMU)).toBe(true);
    expect(hasFeature(license.tier, Feature.CUSTOM_THEMES)).toBe(false);
    expect(AuthService.canAccess(Feature.LMU)).toBe(true);
  });

  it('offline manager backs auth degradation path', async () => {
    const store = createMemoryStore();
    const offline = new OfflineManager(store);
    await offline.cacheLicense({
      tier: 'pro',
      isValid: true,
      licenseId: 'lic-1',
    });

    expect(await offline.getEffectiveTier('free')).toBe('pro');
  });
});
