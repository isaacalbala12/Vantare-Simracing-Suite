export type {
  AuthUser,
  AuthResult,
  LicenseStatus,
  LicenseTier,
  LicenseCache,
  AuthServiceConfig,
  SecureStorageAdapter,
  LicenseCacheStore,
} from './types';

export { AuthService } from './auth-service';
export { createSupabaseClient } from './supabase-client';
export { secureStorage, setSecureStorageAdapter, memorySecureStorage } from './secure-storage';
export { getHardwareId, setMachineIdProvider } from './hwid';
export { validateLicense, clearLicenseValidatorCache } from './license-validator';
export { OfflineManager } from './offline-manager';
export {
  Feature,
  tierFeatures,
  hasFeature,
  getRequiredTier,
  getFeaturesForTier,
  type Tier,
} from './feature-gate';
