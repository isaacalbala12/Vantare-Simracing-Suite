import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type CommercialResourceSnapshot,
  compareResourceVersion,
  MemoryCommercialProjection,
} from "./commercial-projection.ts";

Deno.test("commercial projection rejects an older resource snapshot", () => {
  assertEquals(
    compareResourceVersion(
      {
        modifiedAt: "2026-08-02T12:00:00.000Z",
        snapshotHash: "newer-hash",
      },
      {
        modifiedAt: "2026-08-02T11:59:59.000Z",
        snapshotHash: "older-hash",
      },
    ),
    "stale_noop",
  );
});

Deno.test("commercial projection quarantines equal versions with different bodies", () => {
  assertEquals(
    compareResourceVersion(
      {
        modifiedAt: "2026-08-02T12:00:00.000Z",
        snapshotHash: "first-hash",
      },
      {
        modifiedAt: "2026-08-02T12:00:00.000Z",
        snapshotHash: "different-hash",
      },
    ),
    "version_conflict",
  );
});

Deno.test("commercial projection treats an equal version and hash as an idempotent duplicate", async () => {
  const projection = new MemoryCommercialProjection();
  const snapshot: CommercialResourceSnapshot = {
    provider: "polar",
    environment: "sandbox",
    resourceType: "subscription",
    resourceId: "sub-1",
    userId: "00000000-0000-4000-8000-000000000001",
    modifiedAt: "2026-08-02T12:00:00.000Z",
    snapshotHash: "same-hash",
    state: "active",
    grants: [{
      capability: "vantare.plan.pro",
      status: "active",
      validUntil: "2026-09-02T12:00:00.000Z",
    }],
  };

  assertEquals(await projection.apply(snapshot), {
    outcome: "apply",
    grantsChanged: 1,
  });
  assertEquals(await projection.apply(snapshot), {
    outcome: "duplicate",
    grantsChanged: 0,
  });
  assertEquals(projection.resources.size, 1);
  assertEquals(projection.grants.size, 1);
});

Deno.test("commercial projection converges when a newer snapshot arrives before an older one", async () => {
  const projection = new MemoryCommercialProjection();
  const base: CommercialResourceSnapshot = {
    provider: "polar",
    environment: "sandbox",
    resourceType: "order",
    resourceId: "order-1",
    userId: "00000000-0000-4000-8000-000000000001",
    modifiedAt: "2026-08-02T12:00:00.000Z",
    snapshotHash: "paid-hash",
    state: "paid",
    grants: [{
      capability: "vantare.edition.launch_v1",
      status: "active",
      validUntil: null,
    }],
  };
  const refunded: CommercialResourceSnapshot = {
    ...base,
    modifiedAt: "2026-08-02T13:00:00.000Z",
    snapshotHash: "refunded-hash",
    state: "refunded",
    grants: base.grants.map((grant) => ({ ...grant, status: "revoked" })),
  };

  assertEquals((await projection.apply(refunded)).outcome, "apply");
  assertEquals((await projection.apply(base)).outcome, "stale_noop");
  assertEquals([...projection.grants.values()][0].status, "revoked");
});
