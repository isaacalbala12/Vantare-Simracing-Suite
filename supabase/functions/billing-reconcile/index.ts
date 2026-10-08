import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { loadPolarProductMap } from "../_shared/mapping.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import { type Cursor, type Page, reconcilePage, RESOURCES } from "./worker.ts";

export function serviceKeyMatches(provided: string, expected: string): boolean {
  if (!expected || !provided || provided.length !== expected.length) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
}

export async function handleReconciliation(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return errorResponse("method_not_allowed", "POST required", 405);
  }
  if (
    !serviceKeyMatches(
      req.headers.get("apikey") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )
  ) {
    return errorResponse("forbidden", "Server caller required", 403);
  }
  const map = loadPolarProductMap();
  const token = Deno.env.get("POLAR_ACCESS_TOKEN") ?? "";
  if (!map.ok || !token) {
    return errorResponse(
      "reconciliation_not_configured",
      "Reconciliation not configured",
      503,
    );
  }
  const environment = map.map.environment;
  const base = environment === "sandbox"
    ? "https://sandbox-api.polar.sh/v1"
    : "https://api.polar.sh/v1";
  const admin = getSupabaseAdmin();
  const lease = crypto.randomUUID();
  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_billing_reconciliation",
    {
      p_environment: environment,
      p_lease_token: lease,
    },
  );
  if (claimError) {
    return errorResponse(
      "reconciliation_unavailable",
      "Retry reconciliation",
      503,
    );
  }
  if (claimed === null) return jsonResponse({ busy: true }, 202);
  let cursor = claimed as Cursor;
  if (
    !RESOURCES.includes(cursor.resource) ||
    !Number.isSafeInteger(cursor.page) || cursor.page < 1
  ) {
    return errorResponse(
      "reconciliation_cursor_invalid",
      "Retry reconciliation",
      503,
    );
  }
  try {
    let observed = 0;
    let quarantined = 0;
    const started = Date.now();
    // Process multiple resources immediately; bounded work keeps the request
    // below the Edge runtime deadline. The durable cursor covers larger orgs.
    for (let pages = 0; pages < 8 && Date.now() - started < 45000; pages++) {
      const url = new URL(`${base}/${cursor.resource}/`);
      url.searchParams.set("organization_id", map.map.organization_id);
      url.searchParams.set("limit", "100");
      url.searchParams.set("page", String(cursor.page));
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("polar_reconciliation_unavailable");
      const body = await response.json();
      if (
        !Array.isArray(body.items) ||
        !body.items.every((item: unknown) =>
          item && typeof item === "object" && !Array.isArray(item)
        )
      ) {
        throw new Error("invalid_polar_page");
      }
      const maxPage = body.pagination?.max_page;
      if (
        !Number.isSafeInteger(maxPage) || maxPage < 0 ||
        (maxPage === 0 && body.items.length !== 0)
      ) {
        throw new Error("invalid_polar_pagination");
      }
      const page: Page = { items: body.items, maxPage: Math.max(1, maxPage) };
      const result = await reconcilePage({
        cursor,
        page,
        environment,
        supabase: admin,
      });
      const { data: completed, error } = await admin.rpc(
        "complete_billing_reconciliation",
        {
          p_environment: environment,
          p_lease_token: lease,
          p_next_resource: result.next.resource,
          p_next_page: result.next.page,
        },
      );
      if (error || completed !== true) {
        throw new Error("reconciliation_lease_lost");
      }
      observed += result.observed;
      quarantined += result.quarantined;
      cursor = result.next;
      if (cursor.resource === "orders" && cursor.page === 1) break;
    }
    const { data: released, error: releaseError } = await admin.rpc(
      "release_billing_reconciliation",
      {
        p_environment: environment,
        p_lease_token: lease,
        p_failed: false,
      },
    );
    if (releaseError || released !== true) {
      throw new Error("reconciliation_lease_lost");
    }
    return jsonResponse({ observed, quarantined, next: cursor });
  } catch {
    // Cursor remains unchanged. Automatic next invocation retries this page;
    // effects and snapshots are idempotent. Never log tokens or customer data.
    const { error: releaseError } = await admin.rpc(
      "release_billing_reconciliation",
      {
        p_environment: environment,
        p_lease_token: lease,
        p_failed: true,
      },
    );
    if (releaseError) {
      return errorResponse(
        "reconciliation_lease_release_failed",
        "Retry after lease expires",
        503,
      );
    }
    return errorResponse(
      "reconciliation_unavailable",
      "Retry reconciliation",
      503,
    );
  }
}
if (import.meta.main) Deno.serve((req) => handleReconciliation(req));
