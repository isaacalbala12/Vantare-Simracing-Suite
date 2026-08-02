import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MemoryOrderRefundLedger,
  type OrderLedgerInput,
  type RefundLedgerInput,
} from "./order-refund-ledger.ts";

const USER_ID = "4b6d8919-1c89-492d-a0e2-364124c17878";

function order(
  overrides: Partial<OrderLedgerInput> = {},
): OrderLedgerInput {
  return {
    environment: "sandbox",
    orderId: "order-a",
    userId: USER_ID,
    productId: "product-launch",
    checkoutId: "checkout-a",
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

function refund(
  overrides: Partial<RefundLedgerInput> = {},
): RefundLedgerInput {
  return {
    environment: "sandbox",
    refundId: "refund-a",
    orderId: "order-a",
    paymentId: "payment-a",
    status: "succeeded",
    amount: 1000,
    currency: "eur",
    modifiedAt: "2026-08-02T10:05:00.000Z",
    snapshotHash: "b".repeat(64),
    ...overrides,
  };
}

Deno.test("order/refund ledger: partial refund keeps the attributed order active", async () => {
  const ledger = new MemoryOrderRefundLedger();
  assertEquals(await ledger.recordOrder(order()), "apply");
  assertEquals(await ledger.recordRefund(refund()), "apply");

  assertEquals(await ledger.readDecision("sandbox", "order-a"), {
    order: order(),
    succeededRefundAmount: 1000,
    accessState: "active",
    projectionModifiedAt: "2026-08-02T10:05:00.000Z",
  });
});

Deno.test("order/refund ledger: multiple succeeded refunds revoke only after reaching the order net amount", async () => {
  const ledger = new MemoryOrderRefundLedger();
  await ledger.recordOrder(order());
  await ledger.recordRefund(refund());
  await ledger.recordRefund(refund({
    refundId: "refund-b",
    paymentId: "payment-b",
    amount: 2000,
    modifiedAt: "2026-08-02T10:06:00.000Z",
    snapshotHash: "c".repeat(64),
  }));

  const decision = await ledger.readDecision("sandbox", "order-a");
  assertEquals(decision?.succeededRefundAmount, 3000);
  assertEquals(decision?.accessState, "revoked");
});

Deno.test("order/refund ledger: an aggregate order.refunded amount never substitutes refund attribution", async () => {
  const ledger = new MemoryOrderRefundLedger();
  await ledger.recordOrder(order({
    status: "refunded",
    reportedRefundedAmount: 3000,
    modifiedAt: "2026-08-02T10:10:00.000Z",
    snapshotHash: "d".repeat(64),
  }));

  const decision = await ledger.readDecision("sandbox", "order-a");
  assertEquals(decision?.succeededRefundAmount, 0);
  assertEquals(decision?.accessState, "active");
});

Deno.test("order/refund ledger: pending failed and canceled refunds never revoke", async () => {
  for (const status of ["pending", "failed", "canceled"] as const) {
    const ledger = new MemoryOrderRefundLedger();
    await ledger.recordOrder(order());
    await ledger.recordRefund(refund({ status, amount: 3000 }));
    assertEquals(
      (await ledger.readDecision("sandbox", "order-a"))?.accessState,
      "active",
      status,
    );
  }
});

Deno.test("order/refund ledger: each order remains independent for the same user and product", async () => {
  const ledger = new MemoryOrderRefundLedger();
  await ledger.recordOrder(order());
  await ledger.recordOrder(order({
    orderId: "order-b",
    checkoutId: "checkout-b",
    modifiedAt: "2026-08-02T11:00:00.000Z",
    snapshotHash: "e".repeat(64),
  }));
  await ledger.recordRefund(refund({ amount: 3000 }));

  assertEquals(
    (await ledger.readDecision("sandbox", "order-a"))?.accessState,
    "revoked",
  );
  assertEquals(
    (await ledger.readDecision("sandbox", "order-b"))?.accessState,
    "active",
  );
});

Deno.test("order/refund ledger: missing order is fail closed and creates no refund", async () => {
  const ledger = new MemoryOrderRefundLedger();
  assertEquals(await ledger.recordRefund(refund()), "missing_order");
  assertEquals(ledger.refunds.size, 0);
});

Deno.test("order/refund ledger: duplicates stale events and conflicts are monotonic", async () => {
  const ledger = new MemoryOrderRefundLedger();
  assertEquals(await ledger.recordOrder(order()), "apply");
  assertEquals(await ledger.recordOrder(order()), "duplicate");
  assertEquals(
    await ledger.recordOrder(order({
      modifiedAt: "2026-08-02T09:59:00.000Z",
      snapshotHash: "f".repeat(64),
    })),
    "stale_noop",
  );
  assertEquals(
    await ledger.recordOrder(order({ snapshotHash: "f".repeat(64) })),
    "version_conflict",
  );
});

Deno.test("order/refund ledger: succeeded refund cannot regress to a non-succeeded terminal state", async () => {
  const ledger = new MemoryOrderRefundLedger();
  await ledger.recordOrder(order());
  await ledger.recordRefund(refund({ amount: 3000 }));

  assertEquals(
    await ledger.recordRefund(refund({
      status: "failed",
      amount: 3000,
      modifiedAt: "2026-08-02T10:07:00.000Z",
      snapshotHash: "f".repeat(64),
    })),
    "invalid_transition",
  );
  assertEquals(
    (await ledger.readDecision("sandbox", "order-a"))?.accessState,
    "revoked",
  );
});

Deno.test("order/refund ledger: refund currency and amount must agree with its order", async () => {
  const ledger = new MemoryOrderRefundLedger();
  await ledger.recordOrder(order());
  assertEquals(
    await ledger.recordRefund(refund({ currency: "usd" })),
    "currency_mismatch",
  );
  assertEquals(
    await ledger.recordRefund(refund({ refundId: "refund-b", amount: 3001 })),
    "refund_total_exceeds_order",
  );
  assertEquals(ledger.refunds.size, 0);
});

Deno.test("order/refund ledger: a conflicting checkout identity fails attribution", async () => {
  const ledger = new MemoryOrderRefundLedger();
  await ledger.recordOrder(order());

  assertEquals(
    await ledger.recordOrder(order({
      checkoutId: null,
      modifiedAt: "2026-08-02T10:05:00.000Z",
      snapshotHash: "8".repeat(64),
    })),
    "apply",
  );
  assertEquals(ledger.orders.get("sandbox:order-a")?.checkoutId, "checkout-a");

  assertEquals(
    await ledger.recordOrder(order({
      checkoutId: "checkout-other",
      modifiedAt: "2026-08-02T10:10:00.000Z",
      snapshotHash: "9".repeat(64),
    })),
    "invalid_attribution",
  );
  assertEquals(ledger.orders.get("sandbox:order-a")?.checkoutId, "checkout-a");
});
