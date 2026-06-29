export type LicenseState =
  | "anonymous"
  | "authenticated-no-entitlement"
  | "active"
  | "grace"
  | "expired"
  | "device-limit"
  | "unconfigured";

export type Entitlement =
  | "overlays"
  | "engineer"
  | "bundle"
  | "beta_access"
  | "supporter"
  | "founder"
  | "pro_founder"
  | "visionary_backer"
  | "ac_lua_pack";

export type LicenseResult = {
  state: LicenseState;
  entitlements: Entitlement[];
  userId: string;
  email: string;
  deviceOK: boolean;
  graceEndsAt?: string;
  lastValidated?: string;
  error?: string;
};
