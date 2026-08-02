import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  loadPolarProductMap,
  resolveCheckoutKeyByProductId,
} from "../_shared/mapping.ts";
import {
  FULL_SANDBOX_PRODUCT_MAP_JSON,
  SANDBOX_IDS,
} from "../_shared/test-fixtures.ts";
import {
  buildReconciliationPlan,
  executeReconciliation,
  MemoryReconciliationStore,
} from "./reconciliation.ts";
import {
  MemoryOrderRefundLedger,
  type OrderLedgerInput,
  type RefundLedgerInput,
} from "./order-refund-ledger.ts";
import { reconcileOrderRefundLedger } from "./order-refund-reconciliation.ts";
import {
  deriveSubscriptionTransition,
  mergeRecoveryCycle,
} from "./subscription-lifecycle.ts";

type MatrixCase = {
  id: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  periodEnd: string;
  previousPaidThrough: string | null;
  expectedGrant: "active" | "revoked";
  expectedRecovery: "open" | "close" | "none";
};

type LifecycleMatrix = {
  schemaVersion: number;
  observedAt: string;
  subscriptionCases: MatrixCase[];
};

const USER_ID = "00000000-0000-0000-0000-000000000200";
const MATRIX_URL = new URL(
  "./testdata/lifecycle-matrix.v1.json",
  import.meta.url,
);

async function loadMatrix(): Promise<LifecycleMatrix> {
  return JSON.parse(await Deno.readTextFile(MATRIX_URL)) as LifecycleMatrix;
}

function productMap() {
  const result = loadPolarProductMap(FULL_SANDBOX_PRODUCT_MAP_JSON, {
    environment: "sandbox",
    trialAntiAbuseConfirmed: true,
  });
  if (!result.ok) throw new Error(result.message);
  return result.map;
}

Deno.test("BIL-09 lifecycle matrix: versioned subscription states fail closed", async () => {
  const matrix = await loadMatrix();
  assertEquals(matrix.schemaVersion, 1);
  assert(matrix.subscriptionCases.length >= 9);

  for (const scenario of matrix.subscriptionCases) {
    const transition = deriveSubscriptionTransition({
      status: scenario.status,
      cancelAtPeriodEnd: scenario.cancelAtPeriodEnd,
      currentPeriodEnd: scenario.periodEnd,
      remoteModifiedAt: matrix.observedAt,
      previous: scenario.previousPaidThrough
        ? { status: "active", paidThrough: scenario.previousPaidThrough }
        : null,
      now: new Date(matrix.observedAt),
    });
    assertEquals(
      transition.commercialGrant.status,
      scenario.expectedGrant,
      `${scenario.id}: grant`,
    );
    assertEquals(
      transition.recovery.action,
      scenario.expectedRecovery,
      `${scenario.id}: recovery`,
    );
  }

  assertEquals(
    mergeRecoveryCycle(null, {
      cyclePaidThrough: "2026-08-02T11:59:59.000Z",
      failureAt: "2026-08-02T12:00:00.000Z",
    }),
    {
      cyclePaidThrough: "2026-08-02T11:59:59.000Z",
      firstFailureAt: "2026-08-02T12:00:00.000Z",
      recoveryUntil: "2026-08-05T12:00:00.000Z",
    },
  );
});

Deno.test("BIL-09 lifecycle matrix: catalog, customer state and benefits converge twice", async () => {
  const map = productMap();
  assertEquals(Object.keys(map.checkout_keys).sort(), [
    "launch_lifetime",
    "pro_monthly",
    "pro_plus_monthly",
  ]);
  assertEquals(map.checkout_keys.pro_monthly?.trial, {
    enabled: true,
    interval: "day",
    interval_count: 7,
    provider_anti_abuse_confirmed: true,
  });
  assertEquals(map.checkout_keys.pro_plus_monthly?.channels, [
    "stable",
    "testers",
    "nightly",
  ]);

  const plan = await buildReconciliationPlan({
    userId: USER_ID,
    productMap: map,
    benefitCapabilities: {
      "benefit-support": ["vantare.support.discord"],
    },
    customerState: {
      customerId: "sandbox-customer",
      externalId: USER_ID,
      observedAt: "2026-08-02T12:00:00.000Z",
      activeSubscriptions: [{
        id: "subscription-pro-plus",
        productId: SANDBOX_IDS.proPlusProduct,
        status: "active",
        modifiedAt: "2026-08-02T11:00:00.000Z",
        currentPeriodStart: "2026-08-02T10:00:00.000Z",
        currentPeriodEnd: "2026-09-02T10:00:00.000Z",
        cancelAtPeriodEnd: false,
      }],
      grantedBenefits: [{
        id: "benefit-grant-support",
        benefitId: "benefit-support",
        modifiedAt: "2026-08-02T11:05:00.000Z",
      }],
    },
    localResources: [{
      resourceType: "subscription",
      resourceId: "subscription-old-pro",
      productId: SANDBOX_IDS.proProduct,
      capabilities: ["vantare.plan.pro"],
      modifiedAt: "2026-08-01T10:00:00.000Z",
      status: "active",
      subscriptionStatus: "active",
      paidThrough: "2026-08-02T10:00:00.000Z",
    }, {
      resourceType: "order",
      resourceId: "order-launch-preserved",
      productId: SANDBOX_IDS.launchProduct,
      capabilities: ["vantare.edition.launch_v1"],
      modifiedAt: "2026-07-01T10:00:00.000Z",
      status: "active",
    }],
  });

  assertEquals(plan.safeToApply, true);
  assertEquals(plan.issues, []);
  assertEquals(plan.preservedResourceIds, ["order-launch-preserved"]);
  assertEquals(
    plan.operations.map((operation) => ({
      resource: `${operation.resourceType}:${operation.resourceId}`,
      grants: operation.grants.map((grant) =>
        `${grant.capability}:${grant.status}`
      ),
    })),
    [{
      resource: "benefit_grant:benefit-grant-support",
      grants: ["vantare.support.discord:active"],
    }, {
      resource: "subscription:subscription-old-pro",
      grants: ["vantare.plan.pro:revoked"],
    }, {
      resource: "subscription:subscription-pro-plus",
      grants: [
        "vantare.channel.nightly:active",
        "vantare.channel.testers:active",
        "vantare.plan.pro:active",
      ],
    }],
  );

  const store = new MemoryReconciliationStore();
  assertEquals(
    await executeReconciliation({
      plan,
      dryRun: false,
      trigger: "scheduled",
      store,
    }),
    { status: "applied", changed: 3 },
  );
  assertEquals(
    await executeReconciliation({
      plan,
      dryRun: false,
      trigger: "scheduled",
      store,
    }),
    { status: "unchanged", changed: 0 },
  );
});

Deno.test("BIL-09 lifecycle matrix: reverse-order refunds converge and only total refund revokes", async () => {
  const ledger = new MemoryOrderRefundLedger();
  const orders: OrderLedgerInput[] = [
    order("order-independent", "2026-08-02T10:01:00.000Z"),
    order("order-refunded", "2026-08-02T10:00:00.000Z"),
  ].reverse();
  const refunds = ([{
    environment: "sandbox",
    refundId: "refund-final",
    orderId: "order-refunded",
    paymentId: "payment-refunded",
    status: "succeeded",
    amount: 2000,
    currency: "eur",
    modifiedAt: "2026-08-02T10:03:00.000Z",
    snapshotHash: "3".repeat(64),
  }, {
    environment: "sandbox",
    refundId: "refund-partial",
    orderId: "order-refunded",
    paymentId: "payment-refunded",
    status: "succeeded",
    amount: 1000,
    currency: "eur",
    modifiedAt: "2026-08-02T10:02:00.000Z",
    snapshotHash: "2".repeat(64),
  }] satisfies RefundLedgerInput[]).reverse();
  const capabilitiesForProduct = (productId: string) => {
    const resolved = resolveCheckoutKeyByProductId(productMap(), productId);
    return resolved.ok ? resolved.config.capabilities : null;
  };

  const partial = await reconcileOrderRefundLedger({
    environment: "sandbox",
    orders,
    refunds: refunds.filter((refund) => refund.refundId === "refund-partial"),
    ledger,
    capabilitiesForProduct,
  });
  assertEquals(partial.safe, true);
  assertEquals(
    ledger.grants.get(
      "sandbox:order-refunded:vantare.edition.launch_v1",
    ),
    "active",
  );

  const total = await reconcileOrderRefundLedger({
    environment: "sandbox",
    orders,
    refunds,
    ledger,
    capabilitiesForProduct,
  });
  const duplicate = await reconcileOrderRefundLedger({
    environment: "sandbox",
    orders,
    refunds,
    ledger,
    capabilitiesForProduct,
  });

  assertEquals(total.safe, true);
  assertEquals(duplicate.safe, true);
  assertEquals(total.ordersSynced, ["order-independent", "order-refunded"]);
  assertEquals(duplicate.ordersSynced, total.ordersSynced);
  assertEquals(
    ledger.grants.get(
      "sandbox:order-refunded:vantare.edition.launch_v1",
    ),
    "revoked",
  );
  assertEquals(
    ledger.grants.get(
      "sandbox:order-independent:vantare.edition.launch_v1",
    ),
    "active",
  );
});

Deno.test("BIL-09 lifecycle matrix: unknown product is quarantined without a grant", async () => {
  const ledger = new MemoryOrderRefundLedger();
  const result = await reconcileOrderRefundLedger({
    environment: "sandbox",
    orders: [{
      ...order("order-unknown", "2026-08-02T10:00:00.000Z"),
      productId: "unknown-product",
    }],
    refunds: [],
    ledger,
    capabilitiesForProduct: () => null,
  });
  assertEquals(result.safe, false);
  assertEquals(result.issues[0].reason, "unknown_product");
  assertEquals(ledger.grants.size, 0);
});

function order(orderId: string, modifiedAt: string): OrderLedgerInput {
  return {
    environment: "sandbox",
    orderId,
    userId: USER_ID,
    productId: SANDBOX_IDS.launchProduct,
    checkoutId: null,
    status: "paid",
    paid: true,
    netAmount: 3000,
    currency: "eur",
    reportedRefundedAmount: 0,
    modifiedAt,
    snapshotHash: "1".repeat(64),
  };
}
