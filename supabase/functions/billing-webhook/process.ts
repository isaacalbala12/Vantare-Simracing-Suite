import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type BillingEnvironment,
  type CheckoutKeyConfig,
  loadPolarProductMap,
  type PolarProductMap,
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
import { deriveSubscriptionTransition } from "./subscription-lifecycle.ts";
import {
  type SubscriptionLifecycleStore,
  SupabaseSubscriptionLifecycleStore,
} from "./subscription-lifecycle-store.ts";
import {
  type LedgerWriteOutcome,
  type OrderAccessDecision,
  type OrderLedgerInput,
  type OrderRefundLedger,
  type PolarOrderStatus,
  type PolarRefundStatus,
  type RefundLedgerInput,
  SupabaseOrderRefundLedger,
} from "./order-refund-ledger.ts";

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
  lifecycle?: SubscriptionLifecycleStore;
  orderRefundLedger?: OrderRefundLedger;
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

function asNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
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

function subscriptionStatus(event: PolarWebhookEvent): string | null {
  const fromType = event.type.slice("subscription.".length);
  const knownStates = [
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "canceled",
    "past_due",
    "unpaid",
  ];
  if (fromType === "created" || fromType === "updated") {
    const payloadStatus = asString(event.data.status)?.toLowerCase() ?? null;
    if (payloadStatus && knownStates.includes(payloadStatus)) {
      return payloadStatus;
    }
    return null;
  }
  return [
      "active",
      "canceled",
      "uncanceled",
      "past_due",
      "revoked",
    ].includes(fromType)
    ? fromType
    : null;
}

function subscriptionStatusRequiresPeriodEnd(
  status: string,
  cancelAtPeriodEnd: boolean,
): boolean {
  return status === "active" || status === "trialing" ||
    status === "uncanceled" || status === "past_due" ||
    (status === "canceled" && cancelAtPeriodEnd);
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

async function hashLedgerPayload(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function orderStatus(value: unknown): PolarOrderStatus | null {
  return value === "paid" || value === "partially_refunded" ||
      value === "refunded"
    ? value
    : null;
}

function refundStatus(value: unknown): PolarRefundStatus | null {
  return value === "pending" || value === "succeeded" || value === "failed" ||
      value === "canceled"
    ? value
    : null;
}

function normalizedCurrency(value: unknown): string | null {
  const currency = asString(value)?.toLowerCase() ?? null;
  return currency && /^[a-z]{3}$/.test(currency) ? currency : null;
}

async function parseOrderLedgerInput(args: {
  data: Record<string, unknown>;
  environment: BillingEnvironment;
  userId: string;
  productId: string;
}): Promise<OrderLedgerInput | string> {
  const orderId = asString(args.data.id);
  const status = orderStatus(args.data.status);
  const netAmount = asNonNegativeInteger(args.data.net_amount);
  const appliedBalanceAmount = asNonNegativeInteger(
    args.data.applied_balance_amount,
  );
  const reportedRefundedAmount = asNonNegativeInteger(
    args.data.refunded_amount,
  );
  const currency = normalizedCurrency(args.data.currency);
  const modifiedAt = parseIsoTimestamp(
    args.data.modified_at ?? args.data.updated_at,
  );
  if (
    args.data.billing_reason !== "purchase" ||
    asString(args.data.subscription_id) !== null
  ) return "order_not_one_time_purchase";
  if (!orderId) return "missing_order_id";
  if (!status || args.data.paid !== true) return "unconfirmed_order_status";
  if (netAmount === null || netAmount === 0) return "missing_order_net_amount";
  // Polar customer balance changes the refundable basis. Until BIL-07 has a
  // separately evidenced balance formula, fail closed instead of treating the
  // order net amount as the refundable total.
  if (appliedBalanceAmount === null) return "missing_order_applied_balance";
  if (appliedBalanceAmount !== 0) return "unsupported_order_applied_balance";
  if (reportedRefundedAmount === null) {
    return "missing_order_refunded_amount";
  }
  if (reportedRefundedAmount > netAmount) return "invalid_order_refund_total";
  if (
    (status === "paid" && reportedRefundedAmount !== 0) ||
    (status === "partially_refunded" &&
      (reportedRefundedAmount === 0 || reportedRefundedAmount >= netAmount)) ||
    (status === "refunded" && reportedRefundedAmount !== netAmount)
  ) return "inconsistent_order_refund_state";
  if (!currency) return "missing_order_currency";
  if (!modifiedAt || !Number.isFinite(Date.parse(modifiedAt))) {
    return "missing_resource_modified_at";
  }
  const inputWithoutHash = {
    environment: args.environment,
    orderId,
    userId: args.userId,
    productId: args.productId,
    checkoutId: asString(args.data.checkout_id),
    status,
    paid: true as const,
    netAmount,
    currency,
    reportedRefundedAmount,
    modifiedAt: new Date(modifiedAt).toISOString(),
  };
  return {
    ...inputWithoutHash,
    snapshotHash: await hashLedgerPayload(inputWithoutHash),
  };
}

async function parseRefundLedgerInput(args: {
  data: Record<string, unknown>;
  environment: BillingEnvironment;
}): Promise<RefundLedgerInput | string> {
  const refundId = asString(args.data.id);
  const orderId = asString(args.data.order_id);
  const paymentId = asString(args.data.payment_id);
  const status = refundStatus(args.data.status);
  const amount = asNonNegativeInteger(args.data.amount);
  const currency = normalizedCurrency(args.data.currency);
  const modifiedAt = parseIsoTimestamp(
    args.data.modified_at ?? args.data.updated_at,
  );
  if (!refundId) return "missing_refund_id";
  if (!orderId) return "missing_order_id";
  if (!paymentId) return "missing_payment_id";
  if (!status) return "unconfirmed_refund_status";
  if (amount === null || amount === 0) return "missing_refund_amount";
  if (!currency) return "missing_refund_currency";
  if (!modifiedAt || !Number.isFinite(Date.parse(modifiedAt))) {
    return "missing_resource_modified_at";
  }
  const inputWithoutHash = {
    environment: args.environment,
    refundId,
    orderId,
    paymentId,
    status,
    amount,
    currency,
    modifiedAt: new Date(modifiedAt).toISOString(),
  };
  return {
    ...inputWithoutHash,
    snapshotHash: await hashLedgerPayload(inputWithoutHash),
  };
}

function unsafeLedgerOutcome(
  outcome: LedgerWriteOutcome | null,
): string | null {
  if (
    outcome === null || outcome === "apply" || outcome === "duplicate" ||
    outcome === "stale_noop"
  ) return null;
  return `order_refund_ledger_${outcome}`;
}

async function applyOrderRefundEvent(args: {
  event: PolarWebhookEvent;
  deps: WebhookProcessorDeps;
  productMap: PolarProductMap;
  environment: BillingEnvironment;
  nowIso: string;
}): Promise<ProcessResult> {
  const ledger = args.deps.orderRefundLedger ??
    new SupabaseOrderRefundLedger(args.deps.supabase);
  let writeOutcome: LedgerWriteOutcome | null = null;
  let orderId: string;
  let decision: OrderAccessDecision | null;

  if (args.event.type.startsWith("order.")) {
    const userId = await resolveUserId(
      args.deps.supabase,
      args.event.data,
      args.environment,
    );
    if (!userId) return { status: "ignored", reason: "unresolved_user_id" };
    const productId = extractProductId(args.event.data);
    if (!productId) return { status: "ignored", reason: "missing_product_id" };
    const resolved = resolveCheckoutKeyByProductId(args.productMap, productId);
    if (!resolved.ok) {
      return { status: "ignored", reason: "unknown_product_id" };
    }
    if (
      resolved.key !== "launch_lifetime" ||
      resolved.config.billing_type !== "one_time"
    ) {
      return { status: "ignored", reason: "order_not_lifetime_product" };
    }
    const parsed = await parseOrderLedgerInput({
      data: args.event.data,
      environment: args.environment,
      userId,
      productId,
    });
    if (typeof parsed === "string") {
      return { status: "ignored", reason: parsed };
    }
    orderId = parsed.orderId;
    // The ledger write is itself monotonic and idempotent. Evaluate its
    // outcome before completing the durable effect so an ambiguity can never
    // be replayed later as if it had been accepted.
    writeOutcome = await ledger.recordOrder(parsed);
    const unsafe = unsafeLedgerOutcome(writeOutcome);
    if (unsafe) return { status: "ignored", reason: unsafe };
    await applyEffect(
      args.deps,
      "billing_order_ledger",
      () => Promise.resolve(),
    );
    decision = await ledger.readDecision(args.environment, orderId);
    if (!decision) return { status: "ignored", reason: "missing_order" };
    await touchCustomerIfPresent(
      args.deps,
      userId,
      args.environment,
      args.event.data,
      args.nowIso,
    );
  } else {
    const parsed = await parseRefundLedgerInput({
      data: args.event.data,
      environment: args.environment,
    });
    if (typeof parsed === "string") {
      return { status: "ignored", reason: parsed };
    }
    orderId = parsed.orderId;
    writeOutcome = await ledger.recordRefund(parsed);
    const unsafe = unsafeLedgerOutcome(writeOutcome);
    if (unsafe) return { status: "ignored", reason: unsafe };
    await applyEffect(
      args.deps,
      "billing_refund_ledger",
      () => Promise.resolve(),
    );
    decision = await ledger.readDecision(args.environment, orderId);
    if (!decision) return { status: "ignored", reason: "missing_order" };
  }

  const resolved = resolveCheckoutKeyByProductId(
    args.productMap,
    decision.order.productId,
  );
  if (
    !resolved.ok || resolved.key !== "launch_lifetime" ||
    resolved.config.billing_type !== "one_time"
  ) return { status: "ignored", reason: "order_not_lifetime_product" };

  await applyEffect(
    args.deps,
    "billing_order_access",
    () =>
      ledger.syncOrderAccess(
        args.environment,
        orderId,
        resolved.config.capabilities,
      ),
  );

  if (writeOutcome === "duplicate") {
    return { status: "processed", action: "resource_duplicate" };
  }
  if (writeOutcome === "stale_noop") {
    return { status: "processed", action: "stale_noop" };
  }

  if (decision.accessState === "revoked") {
    return { status: "processed", action: "revoked_lifetime_order" };
  }
  if (decision.succeededRefundAmount > 0) {
    return { status: "processed", action: "recorded_partial_refund" };
  }
  if (args.event.type === "order.refunded") {
    return {
      status: "processed",
      action: "awaiting_attributed_refund",
    };
  }
  if (args.event.type.startsWith("refund.")) {
    return { status: "processed", action: "recorded_non_succeeded_refund" };
  }
  return { status: "processed", action: "granted_lifetime_bundle" };
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
  if (
    event.type === "order.paid" || event.type === "order.refunded" ||
    event.type === "refund.created" || event.type === "refund.updated"
  ) {
    return applyOrderRefundEvent({
      event,
      deps,
      productMap: mapping.map,
      environment,
      nowIso,
    });
  }
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

  if (!event.type.startsWith("subscription.")) {
    return { status: "ignored", reason: "unsupported_event_type" };
  }
  if (resolved.config.billing_type !== "subscription") {
    return { status: "ignored", reason: "subscription_not_monthly" };
  }
  if (
    ![
      "subscription.created",
      "subscription.active",
      "subscription.updated",
      "subscription.canceled",
      "subscription.uncanceled",
      "subscription.past_due",
      "subscription.revoked",
    ].includes(event.type)
  ) {
    return { status: "ignored", reason: "unsupported_event_type" };
  }

  const resourceId = extractSubscriptionId(event.data);
  if (!resourceId) {
    return { status: "ignored", reason: "missing_resource_id" };
  }
  const modifiedAt = parseIsoTimestamp(
    event.data.modified_at ?? event.data.updated_at,
  );
  if (!modifiedAt || !Number.isFinite(Date.parse(modifiedAt))) {
    return { status: "ignored", reason: "missing_resource_modified_at" };
  }

  const lifecycle = deps.lifecycle ??
    new SupabaseSubscriptionLifecycleStore(deps.supabase);
  const parsedPeriodEnd = parseIsoTimestamp(event.data.current_period_end);
  const remotePeriodEnd = parsedPeriodEnd &&
      Number.isFinite(Date.parse(parsedPeriodEnd))
    ? new Date(parsedPeriodEnd).toISOString()
    : null;
  const status = subscriptionStatus(event);
  if (!status) {
    return { status: "ignored", reason: "unsupported_subscription_status" };
  }
  const cancelAtPeriodEnd = event.data.cancel_at_period_end === true;
  if (
    subscriptionStatusRequiresPeriodEnd(status, cancelAtPeriodEnd) &&
    !remotePeriodEnd
  ) {
    return { status: "ignored", reason: "missing_subscription_period_end" };
  }
  const subscriptionTransition = status === "trialing" &&
      resolved.config.trial.enabled !== true
    ? null
    : deriveSubscriptionTransition({
      status,
      cancelAtPeriodEnd,
      currentPeriodEnd: remotePeriodEnd,
      remoteModifiedAt: new Date(modifiedAt).toISOString(),
      previous: await lifecycle.read({
        environment,
        subscriptionId: resourceId,
      }),
      now,
    });
  if (
    status === "trialing" && resolved.config.trial.enabled !== true
  ) {
    return { status: "ignored", reason: "subscription_trial_not_configured" };
  }
  if (!subscriptionTransition) {
    return { status: "ignored", reason: "unsupported_subscription_status" };
  }
  const projected = {
    state: subscriptionTransition.status,
    active: subscriptionTransition.commercialGrant.status === "active",
    validUntil: subscriptionTransition.commercialGrant.validUntil,
  };
  const grants = grantsForConfig(
    resolved.config,
    projected.active,
    projected.validUntil,
  );
  const snapshotWithoutHash = {
    provider: "polar" as const,
    environment,
    resourceType: "subscription" as const,
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
  const lifecycleApply = {
    userId,
    environment,
    subscriptionId: resourceId,
    productId,
    capabilities: resolved.config.capabilities,
    periodStart: parseIsoTimestamp(event.data.current_period_start),
    remotePeriodEnd,
    cancelAtPeriodEnd,
    modifiedAt: snapshotWithoutHash.modifiedAt,
    snapshotHash,
    transition: subscriptionTransition,
    evaluatedAt: nowIso,
  };
  if (result.outcome === "stale_noop") {
    if (
      status === "past_due" &&
      subscriptionTransition.recovery.action === "open" &&
      remotePeriodEnd === subscriptionTransition.recovery.cyclePaidThrough
    ) {
      await applyEffect(
        deps,
        "billing_subscription_lifecycle",
        () => lifecycle.apply(lifecycleApply),
      );
    }
    return { status: "processed", action: "stale_noop" };
  }

  await touchCustomerIfPresent(deps, userId, environment, event.data, nowIso);
  await applyEffect(
    deps,
    "billing_subscription_lifecycle",
    () => lifecycle.apply(lifecycleApply),
  );
  if (result.outcome === "duplicate") {
    return { status: "processed", action: "resource_duplicate" };
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
  "paid",
  "net_amount",
  "applied_balance_amount",
  "refunded_amount",
  "amount",
  "tax_amount",
  "currency",
  "payment_id",
  "checkout_id",
  "billing_reason",
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
      "unsupported_subscription_status",
      "subscription_trial_not_configured",
      "missing_subscription_period_end",
      "missing_order_id",
      "missing_refund_id",
      "missing_payment_id",
      "unconfirmed_order_status",
      "unconfirmed_refund_status",
      "missing_order_net_amount",
      "missing_order_applied_balance",
      "unsupported_order_applied_balance",
      "missing_order_refunded_amount",
      "missing_order_currency",
      "missing_refund_amount",
      "missing_refund_currency",
      "invalid_order_refund_total",
      "inconsistent_order_refund_state",
      "order_not_one_time_purchase",
      "missing_order",
    ].includes(result.reason) ||
      result.reason.startsWith("order_refund_ledger_")
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
  const mapping = (deps.loadMap ?? loadPolarProductMap)();
  const environment = mapping.ok ? mapping.map.environment : "unclassified";
  const payload = minimizePolarWebhookEvent(event);
  const payloadHash = deps.payloadHash ?? await computeWebhookPayloadHash(
    JSON.stringify(event),
  );
  const receipt = await inbox.receive({
    provider: POLAR_PROVIDER,
    environment,
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
