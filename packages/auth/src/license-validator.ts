import type { SupabaseClient } from '@supabase/supabase-js';
import type { LicenseStatus } from './types';

const MEMORY_CACHE_MS = 6 * 60 * 60 * 1000;

let memoryCache: { key: string; status: LicenseStatus; cachedAt: number } | null = null;

export async function validateLicense(
  supabase: SupabaseClient,
  accessToken: string,
  hwid: string,
): Promise<LicenseStatus> {
  const cacheKey = `${accessToken}:${hwid}`;
  if (memoryCache && memoryCache.key === cacheKey && Date.now() - memoryCache.cachedAt < MEMORY_CACHE_MS) {
    return memoryCache.status;
  }

  const { data, error } = await supabase.functions.invoke('validate-license', {
    body: { hwid },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    throw error;
  }

  const payload = data as {
    valid?: boolean;
    tier?: LicenseStatus['tier'];
    expires_at?: string | null;
    license_id?: string;
  };

  const status: LicenseStatus = {
    tier: payload.tier ?? 'free',
    isValid: payload.valid === true,
    expiresAt: payload.expires_at ?? undefined,
    licenseId: payload.license_id,
  };

  memoryCache = { key: cacheKey, status, cachedAt: Date.now() };
  return status;
}

export function clearLicenseValidatorCache(): void {
  memoryCache = null;
}
