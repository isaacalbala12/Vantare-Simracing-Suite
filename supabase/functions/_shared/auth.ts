import { isUuid } from "./request.ts";
import { errorResponse } from "./responses.ts";

export type AuthSuccess = {
  ok: true;
  token: string;
  userId: string;
  email: string | null;
};
export type AuthFailure = { ok: false; response: Response };
export type AuthResult = AuthSuccess | AuthFailure;
export type AuthDeps = {
  fetch?: typeof fetch;
  config?: { supabaseUrl: string; publishableKey: string };
};

function extractBearerToken(req: Request): string | null {
  return /^Bearer ([^\s]{1,16384})$/i.exec(
    req.headers.get("Authorization") ?? "",
  )?.[1] ?? null;
}

// PostgREST validates the asymmetric Clerk session through official TPA.
// The RPC validates issuer/session claims and returns Vantare's UUID; neither
// decoded claims nor Supabase Auth/getUser are an identity authority here.
export async function requireUserAuth(
  req: Request,
  deps: AuthDeps = {},
): Promise<AuthResult> {
  const token = extractBearerToken(req);
  const failure = (code: string, status: number): AuthFailure => ({
    ok: false,
    response: errorResponse(code, code, status),
  });
  if (!token) return failure("unauthorized", 401);
  const config = deps.config ?? {
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    publishableKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  };
  if (!config.supabaseUrl || !config.publishableKey) {
    return failure("auth_not_configured", 503);
  }
  try {
    const response = await (deps.fetch ?? fetch)(
      `${
        config.supabaseUrl.replace(/\/$/, "")
      }/rest/v1/rpc/clerk_bootstrap_account`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: config.publishableKey,
          "Content-Type": "application/json",
        },
        body: "{}",
        redirect: "error",
        signal: AbortSignal.timeout(4000),
      },
    );
    if ([400, 401, 403].includes(response.status)) {
      return failure("unauthorized", 401);
    }
    if (!response.ok) return failure("identity_unavailable", 503);
    const userId: unknown = await response.json();
    if (!isUuid(userId)) return failure("identity_unavailable", 503);
    return { ok: true, token, userId, email: null };
  } catch {
    // An unavailable authority never becomes an anonymous or cached identity.
    return failure("identity_unavailable", 503);
  }
}

/** Test helper, never used by productive handlers. */
export function requireBearerPresent(req: Request): AuthResult {
  const token = extractBearerToken(req);
  return token
    ? { ok: true, token, userId: "test-user-id", email: "test@example.com" }
    : {
      ok: false,
      response: errorResponse("unauthorized", "Bearer token required", 401),
    };
}
