import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MemoryOrderRefundLedger,
  type OrderLedgerInput,
  type RefundLedgerInput,
} from "./order-refund-ledger.ts";
import { reconcileOrderRefundLedger } from "./order-refund-reconciliation.ts";

const USER_ID = "4b6d8919-1c89-492d-a0e2-364124c17878";

function order(overrides: Partial<OrderLedgerInput> = {}): OrderLedgerInput {
  return {
    environment: "sandbox",
    orderId: "order-a",
    userId: USER_ID,
    productId: "product-launch",
    checkoutId: null,
    status: "paid",
    paid: true,
    netAmount: 3000,
    currency: "eur",
    reportedRefundedAmount: 0,
    modifiedAt: "2026-08-02T10:00:00.000Z",
    snapshotHash: "a".repeat(64),
    ...overrides,
  };
}

function refund(overrides: Partial<RefundLedgerInput> = {}): RefundLedgerInput {
  return {
    environment: "sandbox",
    refundId: "refund-a",
    orderId: "order-a",
    paymentId: "payment-a",
    status: "succeeded",
    amount: 3000,
    currency: "eur",
    modifiedAt: "2026-08-02T10:05:00.000Z",
    snapshotHash: "b".repeat(64),
    ...overrides,
  };
}

const capabilities = (productId: string) =>
  productId === "product-launch"
    ? ["vantare.edition.launch_v1", "vantare.plan.pro"]
    : null;

Deno.test("order/refund reconciliation: unordered API pages converge and preserve an independent later order", async () => {
  const ledger = new MemoryOrderRefundLedger();
  const result = await reconcileOrderRefundLedger({
    environment: "sandbox",
    orders: [
      order({
        orderId: "order-b",
        modifiedAt: "2026-08-02T11:00:00.000Z",
        snapshotHash: "c".repeat(64),
      }),
      order(),
    ],
    refunds: [refund()],
    ledger,
    capabilitiesForProduct: capabilities,
  });

  assertEquals(result, {
    ordersObserved: 2,
    refundsObserved: 1,
    ordersSynced: ["order-a", "order-b"],
    issues: [],
    safe: true,
  });
  assertEquals(
    ledger.grants.get("sandbox:order-a:vantare.plan.pro"),
    "revoked",
  );
  assertEquals(ledger.grants.get("sandbox:order-b:vantare.plan.pro"), "active");
});

Deno.test("order/refund reconciliation: order aggregate alone remains active", async () => {
  const ledger = new MemoryOrderRefundLedger();
  const result = await reconcileOrderRefundLedger({
    environment: "sandbox",
    orders: [order({
      status: "refunded",
      reportedRefundedAmount: 3000,
    })],
    refunds: [],
    ledger,
    capabilitiesForProduct: capabilities,
  });

  assertEquals(result.safe, true);
  assertEquals(ledger.grants.get("sandbox:order-a:vantare.plan.pro"), "active");
});

Deno.test("order/refund reconciliation: missing order is quarantined and never synced", async () => {
  const ledger = new MemoryOrderRefundLedger();
  const result = await reconcileOrderRefundLedger({
    environment: "sandbox",
    orders: [],
    refunds: [refund()],
    ledger,
    capabilitiesForProduct: capabilities,
  });

  assertEquals(result.safe, false);
  assertEquals(result.ordersSynced, []);
  assertEquals(result.issues, [{
    resourceType: "refund",
    resourceId: "refund-a",
    orderId: "order-a",
    reason: "missing_order",
  }]);
  assertEquals(ledger.grants.size, 0);
});

Deno.test("order/refund reconciliation: unknown product remains quarantined without access", async () => {
  const ledger = new MemoryOrderRefundLedger();
  const result = await reconcileOrderRefundLedger({
    environment: "sandbox",
    orders: [order({ productId: "unknown" })],
    refunds: [],
    ledger,
    capabilitiesForProduct: capabilities,
  });

  assertEquals(result.safe, false);
  assertEquals(result.ordersSynced, []);
  assertEquals(result.issues[0].reason, "unknown_product");
  assertEquals(ledger.grants.size, 0);
});
