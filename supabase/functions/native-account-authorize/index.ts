import {
  type NativeAuthDeps,
  nativeBearer,
  NativeError,
  requireUnblocked,
  resolveNativeAccount,
  verifyNativeOAuth,
} from "../_shared/native-auth.ts";
import { isUuid, readJsonObject } from "../_shared/request.ts";
import { jsonResponse } from "../_shared/responses.ts";

export type AuthorizeDeps = NativeAuthDeps & {
  resolve?: typeof resolveNativeAccount;
  signing?: { secret: string; supabaseUrl: string };
};

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(
    /\//g,
    "_",
  ).replace(/=+$/, "");
}

// WebCrypto supplies HS256; no JWT dependency or client-supplied claims/keys.
export async function signDataToken(
  accountId: string,
  now: Date,
  oauthExpiry: number,
  signing: NonNullable<AuthorizeDeps["signing"]>,
  identity?: { issuer: string; subject: string },
) {
  const url = new URL(signing.supabaseUrl);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  ) throw new NativeError(503, "bridge_unavailable");
  if (
    url.origin !== signing.supabaseUrl ||
    new TextEncoder().encode(signing.secret).length < 32 || !isUuid(accountId)
  ) {
    throw new NativeError(503, "bridge_unavailable");
  }
  const issued = Math.floor(now.getTime() / 1000);
  const expires = Math.min(issued + 300, Math.floor(oauthExpiry));
  if (expires <= issued) throw new NativeError(401, "unauthorized");
  const encoder = new TextEncoder();
  const header = base64url(
    encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const payload = base64url(encoder.encode(JSON.stringify({
    iss: `${url.origin}/auth/v1`,
    sub: accountId,
    aud: "authenticated",
    role: "authenticated",
    ...(identity
      ? {
        vantare_identity_provider: "clerk",
        clerk_issuer: identity.issuer,
        clerk_subject: identity.subject,
      }
      : {}),
    iat: issued,
    exp: expires,
  })));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signing.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${header}.${payload}`),
  );
  return {
    token: `${header}.${payload}.${base64url(new Uint8Array(signature))}`,
    expires,
  };
}

export async function handleNativeAccountAuthorize(
  request: Request,
  deps: AuthorizeDeps = {},
): Promise<Response> {
  const respond = (value: unknown, status = 200) =>
    jsonResponse(value, status, { "Cache-Control": "no-store" });
  try {
    if (request.method !== "POST") {
      throw new NativeError(405, "method_not_allowed");
    }
    const token = nativeBearer(request);
    if (
      request.headers.get("Content-Type")?.split(";")[0].trim()
        .toLowerCase() !== "application/json"
    ) throw new NativeError(400, "invalid_request");
    const parsed = await readJsonObject(request, 1024);
    if (!parsed.ok) {
      throw new NativeError(
        parsed.code === "body_too_large" ? 413 : 400,
        parsed.code === "body_too_large"
          ? "request_too_large"
          : "invalid_request",
      );
    }
    if (Object.keys(parsed.value).length !== 1 || parsed.value.version !== 1) {
      throw new NativeError(400, "invalid_request");
    }
    let identity;
    try {
      identity = await verifyNativeOAuth(token, deps);
    } catch (error) {
      // Wrong OAuth client/scopes is invalid authentication for this data route.
      if (error instanceof NativeError && error.status === 403) {
        throw new NativeError(401, "unauthorized");
      }
      throw error;
    }
    await requireUnblocked(identity.subject, deps);
    const accountId = await (deps.resolve ?? resolveNativeAccount)(
      identity.issuer,
      identity.subject,
    );
    const signed = await signDataToken(
      accountId,
      identity.now,
      identity.expiration,
      deps.signing ?? {
        secret: Deno.env.get("NATIVE_DATA_JWT_SECRET") ??
          Deno.env.get("SUPABASE_JWT_SECRET") ?? "",
        supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
      },
      identity,
    );
    return respond({
      version: 1,
      account_id: accountId,
      data_access_token: signed.token,
      expires_at: signed.expires,
    });
  } catch (error) {
    // Never log upstream errors, JWTs, OAuth tokens, names or account UUIDs.
    const failure = error instanceof NativeError
      ? error
      : new NativeError(503, "bridge_unavailable");
    return respond({
      error: failure.code,
      message: "Account authorization failed",
    }, failure.status);
  }
}

if (import.meta.main) {
  Deno.serve((request) => handleNativeAccountAuthorize(request));
}
