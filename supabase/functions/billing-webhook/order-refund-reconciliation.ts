import type { BillingEnvironment } from "../_shared/mapping.ts";
import {
  type LedgerWriteOutcome,
  type OrderLedgerInput,
  type OrderRefundLedger,
  type RefundLedgerInput,
} from "./order-refund-ledger.ts";

export type OrderRefundReconciliationIssue = {
  resourceType: "order" | "refund";
  resourceId: string;
  orderId: string;
  reason:
    | Exclude<
      LedgerWriteOutcome,
      "apply" | "duplicate" | "stale_noop"
    >
    | "unknown_product";
};

export type OrderRefundReconciliationResult = {
  ordersObserved: number;
  refundsObserved: number;
  ordersSynced: string[];
  issues: OrderRefundReconciliationIssue[];
  safe: boolean;
};

function byVersionAndId<T extends { modifiedAt: string }>(
  id: (item: T) => string,
): (left: T, right: T) => number {
  return (left, right) =>
    Date.parse(left.modifiedAt) - Date.parse(right.modifiedAt) ||
    id(left).localeCompare(id(right));
}

function unsafe(
  outcome: LedgerWriteOutcome,
):
  | Exclude<
    LedgerWriteOutcome,
    "apply" | "duplicate" | "stale_noop"
  >
  | null {
  return outcome === "apply" || outcome === "duplicate" ||
      outcome === "stale_noop"
    ? null
    : outcome;
}

/**
 * Replays a read-only Polar order/refund snapshot into the same monotonic
 * ledger used by webhooks. Orders are always materialized before refunds, so
 * API pagination or delivery order cannot make a valid refund unattributable.
 */
export async function reconcileOrderRefundLedger(args: {
  environment: BillingEnvironment;
  orders: OrderLedgerInput[];
  refunds: RefundLedgerInput[];
  ledger: OrderRefundLedger;
  capabilitiesForProduct: (productId: string) => string[] | null;
}): Promise<OrderRefundReconciliationResult> {
  const issues: OrderRefundReconciliationIssue[] = [];
  const affectedOrders = new Set<string>();
  const unsafeOrders = new Set<string>();
  const orders = [...args.orders]
    .filter((order) => order.environment === args.environment)
    .sort(byVersionAndId((order) => order.orderId));
  const refunds = [...args.refunds]
    .filter((refund) => refund.environment === args.environment)
    .sort(byVersionAndId((refund) => refund.refundId));

  for (const order of orders) {
    affectedOrders.add(order.orderId);
    const reason = unsafe(await args.ledger.recordOrder(order));
    if (!reason) continue;
    unsafeOrders.add(order.orderId);
    issues.push({
      resourceType: "order",
      resourceId: order.orderId,
      orderId: order.orderId,
      reason,
    });
  }
  for (const refund of refunds) {
    affectedOrders.add(refund.orderId);
    const reason = unsafe(await args.ledger.recordRefund(refund));
    if (!reason) continue;
    unsafeOrders.add(refund.orderId);
    issues.push({
      resourceType: "refund",
      resourceId: refund.refundId,
      orderId: refund.orderId,
      reason,
    });
  }

  const ordersSynced: string[] = [];
  for (const orderId of [...affectedOrders].sort()) {
    if (unsafeOrders.has(orderId)) continue;
    const decision = await args.ledger.readDecision(args.environment, orderId);
    if (!decision) {
      issues.push({
        resourceType: "order",
        resourceId: orderId,
        orderId,
        reason: "missing_order",
      });
      continue;
    }
    const capabilities = args.capabilitiesForProduct(
      decision.order.productId,
    );
    if (!capabilities?.length) {
      issues.push({
        resourceType: "order",
        resourceId: orderId,
        orderId,
        reason: "unknown_product",
      });
      continue;
    }
    await args.ledger.syncOrderAccess(
      args.environment,
      orderId,
      capabilities,
    );
    ordersSynced.push(orderId);
  }

  issues.sort((left, right) =>
    `${left.orderId}:${left.resourceType}:${left.resourceId}`.localeCompare(
      `${right.orderId}:${right.resourceType}:${right.resourceId}`,
    )
  );
  return {
    ordersObserved: orders.length,
    refundsObserved: refunds.length,
    ordersSynced,
    issues,
    safe: issues.length === 0,
  };
}
