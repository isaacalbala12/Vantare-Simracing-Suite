import prices from "../scripts/polar-launch-prices.json" with { type: "json" };
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { requirePolarEnvironment } from "../_shared/polar.ts";
import { serviceKeyMatches } from "../billing-reconcile/index.ts";
import {
  type DiscountClient,
  PolarDiscountClient,
  synchronizeDiscount,
} from "./polar.ts";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
type Operation = {
  id: string;
  subscription_id: string;
  product_id: string;
  discount_id: string | null;
  managed_discount_ids: (string | null)[];
  normal_cents: number;
  kind?: "apply" | "cleanup";
  renewal_token?: string;
  repair?: boolean;
  phase?: "pending" | "cleared";
};
export type PromotionDeps = {
  rpc: Rpc;
  client: DiscountClient;
  now: () => Date;
  enabled: () => boolean;
  environment: "sandbox" | "production";
};
export async function runPromotionBatch(
  deps: PromotionDeps,
  after: string | null = null,
) {
  const accounts = await deps.rpc("report_promotion_accounts", {
    p_environment: deps.environment,
    p_after: after,
  }) as string[];
  const started = deps.now().getTime();
  let cursor = after;
  let completed = 0;
  const failed: { account_id: string; code: string }[] = [];
  for (const account of accounts) {
    if (deps.now().getTime() - started >= 45000) {
      return { completed, failed, next_cursor: cursor };
    }
    if (!deps.enabled()) {
      return { completed, failed, disabled: true, next_cursor: cursor };
    }
    cursor = account;
    let operationId: string | null = null;
    let renewalToken: string | null = null;
    try {
      let operation = await deps.rpc("report_promotion_prepare", {
        p_account: account,
        p_environment: deps.environment,
        p_now: deps.now().toISOString(),
      }) as Operation | null;
      if (!operation) continue;
      operationId = operation.id;
      operation = await deps.rpc("report_promotion_renewal_prepare", {
        p_id: operation.id,
        p_creator_savings: Math.round(
          operation.normal_cents * prices.creator_discount_basis_points / 10000,
        ),
        p_creator_months: prices.creator_renewals.monthly_duration_months,
        p_now: deps.now().toISOString(),
      }) as Operation | null;
      if (!operation) continue;
      renewalToken = operation.renewal_token ?? null;
      const selectedOperation = operation;
      const token = crypto.randomUUID();
      const authorized = () =>
        deps.rpc("report_promotion_claim", {
          p_id: selectedOperation.id,
          p_token: token,
          p_now: deps.now().toISOString(),
        });
      if (!await authorized()) continue;
      // A second check is after the GET and immediately before PATCH. Neither a
      // tombstone nor kill switch observed here can lead to an external write.
      const client: DiscountClient = {
        read: async (id) => {
          const current = await deps.client.read(id);
          if (
            selectedOperation.kind !== "cleanup" &&
            typeof current.current_period_end === "string"
          ) {
            await deps.rpc("report_promotion_period", {
              p_account: account,
              p_environment: deps.environment,
              p_subscription: id,
              p_end: current.current_period_end,
            });
            if (!await authorized()) {
              throw new Error("promotion_not_authorized");
            }
          }
          return current;
        },
        change: async (id, discount) => {
          if (!deps.enabled() || !await authorized()) {
            throw new Error("promotion_not_authorized");
          }
          return deps.client.change(id, discount);
        },
      };
      let observedDiscount: string | null = null;
      let cleanupReason: string | null = null;
      await synchronizeDiscount(client, {
        subscriptionId: selectedOperation.subscription_id,
        productId: selectedOperation.product_id,
        discountId: selectedOperation.discount_id,
        managedDiscountIds: selectedOperation.managed_discount_ids,
        normalCents: selectedOperation.normal_cents,
        observed: (discount) => {
          observedDiscount = discount;
        },
        cleanup: selectedOperation.kind === "cleanup",
        skippedCleanup: (reason) => {
          cleanupReason = reason;
        },
        repair: selectedOperation.repair,
        phase: selectedOperation.phase,
        markCleared: async () => {
          if (
            !await deps.rpc("report_promotion_cleared", {
              p_id: selectedOperation.id,
              p_token: token,
              p_now: deps.now().toISOString(),
            })
          ) throw new Error("promotion_repair_lease_lost");
        },
      });
      if (
        await deps.rpc("report_promotion_ack", {
          p_observed_discount: observedDiscount,
          p_cleanup_reason: cleanupReason,
          p_id: selectedOperation.id,
          p_token: token,
          p_now: deps.now().toISOString(),
        })
      ) completed++;
    } catch (error) {
      if (operationId !== null) {
        try {
          await deps.rpc("report_promotion_renewal_failed", {
            p_id: operationId,
            p_token: renewalToken,
          });
        } catch {
          // The shared lease still expires; the existing failure record remains mandatory.
        }
      }
      const message = error instanceof Error ? error.message : "";
      const known = [
        "polar_discount_unmanaged",
        "polar_discount_catalog_mismatch",
        "polar_discount_subscription_changed",
        "polar_discount_not_applied",
        "polar_discount_invalid_response",
        "promotion_not_authorized",
        "promotion_repair_lease_lost",
        "creator_renewal_initial_pending",
        "creator_renewal_bridge_unconfigured",
        "creator_renewal_remainder_unconfigured",
        "creator_renewal_transfer_pending",
        "creator_renewal_plan_changed",
      ];
      const code = known.includes(message)
        ? message
        : /^polar_discount_http_[0-9]{3}$/.test(message)
        ? "polar_discount_http_failed"
        : "promotion_account_failed";
      let recorded = true;
      try {
        await deps.rpc("report_promotion_failed", {
          p_account: account,
          p_environment: deps.environment,
          p_code: code,
          p_now: deps.now().toISOString(),
        });
      } catch {
        recorded = false;
      }
      failed.push({
        account_id: account,
        code: recorded ? code : "promotion_failure_record_unavailable",
      });
    }
  }
  return {
    failed,
    completed,
    next_cursor: accounts.length === 50 ? accounts.at(-1) : null,
  };
}
export async function handleReportPromotion(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }
  if (
    !serviceKeyMatches(
      req.headers.get("apikey") ?? "",
      Deno.env.get("REPORT_PROMOTION_SECRET") ?? "",
    )
  ) return Response.json({ error: "forbidden" }, { status: 403 });
  if (Deno.env.get("REPORT_PROMOTION_ENABLED") !== "true") {
    return Response.json({ error: "promotion_disabled" }, { status: 503 });
  }
  const after = new URL(req.url).searchParams.get("after");
  if (
    after !== null &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      after,
    )
  ) return Response.json({ error: "invalid_cursor" }, { status: 400 });
  try {
    const environment = requirePolarEnvironment();
    const token = Deno.env.get("POLAR_ACCESS_TOKEN");
    if (!token) throw new Error("promotion_unconfigured");
    const admin = getSupabaseAdmin();
    const result = await runPromotionBatch({
      environment,
      client: new PolarDiscountClient(environment, token),
      now: () => new Date(),
      enabled: () => Deno.env.get("REPORT_PROMOTION_ENABLED") === "true",
      rpc: async (name, args) => {
        const { data, error } = await admin.rpc(name, args);
        if (error) {
          const known = [
            "creator_renewal_initial_pending",
            "creator_renewal_bridge_unconfigured",
            "creator_renewal_remainder_unconfigured",
            "creator_renewal_transfer_pending",
            "creator_renewal_plan_changed",
          ];
          throw new Error(
            known.includes(error.message)
              ? error.message
              : "promotion_store_unavailable",
          );
        }
        return data;
      },
    }, after);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "promotion_retry_required" }, {
      status: 503,
    });
  }
}
if (import.meta.main) Deno.serve(handleReportPromotion);
