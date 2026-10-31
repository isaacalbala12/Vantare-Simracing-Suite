import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCorsPreflight } from "./cors.ts";
import { isUuid } from "./request.ts";
import { errorResponse, jsonResponse } from "./responses.ts";
import { getSupabaseAdmin } from "./supabase-admin.ts";
import type { BillingEnvironment } from "./mapping.ts";
import {
  type NativeAuthDeps,
  nativeConfig,
  requireUnblocked,
  resolveNativeAccount,
} from "./native-auth.ts";

export const CREDENTIAL_VERSION = 1;
export const CREDENTIAL_ALGORITHM = "Ed25519";
export const CREDENTIAL_ISSUER = "vantare-license";

export class CredentialAuthError extends Error {
  constructor() {
    super("Credential authentication rejected");
    this.name = "CredentialAuthError";
  }
}

export const MODULE_CAPABILITIES = [
  "vantare.module.analysis",
  "vantare.module.calendar",
  "vantare.module.engineer",
  "vantare.module.strategy",
] as const;

const KNOWN_CAPABILITIES = new Set([
  "vantare.channel.nightly",
  "vantare.channel.testers",
  "vantare.edition.launch_v1",
  ...MODULE_CAPABILITIES,
  "vantare.operational.nightly_tester",
  "vantare.operational.owner",
  "vantare.operational.tester",
  "vantare.plan.founders",
  "vantare.plan.pro",
]);

export const OPERATIONAL_LEASE_MS = {
  tester: 14 * 24 * 60 * 60 * 1000,
  nightly_tester: 72 * 60 * 60 * 1000,
  owner: 30 * 24 * 60 * 60 * 1000,
} as const;

export type CapabilityGrant = {
  key: string;
  paid_through?: string;
  perpetual?: true;
  scope_version?: string;
};

export type LicenseClaims = {
  issuer: typeof CREDENTIAL_ISSUER;
  subject: string;
  device_fingerprint: string;
  issued_at: string;
  capabilities: CapabilityGrant[];
};

export type OfflineCredential = {
  version: typeof CREDENTIAL_VERSION;
  algorithm: typeof CREDENTIAL_ALGORITHM;
  key_id: string;
  claims: LicenseClaims;
  signature: string;
};

export type CredentialResponse = {
  credential: OfflineCredential;
  online_capabilities: string[];
};

type StoredGrant = {
  capability: string;
  valid_until: string | null;
  provider: string;
  environment: string;
  source_type: string;
  source_id?: string;
};

export type StoredOperationalAssignment = {
  role: string;
  expires_at: string | null;
  policy_version: number;
};

export type CredentialStore = {
  load(
    token: string,
    fingerprint: string,
    environment: BillingEnvironment,
  ): Promise<
    {
      accountId: string;
      deviceMatches: boolean;
      grants: StoredGrant[];
      operationalAssignments?: StoredOperationalAssignment[];
      moduleRollout?: { module: string; enabled_for_all: boolean }[];
    }
  >;
};

export type CredentialDeps = {
  store?: CredentialStore;
  now?: () => Date;
  environment?: BillingEnvironment;
  sign?: (claims: LicenseClaims) => Promise<OfflineCredential>;
};

// ADR 0102 / #1815: deployed only after zero use over 30 days and Isaac's approval.
// Keep the dependency argument for callers/tests to prove retirement performs no I/O.
export function handleLicenseCredentialRequest(
  request: Request,
  _deps: CredentialDeps = {},
): Promise<Response> {
  const cors = handleCorsPreflight(request);
  if (cors) return Promise.resolve(cors);
  return Promise.resolve(jsonResponse({
    error: "endpoint_retired",
    message: "license-credential is retired; use native-license with native OAuth",
  }, 410, { "Cache-Control": "no-store" }));
}

export function normalizeOperationalAssignments(
  rows: StoredOperationalAssignment[],
  now: Date,
): { ok: true; grants: CapabilityGrant[] } | { ok: false } {
  if (rows.length > 1) return { ok: false };
  if (rows.length === 0) return { ok: true, grants: [] };
  const row = rows[0];
  if (
    row.policy_version !== 1 ||
    !Object.prototype.hasOwnProperty.call(OPERATIONAL_LEASE_MS, row.role)
  ) {
    return { ok: false };
  }
  const assignmentExpiry = row.expires_at === null
    ? null
    : new Date(row.expires_at);
  if (
    assignmentExpiry !== null &&
    (!Number.isFinite(assignmentExpiry.getTime()) || assignmentExpiry <= now)
  ) {
    return assignmentExpiry !== null &&
        Number.isFinite(assignmentExpiry.getTime())
      ? { ok: true, grants: [] }
      : { ok: false };
  }
  const role = row.role as keyof typeof OPERATIONAL_LEASE_MS;
  const leaseExpiry = new Date(now.getTime() + OPERATIONAL_LEASE_MS[role]);
  const paidThrough =
    assignmentExpiry !== null && assignmentExpiry < leaseExpiry
      ? assignmentExpiry
      : leaseExpiry;
  return {
    ok: true,
    grants: [{
      key: `vantare.operational.${role}`,
      paid_through: paidThrough.toISOString(),
    }],
  };
}

export function normalizeGrants(
  rows: StoredGrant[],
  now: Date,
  environment: BillingEnvironment,
):
  | { ok: true; grants: CapabilityGrant[]; onlineCapabilities: string[] }
  | { ok: false } {
  const grouped = new Map<
    string,
    { perpetual: boolean; paidThrough: Date | null }
  >();
  for (const row of rows) {
    // Legacy rows are retained for audit but are never credential authority.
    // Their explicit retirement is performed separately after a reviewed
    // per-account dry-run.
    if (row.provider === "legacy" && row.environment === "legacy") continue;
    if (!KNOWN_CAPABILITIES.has(row.capability)) return { ok: false };
    if (row.environment !== environment) return { ok: false };
    if (MODULE_CAPABILITIES.some((key) => key === row.capability)) {
      if (
        row.valid_until !== null || row.provider !== "vantare" ||
        row.source_type !== "support"
      ) {
        return { ok: false };
      }
      grouped.set(row.capability, { perpetual: true, paidThrough: null });
      continue;
    }
    if (
      row.capability === "vantare.plan.founders" &&
      (row.valid_until !== null || row.provider !== "polar" ||
        row.source_type !== "order")
    ) {
      return { ok: false };
    }
    const isRecovery = row.provider === "vantare" &&
      row.source_type === "subscription_recovery";
    if (isRecovery) {
      if (
        row.valid_until === null ||
        row.capability === "vantare.edition.launch_v1"
      ) {
        return { ok: false };
      }
      // ADR 0102 / #1814: recovery is ordinary bounded v1 authority.
      // Lifecycle/SQL cap the cycle once at 72h; the effective view supplies that
      // original recovery_until. Normalization never recalculates now + 72h.
    } else if (
      row.provider !== "polar" ||
      !["order", "subscription", "benefit_grant"].includes(row.source_type)
    ) {
      return { ok: false };
    }
    const paidThrough = row.valid_until === null
      ? null
      : new Date(row.valid_until);
    if (paidThrough !== null && !Number.isFinite(paidThrough.getTime())) {
      return { ok: false };
    }
    if (paidThrough !== null && paidThrough <= now) continue;
    const current = grouped.get(row.capability) ??
      { perpetual: false, paidThrough: null };
    if (paidThrough === null) {
      if (
        row.capability !== "vantare.edition.launch_v1" &&
        row.capability !== "vantare.plan.founders" &&
        row.capability !== "vantare.channel.testers" &&
        !(row.capability === "vantare.channel.nightly" &&
          row.source_type === "order" &&
          rows.some((founder) =>
            founder.capability === "vantare.plan.founders" &&
            founder.provider === "polar" &&
            founder.environment === environment &&
            founder.source_type === "order" &&
            !!row.source_id && founder.source_id === row.source_id &&
            founder.valid_until === null
          ))
      ) {
        return { ok: false };
      }
      current.perpetual = true;
    } else if (!current.paidThrough || paidThrough > current.paidThrough) {
      current.paidThrough = paidThrough;
    }
    grouped.set(row.capability, current);
  }
  const grants: CapabilityGrant[] = [];
  for (const key of [...grouped.keys()].sort()) {
    const value = grouped.get(key)!;
    if (value.perpetual) {
      grants.push({
        key,
        perpetual: true,
        ...(key === "vantare.edition.launch_v1"
          ? { scope_version: "launch_v1" }
          : {}),
      });
    } else if (value.paidThrough) {
      if (key === "vantare.edition.launch_v1") return { ok: false };
      grants.push({ key, paid_through: value.paidThrough.toISOString() });
    }
  }
  return {
    ok: true,
    grants,
    // Retain the field for installed clients; authority is only in the signature.
    onlineCapabilities: [],
  };
}

export async function signCredential(
  claims: LicenseClaims,
  keyId: string,
  privateKey: CryptoKey,
): Promise<OfflineCredential> {
  if (!keyId.trim()) throw new Error("key id is required");
  const payload = {
    version: CREDENTIAL_VERSION,
    algorithm: CREDENTIAL_ALGORITHM,
    key_id: keyId,
    claims,
  } as const;
  const signature = await crypto.subtle.sign(
    CREDENTIAL_ALGORITHM,
    privateKey,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return { ...payload, signature: toBase64URL(new Uint8Array(signature)) };
}

async function signWithEnvironmentKey(
  claims: LicenseClaims,
): Promise<OfflineCredential> {
  const keyId = Deno.env.get("OFFLINE_LICENSE_KEY_ID") ?? "";
  const encoded = Deno.env.get("OFFLINE_LICENSE_ED25519_PRIVATE_KEY") ?? "";
  const key = await crypto.subtle.importKey(
    "pkcs8",
    fromBase64URL(encoded),
    CREDENTIAL_ALGORITHM,
    false,
    ["sign"],
  );
  return signCredential(claims, keyId, key);
}

export function createCredentialStore(deps: NativeAuthDeps & {
  userClient?: SupabaseClient;
  admin?: SupabaseClient;
  resolve?: typeof resolveNativeAccount;
} = {}): CredentialStore {
  return {
    async load(token, fingerprint, environment) {
      const userClient = deps.userClient ?? (() => {
        const url = Deno.env.get("SUPABASE_URL") ?? "";
        const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
        if (!url || !anon) throw new Error("Supabase client is not configured");
        return createClient(url, anon, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
      })();
      // profiles_select_own authenticates via current_account without changing
      // the device. Only the account UUID is read before the blocking checks.
      const { data: profile, error: profileError, status: profileStatus } =
        await userClient.from("profiles").select("id").maybeSingle();
      if (profileError) {
        if (isCredentialAuthFailure(profileStatus, profileError)) {
          throw new CredentialAuthError();
        }
        throw profileError;
      }
      if (!profile || !isUuid(profile.id)) {
        throw new CredentialAuthError();
      }
      const accountId = profile.id;
      // PostgREST has now authenticated this exact bearer and resolved its UUID.
      // Decode only after that check, and bind the identity back to that UUID.
      // A native-data JWT is a session/data bearer, never an OAuth access token.
      const issuer = nativeConfig(deps).issuer;
      const parts = token.split(".");
      if (parts.length !== 3 || token.length > 16384) {
        throw new CredentialAuthError();
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(fromBase64URL(parts[1])),
        );
      } catch {
        throw new CredentialAuthError();
      }
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
        throw new CredentialAuthError();
      }
      const claims = decoded as Record<string, unknown>;
      // The data issuer is registered in SQL and may be the Supabase origin;
      // PostgREST/current_account already verified that registry and audience.
      const dataBearer = claims.vantare_identity_provider === "clerk" &&
        claims.aud === "vantare-native-data";
      const subject = dataBearer ? claims.clerk_subject : claims.sub;
      if (
        (dataBearer
          ? claims.clerk_issuer !== issuer || claims.sub !== accountId
          : claims.iss !== issuer || claims.clerk_subject !== undefined ||
            claims.clerk_issuer !== undefined) ||
        typeof subject !== "string" || !/^user_[A-Za-z0-9_]{27}$/.test(subject)
      ) throw new CredentialAuthError();
      const resolved = await (deps.resolve ?? resolveNativeAccount)(
        issuer,
        subject,
        deps.admin,
      );
      if (resolved !== accountId) {
        throw new CredentialAuthError();
      }
      await requireUnblocked(subject, deps);
      const { data: claimedAccount, error: claimError, status: claimStatus } =
        await userClient.rpc("claim_active_device", {
          device_fingerprint: fingerprint,
        });
      if (claimError) {
        if (isCredentialAuthFailure(claimStatus, claimError)) {
          throw new CredentialAuthError();
        }
        throw claimError;
      }
      if (claimedAccount !== accountId) throw new CredentialAuthError();
      const admin = deps.admin ?? getSupabaseAdmin();
      return await loadCredentialAccount(
        admin,
        accountId,
        fingerprint,
        environment,
      );
    },
  };
}

export function isCredentialAuthFailure(status: number, error: {
  code?: string;
  message?: string;
}): boolean {
  return status === 401 || status === 403 ||
    error.code === "28000" ||
    error.code === "PGRST301" || error.code === "PGRST302" ||
    error.message === "not_authenticated" ||
    error.message === "invalid_identity";
}

function fromBase64URL(value: string): ArrayBuffer {
  if (!value) throw new Error("private key is required");
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function toBase64URL(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll(
    "=",
    "",
  );
}

export type CredentialState = Awaited<ReturnType<CredentialStore["load"]>>;

export async function issueCredential(
  loaded: CredentialState,
  fingerprint: string,
  environment: BillingEnvironment,
  deps: Pick<CredentialDeps, "now" | "sign"> & { includeModules?: boolean } =
    {},
): Promise<Response> {
  if (!isUuid(loaded.accountId)) {
    return errorResponse(
      "invalid_account",
      "Authenticated account is invalid",
      401,
    );
  }
  const now = (deps.now ?? (() => new Date()))();
  const normalized = normalizeGrants(loaded.grants, now, environment);
  if (!normalized.ok) {
    return errorResponse(
      "invalid_license_state",
      "License state cannot be issued safely",
      409,
    );
  }
  // Wails/Go still verifies the v1 closed set; module grants are native-only.
  if (!deps.includeModules) {
    normalized.grants = normalized.grants.filter((grant) =>
      !MODULE_CAPABILITIES.some((key) => key === grant.key)
    );
  }
  const rollout = deps.includeModules ? loaded.moduleRollout ?? [] : [];
  if (
    rollout.some((row) =>
      !MODULE_CAPABILITIES.some((key) => key === row.module) ||
      typeof row.enabled_for_all !== "boolean"
    )
  ) {
    return errorResponse(
      "invalid_module_rollout",
      "Module rollout cannot be issued safely",
      409,
    );
  }
  for (const row of rollout) {
    if (
      row.enabled_for_all &&
      !normalized.grants.some((grant) => grant.key === row.module)
    ) {
      normalized.grants.push({ key: row.module, perpetual: true });
    }
  }
  const operational = normalizeOperationalAssignments(
    loaded.operationalAssignments ?? [],
    now,
  );
  if (!operational.ok) {
    return errorResponse(
      "invalid_operational_access",
      "Operational access cannot be issued safely",
      409,
    );
  }
  if (!loaded.deviceMatches) {
    return errorResponse(
      "device_limit",
      "License is active on another device",
      409,
    );
  }
  const claims: LicenseClaims = {
    issuer: CREDENTIAL_ISSUER,
    subject: loaded.accountId,
    device_fingerprint: fingerprint,
    issued_at: now.toISOString(),
    capabilities: [...normalized.grants, ...operational.grants].sort((a, b) =>
      a.key.localeCompare(b.key)
    ),
  };
  try {
    const credential = await (deps.sign ?? signWithEnvironmentKey)(claims);
    return jsonResponse(
      {
        credential,
        online_capabilities: normalized.onlineCapabilities,
      } satisfies CredentialResponse,
    );
  } catch {
    return errorResponse(
      "credential_signing_unavailable",
      "License credential cannot be issued",
      503,
    );
  }
}

export async function loadCredentialAccount(
  admin: SupabaseClient,
  accountId: string,
  fingerprint: string,
  environment: BillingEnvironment,
): Promise<CredentialState> {
  const { data: device, error: deviceError } = await admin
    .from("devices").select("fingerprint_hash").eq("user_id", accountId)
    .maybeSingle();
  if (deviceError) throw deviceError;
  const { data: grants, error: grantsError } = await admin
    .from("billing_effective_access_grants").select(
      "capability,valid_until,provider,environment,source_type,source_id",
    )
    .eq("user_id", accountId).eq("status", "active")
    .eq("environment", environment);
  if (grantsError) throw grantsError;
  const { data: operationalAssignments, error: operationalError } = await admin
    .from("operational_access_assignments").select(
      "role,expires_at,policy_version",
    ).eq("user_id", accountId).eq("status", "active");
  if (operationalError) throw operationalError;
  const { data: moduleRollout, error: rolloutError } = await admin
    .from("module_rollout").select("module,enabled_for_all");
  if (rolloutError) throw rolloutError;
  return {
    accountId,
    moduleRollout: moduleRollout ?? [],
    deviceMatches: device?.fingerprint_hash === fingerprint,
    grants: (grants ?? []) as StoredGrant[],
    operationalAssignments:
      (operationalAssignments ?? []) as StoredOperationalAssignment[],
  };
}
