import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MemorySubscriptionLifecycleStore } from "./subscription-lifecycle-store.ts";
import type { SubscriptionTransition } from "./subscription-lifecycle.ts";

const USER_ID = "4b6d8919-1c89-492d-a0e2-364124c17878";
const PAID_THROUGH = "2026-08-02T13:00:00.000Z";

function recoveryTransition(
  failureAt: string,
  cyclePaidThrough = PAID_THROUGH,
): SubscriptionTransition {
  return {
    status: "past_due",
    paidThrough: cyclePaidThrough,
    commercialGrant: { status: "revoked", validUntil: cyclePaidThrough },
    recovery: {
      action: "open",
      cyclePaidThrough,
      failureAt,
    },
  };
}

function applyRecovery(
  store: MemorySubscriptionLifecycleStore,
  modifiedAt: string,
  snapshotHash: string,
  cyclePaidThrough = PAID_THROUGH,
) {
  return store.apply({
    userId: USER_ID,
    environment: "sandbox",
    subscriptionId: "sub-monotonic",
    productId: "product-pro-monthly",
    capabilities: ["vantare.plan.pro"],
    periodStart: "2026-07-02T13:00:00.000Z",
    remotePeriodEnd: cyclePaidThrough,
    cancelAtPeriodEnd: false,
    modifiedAt,
    snapshotHash,
    transition: recoveryTransition(modifiedAt, cyclePaidThrough),
    evaluatedAt: "2026-08-02T14:00:00.000Z",
  });
}

Deno.test("MemorySubscriptionLifecycleStore accepts only an older first failure for an existing identical cycle", async () => {
  const store = new MemorySubscriptionLifecycleStore();
  await applyRecovery(
    store,
    "2026-08-02T13:45:00.000Z",
    "b".repeat(64),
  );

  await applyRecovery(
    store,
    "2026-08-02T13:05:00.000Z",
    "a".repeat(64),
  );

  assertEquals(store.cycles.size, 1);
  assertEquals(
    [...store.cycles.values()][0].firstFailureAt,
    "2026-08-02T13:05:00.000Z",
  );
  assertEquals(
    [...store.cycles.values()][0].recoveryUntil,
    "2026-08-05T13:05:00.000Z",
  );
});

Deno.test("MemorySubscriptionLifecycleStore never creates recovery from stale evidence", async () => {
  const store = new MemorySubscriptionLifecycleStore();
  await store.apply({
    userId: USER_ID,
    environment: "sandbox",
    subscriptionId: "sub-monotonic",
    productId: "product-pro-monthly",
    capabilities: ["vantare.plan.pro"],
    periodStart: "2026-08-02T13:00:00.000Z",
    remotePeriodEnd: "2026-09-02T13:00:00.000Z",
    cancelAtPeriodEnd: false,
    modifiedAt: "2026-08-02T14:00:00.000Z",
    snapshotHash: "c".repeat(64),
    transition: {
      status: "active",
      paidThrough: "2026-09-02T13:00:00.000Z",
      commercialGrant: {
        status: "active",
        validUntil: "2026-09-02T13:00:00.000Z",
      },
      recovery: { action: "close" },
    },
    evaluatedAt: "2026-08-02T14:00:00.000Z",
  });

  await applyRecovery(
    store,
    "2026-08-02T13:05:00.000Z",
    "a".repeat(64),
  );
  assertEquals(store.cycles.size, 0);
});

Deno.test("MemorySubscriptionLifecycleStore rejects conflicting snapshots at the same version", async () => {
  const store = new MemorySubscriptionLifecycleStore();
  await applyRecovery(
    store,
    "2026-08-02T13:30:00.000Z",
    "b".repeat(64),
  );
  const before = structuredClone([...store.cycles.values()]);

  await applyRecovery(
    store,
    "2026-08-02T13:30:00.000Z",
    "c".repeat(64),
  );

  assertEquals([...store.cycles.values()], before);
  assertEquals(store.cycles.size, 1);
});
