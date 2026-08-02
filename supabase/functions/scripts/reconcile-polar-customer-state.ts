import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadPolarProductMap } from "../_shared/mapping.ts";
import { getPolarCustomerStateByExternalId } from "../_shared/polar.ts";
import {
  buildReconciliationPlan,
  executeReconciliation,
  type LocalCommercialResource,
  type ReconciliationTargetSource,
  runReconciliationBatch,
  SupabaseReconciliationStore,
} from "../billing-webhook/reconciliation.ts";
import { SupabaseSubscriptionLifecycleStore } from "../billing-webhook/subscription-lifecycle-store.ts";

const apply = Deno.args.includes("--apply");
const trigger = argument("--trigger") ?? "manual";
if (trigger !== "manual" && trigger !== "scheduled") {
  throw new Error("--trigger must be manual or scheduled");
}
const environment = argument("--environment") ??
  Deno.env.get("POLAR_ENVIRONMENT") ?? "";
if (environment !== "sandbox" && environment !== "production") {
  throw new Error("POLAR_ENVIRONMENT must be sandbox or production");
}
const mapping = loadPolarProductMap(Deno.env.get("POLAR_PRODUCT_MAP"), {
  environment,
});
if (!mapping.ok) throw new Error(mapping.message);
const productMap = mapping.map;

const supabaseUrl = requiredEnv("SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const store = new SupabaseReconciliationStore(supabase);
const lifecycle = new SupabaseSubscriptionLifecycleStore(supabase);
const controller = new AbortController();
addEventListener("unload", () => controller.abort());
const summary = {
  processed: 0,
  dryRun: 0,
  applied: 0,
  unchanged: 0,
  quarantined: 0,
};

const source: ReconciliationTargetSource = {
  async listPage({ cursor, limit }) {
    const offset = cursor ? Number(cursor) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new Error("invalid_cursor");
    }
    const { data, error } = await supabase
      .from("billing_customers")
      .select("user_id")
      .eq("provider", "polar")
      .eq("environment", environment)
      .order("user_id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new Error("could_not_list_reconciliation_targets");
    const targets = (data ?? []).map((row) => ({
      userId: String(row.user_id),
      externalId: String(row.user_id),
    }));
    return {
      targets,
      nextCursor: targets.length === limit ? String(offset + limit) : null,
    };
  },
};

await runReconciliationBatch({
  source,
  signal: controller.signal,
  reconcile: async (target) => {
    const customerState = await getPolarCustomerStateByExternalId(
      target.externalId,
      environment,
      { signal: controller.signal },
    );
    const localResources = await readLocalResources(target.userId);
    const plan = await buildReconciliationPlan({
      userId: target.userId,
      customerState,
      localResources,
      productMap,
      benefitCapabilities: benefitCapabilities(),
    });
    const result = await executeReconciliation({
      plan,
      dryRun: !apply,
      trigger,
      store,
      lifecycle,
    });
    summary.processed++;
    if (result.status === "dry_run") summary.dryRun++;
    else summary[result.status]++;
  },
});

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  trigger,
  environment,
  ...summary,
}));

async function readLocalResources(
  userId: string,
): Promise<LocalCommercialResource[]> {
  const [{ data: resources, error: resourceError }, {
    data: grants,
    error: grantsError,
  }, {
    data: subscriptions,
    error: subscriptionsError,
  }] = await Promise.all([
    supabase.from("billing_commercial_resources")
      .select("resource_type,resource_id,remote_modified_at,remote_state")
      .eq("user_id", userId)
      .eq("provider", "polar")
      .eq("environment", environment),
    supabase.from("billing_access_grants")
      .select("source_type,source_id,capability,status")
      .eq("user_id", userId)
      .eq("provider", "polar")
      .eq("environment", environment),
    supabase.from("billing_subscriptions")
      .select(
        "provider_subscription_id,provider_product_id,status,current_period_start,paid_through,cancel_at_period_end",
      )
      .eq("user_id", userId)
      .eq("provider", "polar")
      .eq("environment", environment),
  ]);
  if (resourceError || grantsError || subscriptionsError) {
    throw new Error("could_not_read_local_projection");
  }
  return (resources ?? []).map((resource) => {
    const matchingGrants = (grants ?? []).filter((grant) =>
      grant.source_type === resource.resource_type &&
      grant.source_id === resource.resource_id
    );
    const subscription = resource.resource_type === "subscription"
      ? (subscriptions ?? []).find((candidate) =>
        candidate.provider_subscription_id === resource.resource_id
      )
      : null;
    return {
      resourceType: resource.resource_type,
      resourceId: resource.resource_id,
      productId: subscription?.provider_product_id ?? inferProductId(
        matchingGrants.map((grant) => grant.capability),
      ),
      capabilities: matchingGrants.map((grant) => String(grant.capability))
        .sort(),
      modifiedAt: resource.remote_modified_at,
      status: matchingGrants.some((grant) => grant.status === "active")
        ? "active"
        : "revoked",
      subscriptionStatus: subscription?.status,
      periodStart: subscription?.current_period_start ?? null,
      paidThrough: subscription?.paid_through ?? null,
      cancelAtPeriodEnd: subscription?.cancel_at_period_end === true,
    } as LocalCommercialResource;
  });
}

function inferProductId(capabilities: string[]): string | null {
  for (const config of Object.values(productMap.checkout_keys)) {
    if (
      config && config.capabilities.length === capabilities.length &&
      config.capabilities.every((capability) =>
        capabilities.includes(capability)
      )
    ) return config.polar_product_id;
  }
  return null;
}

function benefitCapabilities(): Record<string, string[]> {
  const raw = Deno.env.get("POLAR_BENEFIT_CAPABILITIES");
  if (!raw?.trim()) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("POLAR_BENEFIT_CAPABILITIES is invalid");
  }
  for (const capabilities of Object.values(value)) {
    if (
      !Array.isArray(capabilities) ||
      capabilities.some((item) => typeof item !== "string")
    ) {
      throw new Error("POLAR_BENEFIT_CAPABILITIES is invalid");
    }
  }
  return value as Record<string, string[]>;
}

function argument(name: string): string | null {
  const index = Deno.args.indexOf(name);
  return index >= 0 ? Deno.args[index + 1] ?? null : null;
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
