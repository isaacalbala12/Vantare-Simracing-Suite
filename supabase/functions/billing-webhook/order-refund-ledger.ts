import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { BillingEnvironment } from "../_shared/mapping.ts";
import { compareResourceVersion } from "./commercial-projection.ts";

export type PolarOrderStatus = "paid" | "partially_refunded" | "refunded";
export type PolarRefundStatus = "pending" | "succeeded" | "failed" | "canceled";

export type OrderLedgerInput = {
  environment: BillingEnvironment;
  orderId: string;
  userId: string;
  productId: string;
  checkoutId: string | null;
  status: PolarOrderStatus;
  paid: true;
  netAmount: number;
  currency: string;
  reportedRefundedAmount: number;
  modifiedAt: string;
  snapshotHash: string;
};

export type RefundLedgerInput = {
  environment: BillingEnvironment;
  refundId: string;
  orderId: string;
  paymentId: string;
  status: PolarRefundStatus;
  amount: number;
  currency: string;
  modifiedAt: string;
  snapshotHash: string;
};

export type LedgerWriteOutcome =
  | "apply"
  | "duplicate"
  | "stale_noop"
  | "version_conflict"
  | "missing_order"
  | "invalid_attribution"
  | "invalid_transition"
  | "currency_mismatch"
  | "refund_total_exceeds_order";

export type OrderAccessDecision = {
  order: OrderLedgerInput;
  succeededRefundAmount: number;
  accessState: "active" | "revoked";
  projectionModifiedAt: string;
};

export interface OrderRefundLedger {
  recordOrder(input: OrderLedgerInput): Promise<LedgerWriteOutcome>;
  recordRefund(input: RefundLedgerInput): Promise<LedgerWriteOutcome>;
  readDecision(
    environment: BillingEnvironment,
    orderId: string,
  ): Promise<OrderAccessDecision | null>;
  syncOrderAccess(
    environment: BillingEnvironment,
    orderId: string,
    capabilities: string[],
  ): Promise<void>;
}

function key(environment: BillingEnvironment, id: string): string {
  return `${environment}:${id}`;
}

function decision(
  order: OrderLedgerInput,
  refunds: Iterable<RefundLedgerInput>,
): OrderAccessDecision {
  let succeededRefundAmount = 0;
  let projectionModifiedAt = order.modifiedAt;
  for (const refund of refunds) {
    if (refund.status === "succeeded") succeededRefundAmount += refund.amount;
    if (Date.parse(refund.modifiedAt) > Date.parse(projectionModifiedAt)) {
      projectionModifiedAt = refund.modifiedAt;
    }
  }
  return {
    order: structuredClone(order),
    succeededRefundAmount,
    accessState: succeededRefundAmount >= order.netAmount
      ? "revoked"
      : "active",
    projectionModifiedAt,
  };
}

export class MemoryOrderRefundLedger implements OrderRefundLedger {
  readonly orders = new Map<string, OrderLedgerInput>();
  readonly refunds = new Map<string, RefundLedgerInput>();
  readonly grants = new Map<string, "active" | "revoked">();

  recordOrder(input: OrderLedgerInput): Promise<LedgerWriteOutcome> {
    const orderKey = key(input.environment, input.orderId);
    const current = this.orders.get(orderKey) ?? null;
    const outcome = compareResourceVersion(current, input);
    if (outcome !== "apply") return Promise.resolve(outcome);
    if (
      current &&
      (current.userId !== input.userId ||
        current.productId !== input.productId ||
        (current.checkoutId !== null && input.checkoutId !== null &&
          current.checkoutId !== input.checkoutId) ||
        current.currency !== input.currency ||
        current.netAmount !== input.netAmount)
    ) return Promise.resolve("invalid_attribution");
    const succeeded = this.succeededTotal(input.environment, input.orderId);
    if (succeeded > input.netAmount) {
      return Promise.resolve("refund_total_exceeds_order");
    }
    const next = structuredClone(input);
    if (
      current !== null && current.checkoutId !== null &&
      next.checkoutId === null
    ) {
      next.checkoutId = current.checkoutId;
    }
    this.orders.set(orderKey, next);
    return Promise.resolve("apply");
  }

  recordRefund(input: RefundLedgerInput): Promise<LedgerWriteOutcome> {
    const order = this.orders.get(key(input.environment, input.orderId));
    if (!order) return Promise.resolve("missing_order");
    if (order.currency !== input.currency) {
      return Promise.resolve("currency_mismatch");
    }
    const refundKey = key(input.environment, input.refundId);
    const current = this.refunds.get(refundKey) ?? null;
    const outcome = compareResourceVersion(current, input);
    if (outcome !== "apply") return Promise.resolve(outcome);
    if (
      current &&
      (current.orderId !== input.orderId ||
        current.paymentId !== input.paymentId ||
        current.currency !== input.currency ||
        current.amount !== input.amount)
    ) return Promise.resolve("invalid_attribution");
    if (
      current?.status === "succeeded" && input.status !== "succeeded"
    ) return Promise.resolve("invalid_transition");
    const currentSucceeded = current?.status === "succeeded"
      ? current.amount
      : 0;
    const incomingSucceeded = input.status === "succeeded" ? input.amount : 0;
    const total = this.succeededTotal(input.environment, input.orderId) -
      currentSucceeded + incomingSucceeded;
    if (total > order.netAmount) {
      return Promise.resolve("refund_total_exceeds_order");
    }
    this.refunds.set(refundKey, structuredClone(input));
    return Promise.resolve("apply");
  }

  readDecision(
    environment: BillingEnvironment,
    orderId: string,
  ): Promise<OrderAccessDecision | null> {
    const order = this.orders.get(key(environment, orderId));
    if (!order) return Promise.resolve(null);
    const refunds = [...this.refunds.values()].filter((refund) =>
      refund.environment === environment && refund.orderId === orderId
    );
    return Promise.resolve(decision(order, refunds));
  }

  async syncOrderAccess(
    environment: BillingEnvironment,
    orderId: string,
    capabilities: string[],
  ): Promise<void> {
    const current = await this.readDecision(environment, orderId);
    if (!current) throw new Error("missing_order");
    for (const capability of capabilities) {
      this.grants.set(
        `${environment}:${orderId}:${capability}`,
        current.accessState,
      );
    }
  }

  private succeededTotal(
    environment: BillingEnvironment,
    orderId: string,
  ): number {
    let total = 0;
    for (const refund of this.refunds.values()) {
      if (
        refund.environment === environment && refund.orderId === orderId &&
        refund.status === "succeeded"
      ) total += refund.amount;
    }
    return total;
  }
}

function rpcOutcome(data: unknown): LedgerWriteOutcome {
  const row = Array.isArray(data) ? data[0] : data;
  const outcome = typeof row === "object" && row !== null &&
      "outcome" in row
    ? (row as { outcome?: unknown }).outcome
    : null;
  if (
    outcome === "apply" || outcome === "duplicate" ||
    outcome === "stale_noop" || outcome === "version_conflict" ||
    outcome === "missing_order" || outcome === "invalid_attribution" ||
    outcome === "invalid_transition" || outcome === "currency_mismatch" ||
    outcome === "refund_total_exceeds_order"
  ) return outcome;
  throw new Error("invalid_order_refund_ledger_result");
}

export class SupabaseOrderRefundLedger implements OrderRefundLedger {
  constructor(private readonly supabase: SupabaseClient) {}

  async recordOrder(input: OrderLedgerInput): Promise<LedgerWriteOutcome> {
    const { data, error } = await this.supabase.rpc(
      "billing_record_order_snapshot",
      {
        p_environment: input.environment,
        p_order_id: input.orderId,
        p_user_id: input.userId,
        p_product_id: input.productId,
        p_checkout_id: input.checkoutId,
        p_status: input.status,
        p_paid: input.paid,
        p_net_amount: input.netAmount,
        p_currency: input.currency,
        p_reported_refunded_amount: input.reportedRefundedAmount,
        p_modified_at: input.modifiedAt,
        p_snapshot_hash: input.snapshotHash,
      },
    );
    if (error) {
      throw Object.assign(new Error("order ledger write failed"), {
        code: typeof error.code === "string" ? error.code : "ledger_failed",
      });
    }
    return rpcOutcome(data);
  }

  async recordRefund(input: RefundLedgerInput): Promise<LedgerWriteOutcome> {
    const { data, error } = await this.supabase.rpc(
      "billing_record_refund_snapshot",
      {
        p_environment: input.environment,
        p_refund_id: input.refundId,
        p_order_id: input.orderId,
        p_payment_id: input.paymentId,
        p_status: input.status,
        p_amount: input.amount,
        p_currency: input.currency,
        p_modified_at: input.modifiedAt,
        p_snapshot_hash: input.snapshotHash,
      },
    );
    if (error) {
      throw Object.assign(new Error("refund ledger write failed"), {
        code: typeof error.code === "string" ? error.code : "ledger_failed",
      });
    }
    return rpcOutcome(data);
  }

  async readDecision(
    environment: BillingEnvironment,
    orderId: string,
  ): Promise<OrderAccessDecision | null> {
    const { data: row, error } = await this.supabase
      .from("billing_orders")
      .select(
        "user_id,provider_product_id,provider_checkout_id,status,paid,net_amount,currency,reported_refunded_amount,remote_modified_at,snapshot_hash",
      )
      .eq("provider", "polar")
      .eq("environment", environment)
      .eq("provider_order_id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!row) return null;
    const { data: refundRows, error: refundsError } = await this.supabase
      .from("billing_refunds")
      .select(
        "provider_refund_id,provider_payment_id,status,amount,currency,remote_modified_at,snapshot_hash",
      )
      .eq("provider", "polar")
      .eq("environment", environment)
      .eq("provider_order_id", orderId);
    if (refundsError) throw refundsError;
    const order: OrderLedgerInput = {
      environment,
      orderId,
      userId: row.user_id,
      productId: row.provider_product_id,
      checkoutId: row.provider_checkout_id,
      status: row.status,
      paid: true,
      netAmount: row.net_amount,
      currency: row.currency,
      reportedRefundedAmount: row.reported_refunded_amount,
      modifiedAt: row.remote_modified_at,
      snapshotHash: row.snapshot_hash,
    };
    const refunds = (refundRows ?? []).map((refund): RefundLedgerInput => ({
      environment,
      refundId: refund.provider_refund_id,
      orderId,
      paymentId: refund.provider_payment_id,
      status: refund.status,
      amount: refund.amount,
      currency: refund.currency,
      modifiedAt: refund.remote_modified_at,
      snapshotHash: refund.snapshot_hash,
    }));
    return decision(order, refunds);
  }

  async syncOrderAccess(
    environment: BillingEnvironment,
    orderId: string,
    capabilities: string[],
  ): Promise<void> {
    const { error } = await this.supabase.rpc("billing_sync_order_access", {
      p_environment: environment,
      p_order_id: orderId,
      p_capabilities: [...capabilities].sort(),
    });
    if (error) {
      throw Object.assign(new Error("order access sync failed"), {
        code: typeof error.code === "string" ? error.code : "ledger_failed",
      });
    }
  }
}
