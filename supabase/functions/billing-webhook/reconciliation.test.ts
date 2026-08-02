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

const USER_ID = "4b6d8919-1c89-492d-a0e2-364124c17878";
const PRO_PRODUCT_ID = "00000000-0000-0000-0000-000000000003";

function productMap() {
  const result = loadPolarProductMap(VALID_POLAR_PRODUCT_MAP_JSON, {
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
