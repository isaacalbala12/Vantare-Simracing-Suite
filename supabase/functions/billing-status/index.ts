import { type AuthResult, requireUserAuth } from "../_shared/auth.ts";
import { handleCorsPreflight } from "../_shared/cors.ts";
import { normalizeGrants } from "../_shared/license-credential.ts";
import { requirePolarEnvironment } from "../_shared/polar.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import type { BillingEnvironment } from "../_shared/mapping.ts";
export async function handleBillingStatus(request: Request, deps: {
  auth?: (request: Request) => Promise<AuthResult>;
  environment?: BillingEnvironment;
  load?: (account: string) => Promise<Parameters<typeof normalizeGrants>[0]>;
} = {}): Promise<Response> {
  const cors = handleCorsPreflight(request);
  if (cors) return cors;
  if (request.method !== "POST") {
    return errorResponse("method_not_allowed", "POST required", 405);
  }
  const auth = await (deps.auth ?? requireUserAuth)(request);
  if (!auth.ok) return auth.response;
  try {
    const rows = await (deps.load ?? (async (account) => {
      const { data, error } = await getSupabaseAdmin().from(
        "billing_effective_access_grants",
      ).select("capability,valid_until,provider,environment,source_type").eq(
        "user_id",
        account,
      ).eq("status", "active");
      if (error) throw new Error("billing_status_unavailable");
      return data ?? [];
    }))(auth.userId);
    const state = normalizeGrants(
      rows,
      new Date(),
      deps.environment ?? requirePolarEnvironment(),
    );
    if (!state.ok) throw new Error("billing_status_unavailable");
    return jsonResponse(
      {
        capabilities: [
          ...state.grants.map((grant) => grant.key),
          ...state.onlineCapabilities,
        ],
      },
      200,
      { "Cache-Control": "no-store" },
    );
  } catch {
    return errorResponse(
      "billing_status_unavailable",
      "Retry verification",
      503,
    );
  }
}
if (import.meta.main) Deno.serve((request) => handleBillingStatus(request));
