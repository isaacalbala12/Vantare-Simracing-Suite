import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadPolarProductMap } from "../_shared/mapping.ts";
import { VALID_POLAR_PRODUCT_MAP_JSON } from "../_shared/test-fixtures.ts";
import {
  buildReconciliationPlan,
  executeReconciliation,
  MemoryReconciliationStore,
  runReconciliationBatch,
} from "./reconciliation.ts";
import { MemorySubscriptionLifecycleStore } from "./subscription-lifecycle-store.ts";

const USER_ID = "4b6d8919-1c89-492d-a0e2-364124c17878";
const PRO_PRODUCT_ID = "00000000-0000-0000-0000-000000000003";
const PRO_PLUS_PRODUCT_ID = "00000000-0000-0000-0000-000000000005";

function productMap() {
  const result = loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
    environment: "sandbox",
  });
  if (!result.ok) throw new Error(result.message);
  return result.map;
}

function trialProductMap() {
  const raw = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON);
  raw.checkout_keys.pro_monthly.trial = {
    enabled: true,
    interval: "day",
    interval_count: 7,
    provider_anti_abuse_confirmed: true,
  };
  const result = loadPolarProductMap(JSON.stringify(raw), {
    environment: "sandbox",
    trialAntiAbuseConfirmed: true,
  });
  if (!result.ok) throw new Error(result.message);
  return result.map;
}

function proPlusProductMap() {
  const raw = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON);
  raw.checkout_keys.pro_plus_monthly = {
    polar_product_id: PRO_PLUS_PRODUCT_ID,
    polar_price_ids: ["00000000-0000-0000-0000-000000000006"],
    plan_sku: "pro_plus_monthly",
    billing_type: "subscription",
    lifetime: false,
    active: true,
    capabilities: [
      "vantare.plan.pro",
      "vantare.channel.testers",
      "vantare.channel.nightly",
    ],
    channels: ["stable", "testers", "nightly"],
    launch_scope_version: null,
    trial: { enabled: false },
    entitlement_product_key: "bundle",
  };
  raw.product_id_to_checkout_key[PRO_PLUS_PRODUCT_ID] = "pro_plus_monthly";
  raw.price_id_to_checkout_key["00000000-0000-0000-0000-000000000006"] =
    "pro_plus_monthly";
  const result = loadPolarProductMap(JSON.stringify(raw), {
    environment: "sandbox",
  });
  if (!result.ok) throw new Error(result.message);
  return result.map;
}

Deno.test("reconciliation plans active and missing subscriptions while preserving lifetime orders", async () => {
  const plan = await buildReconciliationPlan({
    userId: USER_ID,
    productMap: productMap(),
    customerState: {
      customerId: "customer-1",
      externalId: USER_ID,
      observedAt: "2026-08-02T12:00:00.000Z",
      activeSubscriptions: [{
        id: "subscription-active",
        productId: PRO_PRODUCT_ID,
        status: "active",
        modifiedAt: "2026-08-02T11:00:00.000Z",
        currentPeriodEnd: "2026-09-02T11:00:00.000Z",
      }],
      grantedBenefits: [],
    },
    localResources: [{
      resourceType: "subscription",
      resourceId: "subscription-missing",
      productId: PRO_PRODUCT_ID,
      capabilities: ["vantare.plan.pro"],
      modifiedAt: "2026-08-01T10:00:00.000Z",
      status: "active",
    }, {
      resourceType: "order",
      resourceId: "lifetime-order-not-listed-by-customer-state",
      productId: null,
      capabilities: ["vantare.edition.launch_v1"],
      modifiedAt: "2026-07-01T10:00:00.000Z",
      status: "active",
    }],
  });

  assertEquals(plan.safeToApply, true);
  assertEquals(
    plan.operations.map((operation) => ({
      id: operation.resourceId,
      status: operation.grants[0].status,
    })),
    [{ id: "subscription-active", status: "active" }, {
      id: "subscription-missing",
      status: "revoked",
    }],
  );
  assertEquals(plan.preservedResourceIds, [
    "lifetime-order-not-listed-by-customer-state",
  ]);
});

Deno.test("reconciliation dry-run performs zero writes and apply is repeatable", async () => {
  const plan = await buildReconciliationPlan({
    userId: USER_ID,
    productMap: productMap(),
    customerState: {
      customerId: "customer-1",
      externalId: USER_ID,
      observedAt: "2026-08-02T12:00:00.000Z",
      activeSubscriptions: [],
      grantedBenefits: [],
    },
    localResources: [],
  });
  const store = new MemoryReconciliationStore();
  assertEquals(
    await executeReconciliation({
      plan,
      dryRun: true,
      trigger: "manual",
      store,
    }),
    { status: "dry_run", changed: 0 },
  );
  assertEquals(store.calls, 0);
  assertEquals(
    await executeReconciliation({
      plan,
      dryRun: false,
      trigger: "scheduled",
      store,
    }),
    { status: "unchanged", changed: 0 },
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
  assertEquals(store.calls, 2);
});

Deno.test("reconciliation derives past_due recovery from the proven local paid cycle", async () => {
  const plan = await buildReconciliationPlan({
    userId: USER_ID,
    productMap: productMap(),
    customerState: {
      customerId: "customer-recovery",
      externalId: USER_ID,
      observedAt: "2026-08-02T14:00:00.000Z",
      activeSubscriptions: [{
        id: "subscription-recovery",
        productId: PRO_PRODUCT_ID,
        status: "past_due",
        modifiedAt: "2026-08-02T13:05:00.000Z",
        currentPeriodEnd: "2026-08-02T13:00:00.000Z",
      }],
      grantedBenefits: [],
    },
    localResources: [{
      resourceType: "subscription",
      resourceId: "subscription-recovery",
      productId: PRO_PRODUCT_ID,
      capabilities: ["vantare.plan.pro"],
      modifiedAt: "2026-08-01T13:00:00.000Z",
      status: "active",
      subscriptionStatus: "active",
      paidThrough: "2026-08-02T13:00:00.000Z",
    }],
  });

  assertEquals(plan.operations[0].grants[0], {
    capability: "vantare.plan.pro",
    status: "revoked",
    validUntil: "2026-08-02T13:00:00.000Z",
  });
  assertEquals(plan.subscriptionLifecycles[0].transition.recovery, {
    action: "open",
    cyclePaidThrough: "2026-08-02T13:00:00.000Z",
    failureAt: "2026-08-02T13:05:00.000Z",
  });
});

Deno.test("reconciliation supports configured Pro Plus subscriptions without losing capabilities", async () => {
  const plan = await buildReconciliationPlan({
    userId: USER_ID,
    productMap: proPlusProductMap(),
    customerState: {
      customerId: "customer-pro-plus",
      externalId: USER_ID,
      observedAt: "2026-08-02T12:00:00.000Z",
      activeSubscriptions: [{
        id: "subscription-pro-plus",
        productId: PRO_PLUS_PRODUCT_ID,
        status: "active",
        modifiedAt: "2026-08-02T11:00:00.000Z",
        currentPeriodEnd: "2026-09-02T11:00:00.000Z",
      }],
      grantedBenefits: [],
    },
    localResources: [],
  });
  assertEquals(plan.safeToApply, true);
  assertEquals(plan.operations[0].grants.map((grant) => grant.capability), [
    "vantare.channel.nightly",
    "vantare.channel.testers",
    "vantare.plan.pro",
  ]);
  assertEquals(plan.subscriptionLifecycles[0].capabilities, [
    "vantare.plan.pro",
    "vantare.channel.testers",
    "vantare.channel.nightly",
  ]);
});

Deno.test("reconciliation accepts trial only when the mapped subscription explicitly enables it", async () => {
  const customerState = {
    customerId: "customer-trial",
    externalId: USER_ID,
    observedAt: "2026-08-02T12:00:00.000Z",
    activeSubscriptions: [{
      id: "subscription-trial",
      productId: PRO_PRODUCT_ID,
      status: "trialing",
      modifiedAt: "2026-08-02T11:00:00.000Z",
      currentPeriodEnd: "2026-08-09T11:00:00.000Z",
    }],
    grantedBenefits: [],
  };
  const disabled = await buildReconciliationPlan({
    userId: USER_ID,
    productMap: productMap(),
    customerState,
    localResources: [],
  });
  assertEquals(disabled.safeToApply, false);
  assertEquals(disabled.issues[0].code, "subscription_trial_not_configured");

  const enabled = await buildReconciliationPlan({
    userId: USER_ID,
    productMap: trialProductMap(),
    customerState,
    localResources: [],
  });
  assertEquals(enabled.safeToApply, true);
  assertEquals(enabled.operations[0].grants[0].status, "active");
});

Deno.test("reconciliation quarantines bounded subscription states without a proven period end", async () => {
  for (
    const [index, subscription] of [
      { status: "active" },
      { status: "trialing", trial: true },
      { status: "past_due" },
      { status: "canceled", cancelAtPeriodEnd: true },
    ].entries()
  ) {
    const plan = await buildReconciliationPlan({
      userId: USER_ID,
      productMap: subscription.trial ? trialProductMap() : productMap(),
      customerState: {
        customerId: `customer-period-missing-${index}`,
        externalId: USER_ID,
        observedAt: "2026-08-02T12:00:00.000Z",
        activeSubscriptions: [{
          id: `subscription-period-missing-${index}`,
          productId: PRO_PRODUCT_ID,
          status: subscription.status,
          modifiedAt: "2026-08-02T11:00:00.000Z",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }],
        grantedBenefits: [],
      },
      localResources: [],
    });

    assertEquals(plan.safeToApply, false);
    assertEquals(plan.issues, [{
      code: "missing_subscription_period_end",
      resourceId: `subscription-period-missing-${index}`,
    }]);
    assertEquals(plan.operations, []);
    assertEquals(plan.subscriptionLifecycles, []);
  }
});

Deno.test("reconciliation permits an immediate cancellation without a period end", async () => {
  const plan = await buildReconciliationPlan({
    userId: USER_ID,
    productMap: productMap(),
    customerState: {
      customerId: "customer-immediate-cancel",
      externalId: USER_ID,
      observedAt: "2026-08-02T12:00:00.000Z",
      activeSubscriptions: [{
        id: "subscription-immediate-cancel",
        productId: PRO_PRODUCT_ID,
        status: "canceled",
        modifiedAt: "2026-08-02T11:00:00.000Z",
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      }],
      grantedBenefits: [],
    },
    localResources: [],
  });

  assertEquals(plan.safeToApply, true);
  assertEquals(plan.operations[0].grants[0].status, "revoked");
  assertEquals(
    plan.subscriptionLifecycles[0].transition.recovery.action,
    "close",
  );
});

Deno.test("reconciliation closes recovery for a remotely absent revoked subscription", async () => {
  const plan = await buildReconciliationPlan({
    userId: USER_ID,
    productMap: productMap(),
    customerState: {
      customerId: "customer-absent-recovery",
      externalId: USER_ID,
      observedAt: "2026-08-03T12:00:00.000Z",
      activeSubscriptions: [],
      grantedBenefits: [],
    },
    localResources: [{
      resourceType: "subscription",
      resourceId: "subscription-absent-recovery",
      productId: PRO_PRODUCT_ID,
      capabilities: ["vantare.plan.pro"],
      modifiedAt: "2026-08-02T13:05:00.000Z",
      status: "revoked",
      subscriptionStatus: "past_due",
      paidThrough: "2026-08-02T13:00:00.000Z",
    }],
  });

  assertEquals(plan.safeToApply, true);
  assertEquals(plan.subscriptionLifecycles.length, 1);
  assertEquals(
    plan.subscriptionLifecycles[0].transition.recovery.action,
    "close",
  );
});

Deno.test("reconciliation dry-run never applies lifecycle and unchanged replay repairs a failed lifecycle", async () => {
  const plan = await buildReconciliationPlan({
    userId: USER_ID,
    productMap: productMap(),
    customerState: {
      customerId: "customer-lifecycle-replay",
      externalId: USER_ID,
      observedAt: "2026-08-02T14:00:00.000Z",
      activeSubscriptions: [{
        id: "subscription-lifecycle-replay",
        productId: PRO_PRODUCT_ID,
        status: "past_due",
        modifiedAt: "2026-08-02T13:05:00.000Z",
        currentPeriodEnd: "2026-08-02T13:00:00.000Z",
      }],
      grantedBenefits: [],
    },
    localResources: [{
      resourceType: "subscription",
      resourceId: "subscription-lifecycle-replay",
      productId: PRO_PRODUCT_ID,
      capabilities: ["vantare.plan.pro"],
      modifiedAt: "2026-08-01T13:00:00.000Z",
      status: "active",
      subscriptionStatus: "active",
      paidThrough: "2026-08-02T13:00:00.000Z",
    }],
  });
  const store = new MemoryReconciliationStore();
  const lifecycle = new MemorySubscriptionLifecycleStore();
  assertEquals(
    await executeReconciliation({
      plan,
      dryRun: true,
      trigger: "manual",
      store,
      lifecycle,
    }),
    { status: "dry_run", changed: 0 },
  );
  assertEquals(lifecycle.cycles.size, 0);

  lifecycle.failNextApply();
  await assertRejects(
    () =>
      executeReconciliation({
        plan,
        dryRun: false,
        trigger: "scheduled",
        store,
        lifecycle,
      }),
    Error,
    "test lifecycle failure",
  );
  assertEquals(store.appliedPlanHashes.has(plan.planHash), true);
  assertEquals(lifecycle.cycles.size, 0);

  assertEquals(
    await executeReconciliation({
      plan,
      dryRun: false,
      trigger: "scheduled",
      store,
      lifecycle,
    }),
    { status: "unchanged", changed: 0 },
  );
  assertEquals(lifecycle.cycles.size, 1);
});

Deno.test("reconciliation converges a late first failure for the same recovery cycle", async () => {
  const common = {
    userId: USER_ID,
    productMap: productMap(),
    localResources: [{
      resourceType: "subscription" as const,
      resourceId: "subscription-late-recovery",
      productId: PRO_PRODUCT_ID,
      capabilities: ["vantare.plan.pro"],
      modifiedAt: "2026-08-01T13:00:00.000Z",
      status: "active" as const,
      subscriptionStatus: "past_due",
      paidThrough: "2026-08-02T13:00:00.000Z",
    }],
  };
  const customerState = {
    customerId: "customer-late-recovery",
    externalId: USER_ID,
    observedAt: "2026-08-02T14:00:00.000Z",
    grantedBenefits: [],
  };
  const lifecycle = new MemorySubscriptionLifecycleStore();
  const store = new MemoryReconciliationStore();
  const retry = await buildReconciliationPlan({
    ...common,
    customerState: {
      ...customerState,
      activeSubscriptions: [{
        id: "subscription-late-recovery",
        productId: PRO_PRODUCT_ID,
        status: "past_due",
        modifiedAt: "2026-08-02T13:45:00.000Z",
        currentPeriodEnd: "2026-08-02T13:00:00.000Z",
      }],
    },
  });
  await executeReconciliation({
    plan: retry,
    dryRun: false,
    trigger: "scheduled",
    store,
    lifecycle,
  });

  const original = await buildReconciliationPlan({
    ...common,
    customerState: {
      ...customerState,
      activeSubscriptions: [{
        id: "subscription-late-recovery",
        productId: PRO_PRODUCT_ID,
        status: "past_due",
        modifiedAt: "2026-08-02T13:05:00.000Z",
        currentPeriodEnd: "2026-08-02T13:00:00.000Z",
      }],
    },
  });
  await executeReconciliation({
    plan: original,
    dryRun: false,
    trigger: "scheduled",
    store,
    lifecycle,
  });

  assertEquals(
    [...lifecycle.cycles.values()][0].firstFailureAt,
    "2026-08-02T13:05:00.000Z",
  );
  assertEquals(
    [...lifecycle.cycles.values()][0].recoveryUntil,
    "2026-08-05T13:05:00.000Z",
  );
});

Deno.test("unknown Customer State benefits quarantine the plan", async () => {
  const plan = await buildReconciliationPlan({
    userId: USER_ID,
    productMap: productMap(),
    customerState: {
      customerId: "customer-1",
      externalId: USER_ID,
      observedAt: "2026-08-02T12:00:00.000Z",
      activeSubscriptions: [],
      grantedBenefits: [{
        id: "grant-unknown",
        benefitId: "benefit-unknown",
        modifiedAt: "2026-08-02T11:30:00.000Z",
      }],
    },
    localResources: [],
  });
  const store = new MemoryReconciliationStore();
  assertEquals(plan.safeToApply, false);
  assertEquals(
    await executeReconciliation({
      plan,
      dryRun: false,
      trigger: "manual",
      store,
    }),
    { status: "quarantined", changed: 0 },
  );
  assertEquals(store.calls, 0);
});

Deno.test("a local benefit absent from Customer State is revoked from its own capabilities", async () => {
  const plan = await buildReconciliationPlan({
    userId: USER_ID,
    productMap: productMap(),
    customerState: {
      customerId: "customer-1",
      externalId: USER_ID,
      observedAt: "2026-08-02T12:00:00.000Z",
      activeSubscriptions: [],
      grantedBenefits: [],
    },
    localResources: [{
      resourceType: "benefit_grant",
      resourceId: "benefit-grant-missing",
      productId: null,
      capabilities: ["vantare.channel.nightly"],
      modifiedAt: "2026-08-01T12:00:00.000Z",
      status: "active",
    }],
  });
  assertEquals(plan.safeToApply, true);
  assertEquals(plan.operations[0].resourceType, "benefit_grant");
  assertEquals(plan.operations[0].grants, [{
    capability: "vantare.channel.nightly",
    status: "revoked",
    validUntil: "2026-08-02T12:00:00.000Z",
  }]);
});

Deno.test("Customer State array order does not change snapshot or plan identity", async () => {
  const subscriptions = ["subscription-b", "subscription-a"].map((id) => ({
    id,
    productId: PRO_PRODUCT_ID,
    status: "active",
    modifiedAt: "2026-08-02T11:00:00.000Z",
    currentPeriodEnd: "2026-09-02T11:00:00.000Z",
  }));
  const common = {
    userId: USER_ID,
    productMap: productMap(),
    localResources: [],
  };
  const first = await buildReconciliationPlan({
    ...common,
    customerState: {
      customerId: "customer-1",
      externalId: USER_ID,
      observedAt: "2026-08-02T12:00:00.000Z",
      activeSubscriptions: subscriptions,
      grantedBenefits: [],
    },
  });
  const second = await buildReconciliationPlan({
    ...common,
    customerState: {
      customerId: "customer-1",
      externalId: USER_ID,
      observedAt: "2026-08-02T12:00:00.000Z",
      activeSubscriptions: [...subscriptions].reverse(),
      grantedBenefits: [],
    },
  });
  assertEquals(first.snapshotHash, second.snapshotHash);
  assertEquals(first.planHash, second.planHash);
});

Deno.test("batch reconciliation follows cursors and honors cancellation", async () => {
  const cursors: Array<string | null> = [];
  const processed: string[] = [];
  const controller = new AbortController();
  const count = await runReconciliationBatch({
    signal: controller.signal,
    source: {
      listPage: ({ cursor }) => {
        cursors.push(cursor);
        return Promise.resolve(
          cursor === null
            ? {
              targets: [{ userId: "1", externalId: "one" }],
              nextCursor: "page-2",
            }
            : {
              targets: [{ userId: "2", externalId: "two" }],
              nextCursor: null,
            },
        );
      },
    },
    reconcile: (target) => {
      processed.push(target.externalId);
      return Promise.resolve();
    },
  });
  assertEquals(count, 2);
  assertEquals(cursors, [null, "page-2"]);
  assertEquals(processed, ["one", "two"]);

  controller.abort();
  await assertRejects(
    () =>
      runReconciliationBatch({
        signal: controller.signal,
        source: {
          listPage: () => Promise.reject(new Error("must not be called")),
        },
        reconcile: () => Promise.resolve(),
      }),
    DOMException,
    "aborted",
  );
});
