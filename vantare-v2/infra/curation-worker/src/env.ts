import { ALLOWED_ENVIRONMENTS } from "./constants";

export interface Env extends CloudflareEnv {
  BUILD_ADMISSION_TOKEN: string;
  HASH_PEPPER: string;
}

export interface QuotaConfig {
  credentialDayObjects: number;
  credentialMonthObjects: number;
  credentialDayBytes: number;
  credentialMonthBytes: number;
  ipDayObjects: number;
  ipMonthObjects: number;
  ipDayBytes: number;
  ipMonthBytes: number;
  globalDayObjects: number;
  globalMonthObjects: number;
  globalDayBytes: number;
  globalMonthBytes: number;
  credentialCombinationMonthObjects: number;
}

export function assertEnvironment(env: Env): void {
  if (!ALLOWED_ENVIRONMENTS.has(env.CURATION_ENV)) throw new Error("invalid environment binding");
  if (env.BUILD_ADMISSION_TOKEN.length < 32 || env.HASH_PEPPER.length < 32) {
    throw new Error("security secrets are not configured");
  }
  quotaConfig(env);
}

export function quotaConfig(env: Env): QuotaConfig {
  return {
    credentialDayObjects: positiveInteger(env.QUOTA_CREDENTIAL_DAY_OBJECTS),
    credentialMonthObjects: positiveInteger(env.QUOTA_CREDENTIAL_MONTH_OBJECTS),
    credentialDayBytes: positiveInteger(env.QUOTA_CREDENTIAL_DAY_BYTES),
    credentialMonthBytes: positiveInteger(env.QUOTA_CREDENTIAL_MONTH_BYTES),
    ipDayObjects: positiveInteger(env.QUOTA_IP_DAY_OBJECTS),
    ipMonthObjects: positiveInteger(env.QUOTA_IP_MONTH_OBJECTS),
    ipDayBytes: positiveInteger(env.QUOTA_IP_DAY_BYTES),
    ipMonthBytes: positiveInteger(env.QUOTA_IP_MONTH_BYTES),
    globalDayObjects: positiveInteger(env.QUOTA_GLOBAL_DAY_OBJECTS),
    globalMonthObjects: positiveInteger(env.QUOTA_GLOBAL_MONTH_OBJECTS),
    globalDayBytes: positiveInteger(env.QUOTA_GLOBAL_DAY_BYTES),
    globalMonthBytes: positiveInteger(env.QUOTA_GLOBAL_MONTH_BYTES),
    credentialCombinationMonthObjects: positiveInteger(env.QUOTA_CREDENTIAL_COMBINATION_MONTH_OBJECTS),
  };
}

function positiveInteger(raw: string): number {
  if (!/^\d+$/.test(raw)) throw new Error("invalid quota binding");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("invalid quota binding");
  return value;
}
