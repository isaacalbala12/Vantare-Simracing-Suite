import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type BillingEnvironment,
  type CheckoutKeyConfig,
  loadPolarProductMap,
  resolveCheckoutKeyByProductId,
} from "../_shared/mapping.ts";
import {
  type CommercialGrant,
  type CommercialProjection,
  hashCommercialSnapshot,
  SupabaseCommercialProjection,
} from "./commercial-projection.ts";
import {
  computeWebhookPayloadHash,
  createSupabaseWebhookInbox,
  sanitizeWebhookErrorCode,
  type WebhookInbox,
} from "./inbox.ts";

export const POLAR_PROVIDER = "polar";

export type PolarWebhookEvent = {
  type: string;
  data: Record<string, unknown>;
};

export type ProcessResult =
  | { status: "processed"; action: string }
  | { status: "ignored"; reason: string }
  | { status: "duplicate" }
  | {
    status: "deferred";
    reason: "processing";
    leaseExpiresAt: string;
  }
  | {
    status: "deferred";
    reason: "retry_scheduled";
    nextAttemptAt: string;
  }
  | { status: "quarantined"; reason: string };

type EffectRunner = (
  effectKey: string,
  action: () => Promise<void>,
) => Promise<void>;

export type WebhookProcessorDeps = {
  supabase: SupabaseClient;
  loadMap?: typeof loadPolarProductMap;
  now?: () => Date;
  inbox?: WebhookInbox;
  payloadHash?: string;
  workerToken?: () => string;
  runEffect?: EffectRunner;
  projection?: CommercialProjection;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePolarWebhookEvent(
  rawBody: string,
): PolarWebhookEvent | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      return null;
    }
    const data = isRecord(parsed.data) ? parsed.data : {};
    return { type: parsed.type, data };
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nestedRecord(
  value: unknown,
): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function extractExternalCustomerId(
  data: Record<string, unknown>,
): string | null {
  const direct = asString(data.external_customer_id);
  if (direct) return direct;

  const customer = nestedRecord(data.customer);
  if (customer) {
    const fromCustomer = asString(customer.external_id) ??
      asString(customer.external_customer_id);
    if (fromCustomer) return fromCustomer;
  }

  const metadata = nestedRecord(data.metadata);
  if (metadata) {
    const fromMeta = asString(metadata.user_id);
    if (fromMeta) return fromMeta;
  }

  return null;
}

export function extractProductId(data: Record<string, unknown>): string | null {
  const direct = asString(data.product_id);
  if (direct) return direct;

  const product = nestedRecord(data.product);
  if (product) {
    const fromProduct = asString(product.id);
    if (fromProduct) return fromProduct;
  }

  const metadata = nestedRecord(data.metadata);
  if (metadata) {
    const fromMeta = asString(metadata.product_id);
    if (fromMeta) return fromMeta;
  }

  return null;
}

export function extractPolarCustomerId(
  data: Record<string, unknown>,
): string | null {
  const direct = asString(data.customer_id);
  if (direct) return direct;

  const customer = nestedRecord(data.customer);
  if (customer) {
    const fromCustomer = asString(customer.id);
    if (fromCustomer) return fromCustomer;
  }

  return null;
}

export function extractSubscriptionId(
  data: Record<string, unknown>,
): string | null {
  return asString(data.id) ?? asString(data.subscription_id);
}

export function parseIsoTimestamp(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  return null;
}

async function applyEffect(
  deps: WebhookProcessorDeps,
  effectKey: string,
  action: () => Promise<void>,
): Promise<void> {
  if (deps.runEffect) {
    await deps.runEffect(effectKey, action);
    return;
  }
  await action();
}

function databaseWriteError(table: string, error: unknown): Error {
  const code = isRecord(error) && typeof error.code === "string" &&
      /^[A-Za-z0-9_]{1,32}$/.test(error.code)
    ? error.code
    : "unknown";
  return Object.assign(new Error(`${table} write failed (${code})`), {
    code: code.toLowerCase(),
  });
}

export async function resolveUserId(
  supabase: SupabaseClient,
  data: Record<string, unknown>,
  environment: BillingEnvironment,
): Promise<string | null> {
  const externalId = extractExternalCustomerId(data);
  if (externalId) return externalId;

  const polarCustomerId = extractPolarCustomerId(data);
  if (!polarCustomerId) return null;

  const { data: row, error } = await supabase
    .from("billing_customers")
    .select("user_id")
    .eq("provider", POLAR_PROVIDER)
    .eq("environment", environment)
    .eq("provider_customer_id", polarCustomerId)
    .maybeSingle();

  if (error) throw error;
  return asString(row?.user_id);
}

export async function recordWebhookEvent(
  supabase: SupabaseClient,
  eventType: string,
  idempotencyKey: string,
  userId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("license_events").insert({
    user_id: userId,
    event_type: eventType,
    idempotency_key: idempotencyKey,
    payload,
  });

  if (error?.code === "23505") return;
  if (error) throw error;
}

export async function upsertBillingCustomer(
  supabase: SupabaseClient,
  userId: string,
  providerCustomerId: string,
  environment: BillingEnvironment,
  metadata: Record<string, unknown>,
  nowIso: string,
): Promise<void> {
  const { error } = await supabase.from("billing_customers").upsert(
    {
      user_id: userId,
      provider: POLAR_PROVIDER,
      provider_customer_id: providerCustomerId,
      environment,
      metadata,
      updated_at: nowIso,
    },
    { onConflict: "user_id,provider,environment" },
  );
  if (error) throw databaseWriteError("billing_customers", error);
}

export async function upsertBillingSubscription(
  supabase: SupabaseClient,
  userId: string,
  subscriptionId: string,
  productId: string,
  status: string,
  periodStart: string | null,
  periodEnd: string | null,
  cancelAtPeriodEnd: boolean,
  checkoutKey: string,
  modifiedAt: string,
): Promise<void> {
  const { error } = await supabase.from("billing_subscriptions").upsert(
    {
      user_id: userId,
      provider: POLAR_PROVIDER,
      provider_subscription_id: subscriptionId,
      provider_product_id: productId,
      provider_price_id: null,
      status,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      metadata: { checkout_key: checkoutKey, derived: true },
      updated_at: modifiedAt,
    },
    { onConflict: "provider,provider_subscription_id" },
  );
  if (error) throw databaseWriteError("billing_subscriptions", error);
}

export function deriveSubscriptionEntitlementStatus(
  status: string,
  cancelAtPeriodEnd: boolean,
  periodEnd: string | null,
  now: Date,
): { status: string; expiresAt: string | null } {
  const normalized = status.toLowerCase();

  if (normalized === "past_due") {
    return { status: "past_due", expiresAt: periodEnd };
  }

  if (normalized === "canceled" || normalized === "cancelled") {
    if (cancelAtPeriodEnd && periodEnd && new Date(periodEnd) > now) {
      return { status: "active", expiresAt: periodEnd };
    }
    return { status: "expired", expiresAt: periodEnd ?? now.toISOString() };
  }

  if (normalized === "revoked") {
    return { status: "revoked", expiresAt: periodEnd ?? now.toISOString() };
  }

  if (
    normalized === "active" ||
    normalized === "trialing" ||
    normalized === "uncanceled"
  ) {
    return { status: "active", expiresAt: periodEnd };
  }

  return { status: "expired", expiresAt: periodEnd ?? now.toISOString() };
}

async function touchCustomerIfPresent(
  deps: WebhookProcessorDeps,
  userId: string,
  environment: BillingEnvironment,
  data: Record<string, unknown>,
  nowIso: string,
): Promise<void> {
  const providerCustomerId = extractPolarCustomerId(data);
  if (!providerCustomerId) return;

  await applyEffect(
    deps,
    "billing_customer",
    () =>
      upsertBillingCustomer(
        deps.supabase,
        userId,
        providerCustomerId,
        environment,
        {},
        nowIso,
      ),
  );
}

function extractResourceId(event: PolarWebhookEvent): string | null {
  if (event.type.startsWith("subscription.")) {
    return extractSubscriptionId(event.data);
  }
  return asString(event.data.id) ?? asString(event.data.order_id);
}

function resourceTypeForEvent(
  event: PolarWebhookEvent,
): "order" | "subscription" | null {
  if (event.type.startsWith("order.")) return "order";
  if (event.type.startsWith("subscription.")) return "subscription";
  return null;
}

function projectionState(
  event: PolarWebhookEvent,
  now: Date,
): { state: string; active: boolean; validUntil: string | null } {
  if (event.type === "order.paid") {
    return { state: "paid", active: true, validUntil: null };
  }
  if (event.type === "order.refunded") {
    return { state: "refunded", active: false, validUntil: now.toISOString() };
  }

  const state = asString(event.data.status) ??
    event.type.slice("subscription.".length);
  const periodEnd = parseIsoTimestamp(event.data.current_period_end);
  const derived = deriveSubscriptionEntitlementStatus(
    state,
    event.data.cancel_at_period_end === true,
    periodEnd,
    now,
  );
  return {
    state,
    active: derived.status === "active",
    validUntil: derived.expiresAt,
  };
}

function grantsForConfig(
  config: CheckoutKeyConfig,
  active: boolean,
  validUntil: string | null,
): CommercialGrant[] {
  return config.capabilities.map((capability) => ({
    capability,
    status: active ? "active" : "revoked",
    validUntil,
  }));
}

export async function applyPolarWebhookEvent(
  event: PolarWebhookEvent,
  deps: WebhookProcessorDeps,
): Promise<ProcessResult> {
  const loadMap = deps.loadMap ?? loadPolarProductMap;
  const mapping = loadMap();
  if (!mapping.ok) {
    throw new Error(mapping.message);
  }

  const now = deps.now?.() ?? new Date();
  const nowIso = now.toISOString();
  const environment = mapping.map.environment;
  const userId = await resolveUserId(deps.supabase, event.data, environment);

  const productId = extractProductId(event.data);
  if (!productId) {
    return { status: "ignored", reason: "missing_product_id" };
  }

  const resolved = resolveCheckoutKeyByProductId(mapping.map, productId);
  if (!resolved.ok) {
    return { status: "ignored", reason: "unknown_product_id" };
  }

  if (!userId) {
    return { status: "ignored", reason: "unresolved_user_id" };
  }

  const resourceType = resourceTypeForEvent(event);
  if (!resourceType) {
    return { status: "ignored", reason: "unsupported_event_type" };
  }
  if (resourceType === "order" && resolved.key !== "launch_lifetime") {
    return {
      status: "ignored",
      reason: event.type === "order.refunded"
        ? "refund_not_lifetime_product"
        : "order_paid_not_lifetime",
    };
  }
  if (resourceType === "subscription" && resolved.key !== "pro_monthly") {
    return { status: "ignored", reason: "subscription_not_monthly" };
  }
  if (
    ![
      "order.paid",
      "order.refunded",
      "subscription.created",
      "subscription.active",
      "subscription.updated",
      "subscription.canceled",
      "subscription.past_due",
      "subscription.revoked",
    ].includes(event.type)
  ) {
    return { status: "ignored", reason: "unsupported_event_type" };
  }

  const resourceId = extractResourceId(event);
  if (!resourceId) {
    return { status: "ignored", reason: "missing_resource_id" };
  }
  const modifiedAt = parseIsoTimestamp(
    event.data.modified_at ?? event.data.updated_at,
  );
  if (!modifiedAt || !Number.isFinite(Date.parse(modifiedAt))) {
    return { status: "ignored", reason: "missing_resource_modified_at" };
  }

  const projected = projectionState(event, now);
  const grants = grantsForConfig(
    resolved.config,
    projected.active,
    projected.validUntil,
  );
  const snapshotWithoutHash = {
    provider: "polar" as const,
    environment,
    resourceType,
    resourceId,
    userId,
    modifiedAt: new Date(modifiedAt).toISOString(),
    state: projected.state,
    grants,
  };
  const snapshotHash = await hashCommercialSnapshot(snapshotWithoutHash);
  const projection = deps.projection ??
    new SupabaseCommercialProjection(deps.supabase);
  const result = await projection.apply({
    ...snapshotWithoutHash,
    snapshotHash,
  });

  if (result.outcome === "version_conflict") {
    return { status: "ignored", reason: "resource_version_conflict" };
  }
  if (result.outcome === "stale_noop") {
    return { status: "processed", action: "stale_noop" };
  }

  await touchCustomerIfPresent(deps, userId, environment, event.data, nowIso);
  if (resourceType === "subscription") {
    await applyEffect(
      deps,
      "billing_subscription_read_model",
      () =>
        upsertBillingSubscription(
          deps.supabase,
          userId,
          resourceId,
          productId,
          projected.state,
          parseIsoTimestamp(event.data.current_period_start),
          parseIsoTimestamp(event.data.current_period_end),
          event.data.cancel_at_period_end === true,
          resolved.key,
          snapshotWithoutHash.modifiedAt,
        ),
    );
  }
  if (result.outcome === "duplicate") {
    return { status: "processed", action: "resource_duplicate" };
  }
  if (event.type === "order.paid") {
    return { status: "processed", action: "granted_lifetime_bundle" };
  }
  if (event.type === "order.refunded") {
    return { status: "processed", action: "revoked_lifetime_bundle" };
  }
  if (event.type === "subscription.revoked") {
    return { status: "processed", action: "revoked_monthly_revoked" };
  }
  return { status: "processed", action: "updated_monthly_bundle" };
}

const REPLAY_DATA_KEYS = [
  "external_customer_id",
  "product_id",
  "customer_id",
  "id",
  "order_id",
  "subscription_id",
  "modified_at",
  "updated_at",
  "status",
  "current_period_start",
  "current_period_end",
  "cancel_at_period_end",
] as const;

function pickReplayFields(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const value = source[key];
    if (
      typeof value === "string" || typeof value === "number" ||
      typeof value === "boolean"
    ) result[key] = value;
  }
  return result;
}

export function minimizePolarWebhookEvent(
  event: PolarWebhookEvent,
): PolarWebhookEvent {
  const data = pickReplayFields(event.data, REPLAY_DATA_KEYS);
  const customer = nestedRecord(event.data.customer);
  if (customer) {
    data.customer = pickReplayFields(customer, [
      "id",
      "external_id",
      "external_customer_id",
    ]);
  }
  const product = nestedRecord(event.data.product);
  if (product) data.product = pickReplayFields(product, ["id"]);
  const metadata = nestedRecord(event.data.metadata);
  if (metadata) {
    data.metadata = pickReplayFields(metadata, ["user_id", "product_id"]);
  }
  return { type: event.type, data };
}

function storedPolarWebhookEvent(
  payload: Record<string, unknown>,
): PolarWebhookEvent {
  const type = asString(payload.type);
  const data = nestedRecord(payload.data);
  if (!type || !data) throw new Error("invalid_stored_webhook_payload");
  return { type, data };
}

function quarantineReason(result: ProcessResult): string | null {
  if (result.status !== "ignored") return null;
  return [
      "missing_product_id",
      "unknown_product_id",
      "unresolved_user_id",
      "order_paid_not_lifetime",
      "subscription_not_monthly",
      "refund_not_lifetime_product",
      "missing_resource_id",
      "missing_resource_modified_at",
      "resource_version_conflict",
    ].includes(result.reason)
    ? result.reason
    : null;
}

function createEffectRunner(
  inbox: WebhookInbox,
  inboxId: string,
  leaseToken: string,
): EffectRunner {
  return async (effectKey, action) => {
    const claim = await inbox.claimEffect(inboxId, effectKey, leaseToken);
    if (claim === "completed") return;
    if (claim === "busy") throw { code: "effect_busy" };
    try {
      await action();
      await inbox.completeEffect(inboxId, effectKey, leaseToken);
    } catch (error) {
      await inbox.failEffect(
        inboxId,
        effectKey,
        leaseToken,
        sanitizeWebhookErrorCode(error),
      );
      throw error;
    }
  };
}

async function processClaimedWebhook(
  inbox: WebhookInbox,
  inboxId: string,
  leaseToken: string,
  event: PolarWebhookEvent,
  webhookId: string,
  deps: WebhookProcessorDeps,
): Promise<ProcessResult> {
  const runEffect = createEffectRunner(inbox, inboxId, leaseToken);
  const processingDeps = { ...deps, runEffect };
  try {
    const result = await applyPolarWebhookEvent(event, processingDeps);
    const unsafeReason = quarantineReason(result);
    if (unsafeReason) {
      await inbox.quarantine(inboxId, leaseToken, unsafeReason);
      return { status: "quarantined", reason: unsafeReason };
    }

    await runEffect("license_event_audit", async () => {
      const loadMap = deps.loadMap ?? loadPolarProductMap;
      const mapping = loadMap();
      if (!mapping.ok) throw new Error(mapping.message);
      const environment = mapping.map.environment;
      await recordWebhookEvent(
        deps.supabase,
        event.type,
        webhookId,
        await resolveUserId(deps.supabase, event.data, environment),
        {
          provider: POLAR_PROVIDER,
          provider_event_id: webhookId,
          raw_type: event.type,
          environment,
          outcome: result.status,
          action: result.status === "processed" ? result.action : null,
          reason: result.status === "ignored" ? result.reason : null,
        },
      );
    });
    await inbox.complete(inboxId, leaseToken);
    return result;
  } catch (error) {
    await inbox.fail(
      inboxId,
      leaseToken,
      sanitizeWebhookErrorCode(error),
    );
    throw error;
  }
}

async function claimAndProcessWebhook(
  inbox: WebhookInbox,
  inboxId: string,
  deps: WebhookProcessorDeps,
): Promise<ProcessResult> {
  const leaseToken = deps.workerToken?.() ?? crypto.randomUUID();
  const claim = await inbox.claim(inboxId, leaseToken);
  if (claim.status === "processed") return { status: "duplicate" };
  if (claim.status === "quarantined") {
    return { status: "quarantined", reason: "existing_quarantine" };
  }
  if (claim.status === "busy") {
    return {
      status: "deferred",
      reason: "processing",
      leaseExpiresAt: claim.leaseExpiresAt,
    };
  }
  if (claim.status === "retry_scheduled") {
    return {
      status: "deferred",
      reason: "retry_scheduled",
      nextAttemptAt: claim.nextAttemptAt,
    };
  }
  if (claim.status !== "claimed") throw new Error("invalid_webhook_claim");
  const event = storedPolarWebhookEvent(claim.item.payload);
  return await processClaimedWebhook(
    inbox,
    claim.item.id,
    leaseToken,
    event,
    claim.item.eventId,
    deps,
  );
}

export async function processPolarWebhookEvent(
  event: PolarWebhookEvent,
  webhookId: string,
  deps: WebhookProcessorDeps,
): Promise<ProcessResult> {
  const inbox = deps.inbox ?? createSupabaseWebhookInbox(deps.supabase);
  const payload = minimizePolarWebhookEvent(event);
  const payloadHash = deps.payloadHash ?? await computeWebhookPayloadHash(
    JSON.stringify(event),
  );
  const receipt = await inbox.receive({
    provider: POLAR_PROVIDER,
    eventId: webhookId,
    eventType: event.type,
    payloadHash,
    payload,
  });
  if (!receipt.payloadMatches) {
    return { status: "quarantined", reason: "payload_hash_mismatch" };
  }
  if (receipt.status === "processed") return { status: "duplicate" };
  if (receipt.status === "quarantined") {
    return { status: "quarantined", reason: "existing_quarantine" };
  }
  return await claimAndProcessWebhook(inbox, receipt.id, deps);
}

export async function replayPolarWebhookInboxItem(
  inboxId: string,
  actorId: string,
  reasonCode: string,
  deps: WebhookProcessorDeps,
): Promise<ProcessResult> {
  const inbox = deps.inbox ?? createSupabaseWebhookInbox(deps.supabase);
  await inbox.replay(inboxId, actorId, reasonCode);
  return await claimAndProcessWebhook(inbox, inboxId, deps);
}
