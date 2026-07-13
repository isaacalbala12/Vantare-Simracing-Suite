import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { errorResponse } from "./responses.ts";

export type AuthSuccess = {
  ok: true;
  token: string;
  userId: string;
  email: string | null;
};

export type AuthFailure = {
  ok: false;
  response: Response;
};

export type AuthResult = AuthSuccess | AuthFailure;

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Validates Supabase JWT from Authorization header.
 * Requires SUPABASE_URL and SUPABASE_ANON_KEY in the function environment.
 */
export async function requireUserAuth(req: Request): Promise<AuthResult> {
  const token = extractBearerToken(req);
  if (!token) {
    return {
      ok: false,
      response: errorResponse("unauthorized", "Authorization Bearer token required", 401),
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      response: errorResponse(
        "auth_not_configured",
        "SUPABASE_URL and SUPABASE_ANON_KEY are required",
        500,
      ),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return {
      ok: false,
      response: errorResponse("unauthorized", "Invalid or expired token", 401),
    };
  }

  return {
    ok: true,
    token,
    userId: user.id,
    email: user.email ?? null,
  };
}

/** Test helper: presence-only Bearer check without Supabase round-trip. */
export function requireBearerPresent(req: Request): AuthResult {
  const token = extractBearerToken(req);
  if (!token) {
    return {
      ok: false,
      response: errorResponse("unauthorized", "Authorization Bearer token required", 401),
    };
  }
  return {
    ok: true,
    token,
    userId: "test-user-id",
    email: "test@example.com",
  };
}