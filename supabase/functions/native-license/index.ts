import {
  type CredentialDeps,
  type CredentialState,
  issueCredential,
  loadCredentialAccount,
} from "../_shared/license-credential.ts";
import type { BillingEnvironment } from "../_shared/mapping.ts";
import { requirePolarEnvironment } from "../_shared/polar.ts";
import { readJsonObject } from "../_shared/request.ts";
import { jsonResponse } from "../_shared/responses.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

import {
  type NativeConfig,
  NativeError,
  requireUnblocked,
  verifyNativeOAuth,
} from "../_shared/native-auth.ts";

export type NativeLicenseDeps = Pick<CredentialDeps, "now" | "sign"> & {
  config?: NativeConfig;
  fetch?: typeof fetch;
  environment?: BillingEnvironment;
  load?: (
    issuer: string,
    subject: string,
    fingerprint: string,
  ) => Promise<CredentialState>;
};

function failure(status: number, error: string, message: string): Response {
  return jsonResponse({ error, message }, status, {
    "Cache-Control": "no-store",
  });
}

function unavailable(): Response {
  return failure(503, "bridge_unavailable", "License bridge is unavailable");
}

export async function handleNativeLicenseRequest(
  request: Request,
  deps: NativeLicenseDeps = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return failure(405, "method_not_allowed", "Only POST is supported");
  }
  const token = /^Bearer ([^\s]+)$/i.exec(
    request.headers.get("Authorization") ?? "",
  )?.[1];
  if (!token) {
    return failure(401, "unauthorized", "OAuth access token required");
  }
  if (new TextEncoder().encode(token).length > 16 * 1024) {
    return failure(413, "request_too_large", "Authorization is too large");
  }
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
      "application/json"
  ) {
    return failure(400, "invalid_request", "JSON request required");
  }

  try {
    const parsed = await readJsonObject(request, 1024);
    if (!parsed.ok) {
      return parsed.code === "body_too_large"
        ? failure(413, "request_too_large", "Request body is too large")
        : failure(400, "invalid_request", "Invalid JSON request");
    }
    const { version, deviceFingerprint } = parsed.value;
    if (
      Object.keys(parsed.value).length !== 2 || version !== 1 ||
      typeof deviceFingerprint !== "string" ||
      !/^[0-9a-f]{64}$/.test(deviceFingerprint)
    ) {
      return failure(400, "invalid_request", "Invalid license request");
    }

    const verified = await verifyNativeOAuth(token, deps);
    const { issuer, now } = verified;
    await requireUnblocked(verified.subject, deps);

    const loaded = await (deps.load ?? loadNativeCredentialAccount)(
      issuer,
      verified.subject,
      deviceFingerprint,
    );
    const response = await issueCredential(
      loaded,
      deviceFingerprint,
      deps.environment ?? requirePolarEnvironment(),
      { ...deps, now: () => now, includeModules: true },
    );
    if (response.status === 409) {
      const body = await response.json();
      return body.error === "device_limit"
        ? failure(409, "device_limit", "License is active on another device")
        : failure(
          409,
          "account_conflict",
          "Account state cannot be issued safely",
        );
    }
    if (response.status !== 200) return unavailable();
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof NativeError) {
      return failure(error.status, error.code, "OAuth authorization failed");
    }

    if (
      error && typeof error === "object" && "message" in error &&
      error.message === "account_conflict"
    ) {
      return failure(
        409,
        "account_conflict",
        "Account identity is conflicting",
      );
    }
    // Upstream errors can contain tokens, PII or internal UUIDs. Do not log them.
    return unavailable();
  }
}

async function loadNativeCredentialAccount(
  issuer: string,
  subject: string,
  fingerprint: string,
): Promise<CredentialState> {
  const admin = getSupabaseAdmin();
  const { data: accountId, error } = await admin.rpc(
    "native_claim_license_device",
    {
      issuer,
      subject,
      device_fingerprint: fingerprint,
    },
  );
  if (error) throw error;
  if (typeof accountId !== "string") throw new Error("Invalid account result");
  const state = await loadCredentialAccount(admin, accountId, fingerprint);
  const { data, error: rolloutError } = await admin.from("module_rollout")
    .select("module,enabled_for_all");
  if (rolloutError) throw rolloutError;
  return { ...state, moduleRollout: data ?? [] };
}

if (import.meta.main) {
  Deno.serve((request) => handleNativeLicenseRequest(request));
}
