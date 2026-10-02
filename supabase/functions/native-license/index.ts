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

type NativeConfig = {
  secretKey: string;
  clientId: string;
  issuer: string;
  anonKey: string;
};

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

    const config = deps.config ?? {
      secretKey: Deno.env.get("CLERK_SECRET_KEY") ?? "",
      clientId: Deno.env.get("CLERK_NATIVE_CLIENT_ID") ?? "",
      issuer: Deno.env.get("CLERK_ISSUER") ?? "",
      anonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    };
    const issuer = config.issuer.replace(/\/$/, "");
    if (
      !config.secretKey || !config.clientId || !config.anonKey ||
      !issuer || new URL(issuer).protocol !== "https:" ||
      new URL(issuer).origin !== issuer
    ) return unavailable();
    if (request.headers.get("apikey") !== config.anonKey) {
      return failure(401, "unauthorized", "Valid API key required");
    }

    // Official Clerk verification works for opaque and JWT OAuth access tokens.
    // Never decode client claims or use userinfo/email as identity authority.
    const verification = await (deps.fetch ?? fetch)(
      "https://api.clerk.com/oauth_applications/access_tokens/verify",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: token }),
        redirect: "error",
        signal: AbortSignal.timeout(4000),
      },
    );
    if (verification.status === 429) {
      return failure(429, "rate_limited", "Try again later");
    }
    if ([400, 404].includes(verification.status)) {
      return failure(401, "unauthorized", "Invalid OAuth access token");
    }
    // Clerk 401/403 concerns our server secret, not the caller's access token.
    if (!verification.ok) return unavailable();
    const verified: unknown = await verification.json();
    if (!verified || typeof verified !== "object" || Array.isArray(verified)) {
      return unavailable();
    }
    const claims = verified as Record<string, unknown>;
    if (
      claims.active === false || claims.revoked === true ||
      claims.expired === true
    ) {
      return failure(
        401,
        "unauthorized",
        "Invalid or expired OAuth access token",
      );
    }
    if (
      claims.object !== "clerk_idp_oauth_access_token" ||
      typeof claims.client_id !== "string" ||
      typeof claims.subject !== "string" ||
      !Array.isArray(claims.scopes) ||
      !claims.scopes.every((scope) => typeof scope === "string") ||
      claims.revoked !== false || claims.expired !== false ||
      typeof claims.expiration !== "number" ||
      !Number.isFinite(claims.expiration)
    ) return unavailable();
    const now = (deps.now ?? (() => new Date()))();
    if (claims.expiration <= now.getTime() / 1000) {
      return failure(401, "unauthorized", "Expired OAuth access token");
    }
    const scopes = claims.scopes;
    if (
      claims.client_id !== config.clientId ||
      !/^user_[A-Za-z0-9_]{27}$/.test(claims.subject) ||
      !["openid", "profile"].every((scope) => scopes.includes(scope))
    ) return failure(403, "forbidden", "OAuth access is not authorized");

    const loaded = await (deps.load ?? loadNativeCredentialAccount)(
      issuer,
      claims.subject,
      deviceFingerprint,
    );
    const response = await issueCredential(
      loaded,
      deviceFingerprint,
      deps.environment ?? requirePolarEnvironment(),
      { ...deps, now: () => now },
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
  return await loadCredentialAccount(admin, accountId, fingerprint);
}

if (import.meta.main) {
  Deno.serve((request) => handleNativeLicenseRequest(request));
}
