import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type BillingEnvironment,
  type PolarProductMap,
  resolveCheckoutKeyByProductId,
} from "../_shared/mapping.ts";
import { polarServerBaseUrl } from "../_shared/polar.ts";
import { isUuid } from "../_shared/request.ts";

type Json = Record<string, unknown>;
export type CompensationJob = {
  environment: BillingEnvironment;
  order_id: string;
  checkout_id: string;
  organization_id: string;
  product_id: string;
  subscription_id: string | null;
  net_amount: number;
  currency: string;
  attempt_count: number;
};
export interface CompensationStore {
  observe(order: Json, map: PolarProductMap): Promise<void>;
  claim(
    environment: BillingEnvironment,
    token: string,
  ): Promise<CompensationJob | null>;
  finish(
    job: CompensationJob,
    token: string,
    outcome: "refunded" | "pending" | "retry",
    refundId: string | null,
    code: string | null,
  ): Promise<void>;
  alerts(environment: BillingEnvironment): Promise<Json[]>;
  finishAlert(
    environment: BillingEnvironment,
    orderId: string,
    delivered: boolean,
    kind?: string,
  ): Promise<void>;
}
export function record(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_polar_response");
  }
  return value as Json;
}
function cents(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("invalid_polar_amount");
  }
  return value;
}
export function orderOrganization(order: Json): unknown {
  return order.organization_id ??
    (order.product && record(order.product).organization_id);
}
export function createCompensationStore(
  client: Pick<SupabaseClient, "rpc">,
): CompensationStore {
  const rpc = async (name: string, args: Json): Promise<unknown> => {
    const result = await client.rpc(name, args);
    if (result.error) throw new Error("compensation_database_unavailable");
    return result.data;
  };
  return {
    async observe(order, map) {
      // API-derived initial orders only. Never customer input or metadata.
      if (
        order.paid !== true || !isUuid(order.checkout_id) ||
        !["purchase", "subscription_create"].includes(
          String(order.billing_reason),
        )
      ) return;
      const resolved = resolveCheckoutKeyByProductId(
        map,
        String(order.product_id),
      );
      if (!resolved.ok) return; // A different product is outside this commercial contract.
      if (
        orderOrganization(order) !== map.organization_id || !isUuid(order.id) ||
        (order.subscription_id != null && !isUuid(order.subscription_id))
      ) throw new Error("compensation_order_scope_mismatch");
      if (cents(order.net_amount) === 0) return; // No charge: nothing to refund.
      await rpc("billing_observe_checkout_payment", {
        p_environment: map.environment,
        p_order_id: order.id,
        p_checkout_id: order.checkout_id,
        p_organization_id: map.organization_id,
        p_product_id: order.product_id,
        p_subscription_id: order.subscription_id ?? null,
        p_attempt_id:
          order.metadata && isUuid(record(order.metadata).vantare_attempt_id)
            ? record(order.metadata).vantare_attempt_id
            : null,
        p_dispatch_token: order.metadata &&
            isUuid(record(order.metadata).vantare_dispatch_token)
          ? record(order.metadata).vantare_dispatch_token
          : null,
        p_net_amount: cents(order.net_amount),
        p_currency: order.currency,
        p_capabilities: [...resolved.config.capabilities].sort(),
      });
    },
    async claim(environment, token) {
      const value = await rpc("billing_claim_checkout_compensation", {
        p_environment: environment,
        p_token: token,
      });
      if (value === null) return null;
      const job = record(value);
      if (
        job.environment !== environment || !isUuid(job.order_id) ||
        !isUuid(job.checkout_id) ||
        !isUuid(job.organization_id) || !isUuid(job.product_id) ||
        (job.subscription_id !== null && !isUuid(job.subscription_id)) ||
        cents(job.net_amount) === 0 || !/^[a-z]{3}$/.test(String(job.currency))
      ) throw new Error("invalid_compensation_job");
      return job as CompensationJob;
    },
    async finish(job, token, outcome, refundId, code) {
      if (
        await rpc("billing_finish_checkout_compensation", {
          p_environment: job.environment,
          p_order_id: job.order_id,
          p_token: token,
          p_outcome: outcome,
          p_refund_id: refundId,
          p_code: code,
        }) !== true
      ) throw new Error("compensation_lease_lost");
    },
    async alerts(environment) {
      const rows = await rpc("billing_operational_owner_alerts", {
        p_environment: environment,
      });
      if (!Array.isArray(rows)) throw new Error("invalid_compensation_alerts");
      return rows.map(record);
    },
    async finishAlert(
      environment,
      orderId,
      delivered,
      kind = "checkout_refund_failed",
    ) {
      await rpc("billing_finish_operational_owner_alert", {
        p_environment: environment,
        p_order_id: orderId,
        p_kind: kind,
        p_delivered: delivered,
      });
    },
  };
}
export type PolarRefundClient = ReturnType<typeof createPolarRefundClient>;
export function createPolarRefundClient(
  environment: BillingEnvironment,
  token: string,
  fetchFn: typeof fetch = fetch,
) {
  if (!token.trim()) throw new Error("polar_not_configured");
  const base = polarServerBaseUrl(environment);
  async function request(
    path: string,
    method = "GET",
    body?: Json,
  ): Promise<Json> {
    const response = await fetchFn(base + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Polar-Version": "2026-10",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`polar_refund_http_${response.status}`);
    return record(await response.json());
  }
  return {
    order: (id: string) => request("/orders/" + encodeURIComponent(id)),
    checkout: (id: string) => request("/checkouts/" + encodeURIComponent(id)),
    async refunds(job: CompensationJob): Promise<Json[]> {
      const result: Json[] = [];
      for (let page = 1; page <= 3; page++) {
        const value = await request(
          "/refunds/?order_id=" + encodeURIComponent(job.order_id) +
            "&organization_id=" + encodeURIComponent(job.organization_id) +
            "&limit=100&page=" + page,
        );
        const pagination = record(value.pagination);
        if (
          !Array.isArray(value.items) ||
          !Number.isSafeInteger(pagination.max_page) ||
          Number(pagination.max_page) < 0
        ) throw new Error("invalid_polar_refund_page");
        for (const raw of value.items) {
          const refund = record(raw);
          if (
            refund.order_id !== job.order_id ||
            refund.organization_id !== job.organization_id ||
            refund.currency !== job.currency || !isUuid(refund.id) ||
            !["pending", "succeeded", "failed", "canceled"].includes(
              String(refund.status),
            )
          ) throw new Error("polar_refund_scope_mismatch");
          cents(refund.amount);
          result.push(refund);
        }
        if (page >= Number(pagination.max_page)) return result;
      }
      // Do not POST if pagination was truncated or cannot finish within this tick.
      throw new Error("polar_refund_pagination_limit");
    },
    create: (job: CompensationJob, amount: number) =>
      request("/refunds/", "POST", {
        order_id: job.order_id,
        amount,
        reason: "service_disruption",
        revoke_benefits: job.subscription_id === null,
        metadata: {
          vantare_compensation: job.environment + ":" + job.order_id,
        },
      }),
    async revoke(job: CompensationJob) {
      if (!job.subscription_id) return;
      const sub = await request(
        "/subscriptions/" + encodeURIComponent(job.subscription_id),
      );
      if (
        sub.id !== job.subscription_id || sub.product_id !== job.product_id ||
        (sub.organization_id ??
            (sub.product && record(sub.product).organization_id)) !==
          job.organization_id
      ) throw new Error("polar_subscription_scope_mismatch");
      if (sub.status !== "canceled") {
        await request(
          "/subscriptions/" + encodeURIComponent(job.subscription_id),
          "DELETE",
        );
      }
    },
  };
}
function validateOrder(job: CompensationJob, order: Json): void {
  if (
    order.id !== job.order_id || order.checkout_id !== job.checkout_id ||
    orderOrganization(order) !== job.organization_id ||
    order.product_id !== job.product_id ||
    (order.subscription_id ?? null) !== job.subscription_id ||
    order.currency !== job.currency ||
    order.paid !== true || cents(order.net_amount) !== job.net_amount ||
    !["paid", "partially_refunded", "refunded"].includes(String(order.status))
  ) throw new Error("polar_order_scope_mismatch");
}
export async function refundUnlicensedCheckout(
  job: CompensationJob,
  polar: PolarRefundClient,
): Promise<{ outcome: "pending" | "refunded"; refundId: string | null }> {
  // Always READ before a write, including retries after an ambiguous POST/DB ACK.
  const order = await polar.order(job.order_id);
  validateOrder(job, order);
  const refunds = await polar.refunds(job);
  const succeeded = refunds.filter((r) => r.status === "succeeded").reduce(
    (n, r) => n + cents(r.amount),
    0,
  );
  const aggregate = cents(order.refunded_amount);
  if (aggregate > job.net_amount || succeeded > job.net_amount) {
    throw new Error("invalid_polar_refund_total");
  }
  const refunded = Math.max(succeeded, aggregate);
  const knownId = refunds.find((r) => r.status === "succeeded")?.id as
    | string
    | undefined;
  if (
    refunded === job.net_amount &&
    cents(order.refunded_tax_amount) >= cents(order.tax_amount)
  ) {
    await polar.revoke(job);
    return { outcome: "refunded", refundId: knownId ?? null };
  }
  const pending = refunds.find((r) => r.status === "pending");
  if (pending) {
    await polar.revoke(job);
    return { outcome: "pending", refundId: String(pending.id) };
  }
  // A stale aggregate must never cause a second partial refund. Retry reads.
  if (succeeded !== aggregate) throw new Error("polar_refund_not_converged");
  const amount = job.net_amount - refunded; // Net after discount; Polar adds the tax.
  if (amount <= 0) throw new Error("polar_refund_tax_not_converged");
  const created = await polar.create(job, amount);
  if (
    !isUuid(created.id) || created.order_id !== job.order_id ||
    created.organization_id !== job.organization_id ||
    created.currency !== job.currency || cents(created.amount) !== amount ||
    !["pending", "succeeded"].includes(String(created.status))
  ) throw new Error("polar_refund_not_accepted");
  await polar.revoke(job);
  // Even a 201/succeeded needs the authoritative full order/tax confirmation.
  return { outcome: "pending", refundId: created.id };
}
function errorCode(error: unknown): string {
  return error instanceof Error && /^[a-z0-9_]{1,64}$/.test(error.message)
    ? error.message
    : "polar_refund_unavailable";
}
export async function runCheckoutCompensation(
  environment: BillingEnvironment,
  store: CompensationStore,
  polar: PolarRefundClient,
): Promise<void> {
  const token = crypto.randomUUID();
  const job = await store.claim(environment, token);
  if (!job) return;
  let result: Awaited<ReturnType<typeof refundUnlicensedCheckout>>;
  try {
    result = await refundUnlicensedCheckout(job, polar);
  } catch (error) {
    await store.finish(job, token, "retry", null, errorCode(error));
    return;
  }
  // A failed DB ACK must remain a lease recovery, never change a known refund into a new POST.
  await store.finish(job, token, result.outcome, result.refundId, null);
}
export async function deliverCheckoutOwnerAlerts(
  environment: BillingEnvironment,
  store: CompensationStore,
  config: { url: string; secret: string },
  fetchFn: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<void> {
  for (const alert of await store.alerts(environment)) {
    const orderId = String(alert.order_id);
    if (!isUuid(orderId)) throw new Error("invalid_compensation_alert");
    let delivered = false;
    try {
      const url = new URL(config.url);
      if (
        url.protocol !== "https:" || url.username || url.password ||
        url.search || url.hash || config.secret.length < 32
      ) throw new Error("owner_alert_not_configured");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(environment + ":" + orderId),
      );
      const id = Array.from(
        new Uint8Array(digest),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      const body = JSON.stringify({
        type: alert.kind ?? "checkout_refund_failed",
        environment,
        id,
        code: alert.code ?? "polar_refund_unavailable",
      });
      const timestamp = String(Math.floor(now().getTime() / 1000));
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(config.secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(timestamp + "." + body),
      );
      const hex = Array.from(
        new Uint8Array(signature),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      const response = await fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Vantare-Alert-Id": id,
          "X-Vantare-Timestamp": timestamp,
          "X-Vantare-Signature": "sha256=" + hex,
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      delivered = response.ok;
    } catch {
      /* Durable outbox stays pending; refunds continue independently. */
    }
    await store.finishAlert(
      environment,
      orderId,
      delivered,
      String(alert.kind ?? "checkout_refund_failed"),
    );
  }
}

// Only a terminal Polar checkout is safe to release once a URL was published.
export async function expireUnpaidCheckouts(
  client: Pick<SupabaseClient, "rpc">,
  map: PolarProductMap,
  polar: PolarRefundClient,
): Promise<void> {
  const expired = await client.rpc("billing_expire_unpublished_checkouts", {
    p_environment: map.environment,
  });
  if (expired.error) throw new Error("checkout_expiry_database_unavailable");
  const result = await client.rpc("billing_published_checkouts_to_expire", {
    p_environment: map.environment,
  });
  if (result.error || !Array.isArray(result.data)) {
    throw new Error("checkout_expiry_database_unavailable");
  }
  for (const raw of result.data) {
    const row = record(raw);
    if (
      !isUuid(row.user_id) || !isUuid(row.attempt_id) ||
      !isUuid(row.checkout_id)
    ) throw new Error("invalid_checkout_expiry");
    const checkout = await polar.checkout(row.checkout_id);
    const resolved = resolveCheckoutKeyByProductId(
      map,
      String(checkout.product_id),
    );
    if (
      checkout.id !== row.checkout_id ||
      checkout.organization_id !== map.organization_id || !resolved.ok ||
      resolved.key !== row.checkout_key
    ) throw new Error("checkout_expiry_scope_mismatch");
    if (
      !["open", "confirmed", "succeeded", "expired", "failed"].includes(
        String(checkout.status),
      )
    ) throw new Error("invalid_checkout_status");
    const saved = await client.rpc("billing_expire_published_checkout", {
      p_environment: map.environment,
      p_user_id: row.user_id,
      p_attempt_id: row.attempt_id,
      p_checkout_id: row.checkout_id,
      p_terminal: checkout.status === "expired" || checkout.status === "failed",
      p_provider_status: checkout.status,
    });
    if (saved.error) throw new Error("checkout_expiry_database_unavailable");
  }
}

export async function observeCheckoutSession(
  client: Pick<SupabaseClient, "rpc">,
  map: PolarProductMap,
  checkout: Json,
): Promise<void> {
  const metadata = checkout.metadata ? record(checkout.metadata) : {};
  if (
    !isUuid(metadata.vantare_attempt_id) ||
    !isUuid(metadata.vantare_dispatch_token)
  ) return;
  const resolved = resolveCheckoutKeyByProductId(
    map,
    String(checkout.product_id),
  );
  if (!resolved.ok) return;
  if (
    checkout.organization_id !== map.organization_id || !isUuid(checkout.id)
  ) throw new Error("checkout_recovery_scope_mismatch");
  const saved = await client.rpc("billing_observe_checkout_session", {
    p_environment: map.environment,
    p_checkout_id: checkout.id,
    p_product_id: checkout.product_id,
    p_status: checkout.status,
    p_attempt_id: metadata.vantare_attempt_id,
    p_dispatch_token: metadata.vantare_dispatch_token,
  });
  if (saved.error) throw new Error("checkout_recovery_database_unavailable");
}
