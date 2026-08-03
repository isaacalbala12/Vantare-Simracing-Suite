import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type AuthResult, requireUserAuth } from "../_shared/auth.ts";
import { handleCorsPreflight } from "../_shared/cors.ts";
import { isUuid, readJsonObject } from "../_shared/request.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import type { BillingEnvironment } from "../_shared/mapping.ts";
import { requirePolarEnvironment } from "../_shared/polar.ts";

export const CREDENTIAL_VERSION = 1;
export const CREDENTIAL_ALGORITHM = "Ed25519";
export const CREDENTIAL_ISSUER = "vantare-license";

const KNOWN_CAPABILITIES = new Set([
  "vantare.channel.nightly",
  "vantare.channel.testers",
  "vantare.edition.launch_v1",
  "vantare.operational.nightly_tester",
  "vantare.operational.owner",
  "vantare.operational.tester",
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
};

export type StoredOperationalAssignment = {
  role: string;
  expires_at: string | null;
  policy_version: number;
};

export type CredentialStore = {
  load(
    userId: string,
    token: string,
    fingerprint: string,
    environment: BillingEnvironment,
  ): Promise<
    {
      deviceMatches: boolean;
      grants: StoredGrant[];
      operationalAssignments?: StoredOperationalAssignment[];
    }
  >;
};

export type CredentialDeps = {
  requireAuth?: (request: Request) => Promise<AuthResult>;
  store?: CredentialStore;
  now?: () => Date;
  environment?: BillingEnvironment;
  sign?: (claims: LicenseClaims) => Promise<OfflineCredential>;
};

export async function handleLicenseCredentialRequest(
  request: Request,
  deps: CredentialDeps = {},
): Promise<Response> {
  const cors = handleCorsPreflight(request);
  if (cors) return cors;
  if (request.method !== "POST") {
    return errorResponse("method_not_allowed", "Only POST is supported", 405);
  }
  const auth = await (deps.requireAuth ?? requireUserAuth)(request);
  if (!auth.ok) return auth.response;
  if (!isUuid(auth.userId)) {
    return errorResponse(
      "invalid_account",
      "Authenticated account is invalid",
      401,
    );
  }
  const parsed = await readJsonObject(request, 1024);
  if (!parsed.ok) return errorResponse(parsed.code, parsed.message, 400);
  if (Object.keys(parsed.value).some((key) => key !== "deviceFingerprint")) {
    return errorResponse(
      "unexpected_field",
      "Request contains an unsupported field",
      400,
    );
  }
  const fingerprint = typeof parsed.value.deviceFingerprint === "string"
    ? parsed.value.deviceFingerprint.trim()
    : "";
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
    return errorResponse(
      "invalid_device",
      "deviceFingerprint must be a SHA-256 hex value",
      400,
    );
  }

  let loaded;
  try {
    const environment = deps.environment ?? requirePolarEnvironment();
    loaded = await (deps.store ?? createCredentialStore()).load(
      auth.userId,
      auth.token,
      fingerprint,
      environment,
    );
    const now = (deps.now ?? (() => new Date()))();
    const normalized = normalizeGrants(loaded.grants, now, environment);
    if (!normalized.ok) {
      return errorResponse(
        "invalid_license_state",
        "License state cannot be issued safely",
        409,
      );
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
      subject: auth.userId,
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
  } catch {
    return errorResponse(
      "credential_state_unavailable",
      "License state is temporarily unavailable",
      503,
    );
  }
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
  const onlineCapabilities = new Set<string>();
  for (const row of rows) {
    // Legacy rows are retained for audit but are never credential authority.
    // Their explicit retirement is performed separately after a reviewed
    // per-account dry-run.
    if (row.provider === "legacy" && row.environment === "legacy") continue;
    if (!KNOWN_CAPABILITIES.has(row.capability)) return { ok: false };
    if (row.environment !== environment) return { ok: false };
    const isRecovery = row.provider === "vantare" &&
      row.source_type === "subscription_recovery";
    if (isRecovery) {
      if (
        row.valid_until === null ||
        row.capability === "vantare.edition.launch_v1"
      ) {
        return { ok: false };
      }
      const recoveryUntil = new Date(row.valid_until);
      if (!Number.isFinite(recoveryUntil.getTime())) return { ok: false };
      if (recoveryUntil > now) onlineCapabilities.add(row.capability);
      continue;
    }
    if (
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
        row.capability !== "vantare.channel.testers"
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
  for (const grant of grants) onlineCapabilities.delete(grant.key);
  return {
    ok: true,
    grants,
    onlineCapabilities: [...onlineCapabilities].sort(),
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

function createCredentialStore(): CredentialStore {
  return {
    async load(userId, token, fingerprint, environment) {
      const url = Deno.env.get("SUPABASE_URL") ?? "";
      const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      if (!url || !anon) throw new Error("Supabase client is not configured");
      const userClient = createClient(url, anon, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { error: claimError } = await userClient.rpc(
        "claim_active_device",
        {
          device_fingerprint: fingerprint,
        },
      );
      if (claimError) throw claimError;
      const admin = getSupabaseAdmin();
      const { data: device, error: deviceError } = await admin
        .from("devices").select("fingerprint_hash").eq("user_id", userId)
        .maybeSingle();
      if (deviceError) throw deviceError;
      const { data: grants, error: grantsError } = await admin
        .from("billing_access_grants").select(
          "capability,valid_until,provider,environment,source_type",
        )
        .eq("user_id", userId).eq("status", "active");
      if (grantsError) throw grantsError;
      const { data: operationalAssignments, error: operationalError } =
        await admin.from("operational_access_assignments").select(
          "role,expires_at,policy_version",
        ).eq("user_id", userId).eq("status", "active");
      if (operationalError) throw operationalError;
      return {
        deviceMatches: device?.fingerprint_hash === fingerprint,
        grants: (grants ?? []) as StoredGrant[],
        operationalAssignments:
          (operationalAssignments ?? []) as StoredOperationalAssignment[],
      };
    },
  };
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

if (import.meta.main) {
  Deno.serve((request) => handleLicenseCredentialRequest(request));
}
