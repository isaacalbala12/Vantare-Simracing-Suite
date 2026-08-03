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

export type Capability =
  | "vantare.plan.pro"
  | "vantare.edition.launch_v1"
  | "vantare.channel.testers"
  | "vantare.channel.nightly"
  | "vantare.operational.tester"
  | "vantare.operational.nightly_tester"
  | "vantare.operational.owner";

export type OperationalRole = "tester" | "nightly_tester" | "owner";

export type LicenseResult = {
  state: LicenseState;
  entitlements: Entitlement[];
  capabilities?: Capability[];
  operationalRoles?: OperationalRole[];
  userId: string;
  email: string;
  deviceOK: boolean;
  graceEndsAt?: string;
  lastValidated?: string;
  error?: string;
  providerCustomerId?: string;
  billingProvider?: string;
};
