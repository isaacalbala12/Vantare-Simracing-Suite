import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  deriveSubscriptionTransition,
  isGrantActiveAt,
  mergeRecoveryCycle,
  type SubscriptionLifecycleState,
} from "./subscription-lifecycle.ts";

const NOW = new Date("2026-08-02T12:00:00.000Z");
const PAID_THROUGH = "2026-08-02T13:00:00.000Z";

function transition(
  status: string,
  overrides: Partial<Parameters<typeof deriveSubscriptionTransition>[0]> = {},
) {
  return deriveSubscriptionTransition({
    status,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: PAID_THROUGH,
    remoteModifiedAt: "2026-08-02T12:05:00.000Z",
    previous: null,
    now: NOW,
    ...overrides,
  });
}

Deno.test("subscription lifecycle: incomplete never grants", () => {
  assertEquals(transition("incomplete"), {
    status: "incomplete",
    paidThrough: null,
    commercialGrant: { status: "revoked", validUntil: null },
    recovery: { action: "close" },
  });
});

Deno.test("subscription lifecycle: active is bounded by proven paidThrough", () => {
  assertEquals(transition("active"), {
    status: "active",
    paidThrough: PAID_THROUGH,
    commercialGrant: { status: "active", validUntil: PAID_THROUGH },
    recovery: { action: "close" },
  });
  assertEquals(
    transition("active", { currentPeriodEnd: null }).commercialGrant.status,
    "revoked",
  );
  assertEquals(
    transition("active", {
      currentPeriodEnd: "2026-08-02T12:00:00.000Z",
    }).commercialGrant.status,
    "revoked",
  );
});

Deno.test("subscription lifecycle: canceled at period end keeps only paid time", () => {
  assertEquals(
    transition("canceled", { cancelAtPeriodEnd: true }).commercialGrant,
    { status: "active", validUntil: PAID_THROUGH },
  );
  assertEquals(
    transition("canceled", { cancelAtPeriodEnd: false }).commercialGrant,
    { status: "revoked", validUntil: PAID_THROUGH },
  );
});

Deno.test("subscription lifecycle: uncanceled needs a future paidThrough", () => {
  assertEquals(transition("uncanceled").commercialGrant, {
    status: "active",
    validUntil: PAID_THROUGH,
  });
  assertEquals(
    transition("uncanceled", { currentPeriodEnd: "not-a-date" })
      .commercialGrant.status,
    "revoked",
  );
});

Deno.test("subscription lifecycle: past_due never invents paidThrough", () => {
  assertEquals(transition("past_due"), {
    status: "past_due",
    paidThrough: null,
    commercialGrant: { status: "revoked", validUntil: null },
    recovery: { action: "none", reason: "paid_through_unproven" },
  });
});

Deno.test("subscription lifecycle: past_due opens recovery for the proven cycle", () => {
  const previous: SubscriptionLifecycleState = {
    status: "active",
    paidThrough: PAID_THROUGH,
  };
  assertEquals(transition("past_due", { previous }), {
    status: "past_due",
    paidThrough: PAID_THROUGH,
    commercialGrant: { status: "active", validUntil: PAID_THROUGH },
    recovery: {
      action: "open",
      cyclePaidThrough: PAID_THROUGH,
      failureAt: "2026-08-02T12:05:00.000Z",
    },
  });
});

Deno.test("subscription lifecycle: retries cannot reset one recovery cycle", () => {
  const first = mergeRecoveryCycle(null, {
    cyclePaidThrough: PAID_THROUGH,
    failureAt: "2026-08-02T12:05:00.000Z",
  });
  const retry = mergeRecoveryCycle(first, {
    cyclePaidThrough: PAID_THROUGH,
    failureAt: "2026-08-02T12:45:00.000Z",
  });
  assertEquals(retry, first);
  assertEquals(retry, {
    cyclePaidThrough: PAID_THROUGH,
    firstFailureAt: "2026-08-02T12:05:00.000Z",
    recoveryUntil: "2026-08-05T12:05:00.000Z",
  });
});

Deno.test("subscription lifecycle: late older evidence shortens but never extends recovery", () => {
  const current = mergeRecoveryCycle(null, {
    cyclePaidThrough: PAID_THROUGH,
    failureAt: "2026-08-02T12:45:00.000Z",
  });
  const corrected = mergeRecoveryCycle(current, {
    cyclePaidThrough: PAID_THROUGH,
    failureAt: "2026-08-02T12:05:00.000Z",
  });
  assertEquals(corrected.firstFailureAt, "2026-08-02T12:05:00.000Z");
  assertEquals(corrected.recoveryUntil, "2026-08-05T12:05:00.000Z");
});

Deno.test("subscription lifecycle: recovered renewal closes a cycle and next paidThrough opens another", () => {
  const recovered = transition("active", {
    currentPeriodEnd: "2026-09-02T13:00:00.000Z",
    previous: { status: "past_due", paidThrough: PAID_THROUGH },
  });
  assertEquals(recovered.recovery, { action: "close" });
  const nextFailure = transition("past_due", {
    remoteModifiedAt: "2026-09-02T13:01:00.000Z",
    previous: {
      status: "active",
      paidThrough: "2026-09-02T13:00:00.000Z",
    },
  });
  assertEquals(nextFailure.recovery, {
    action: "open",
    cyclePaidThrough: "2026-09-02T13:00:00.000Z",
    failureAt: "2026-09-02T13:01:00.000Z",
  });
});

Deno.test("subscription lifecycle: unpaid and revoked close only this subscription", () => {
  for (const status of ["unpaid", "revoked"]) {
    const result = transition(status, {
      previous: { status: "past_due", paidThrough: PAID_THROUGH },
    });
    assertEquals(result.commercialGrant.status, "revoked");
    assertEquals(result.recovery, { action: "close" });
  }
});

Deno.test("subscription lifecycle: exact recovery boundary is already downgraded", () => {
  const until = "2026-08-05T12:05:00.000Z";
  assertEquals(
    isGrantActiveAt(until, new Date("2026-08-05T12:04:59.999Z")),
    true,
  );
  assertEquals(isGrantActiveAt(until, new Date(until)), false);
});

Deno.test("subscription lifecycle: trialing is bounded by its demonstrated trial end", () => {
  const transition = deriveSubscriptionTransition({
    status: "trialing",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-08-09T12:00:00.000Z",
    remoteModifiedAt: "2026-08-02T12:00:00.000Z",
    previous: null,
    now: NOW,
  });
  assertEquals(transition.commercialGrant, {
    status: "active",
    validUntil: "2026-08-09T12:00:00.000Z",
  });
  assertEquals(transition.recovery, { action: "close" });
});

Deno.test("subscription lifecycle: trial extension replaces the proven bound without recovery", () => {
  const transition = deriveSubscriptionTransition({
    status: "trialing",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-08-12T12:00:00.000Z",
    remoteModifiedAt: "2026-08-03T12:00:00.000Z",
    previous: {
      status: "trialing",
      paidThrough: "2026-08-09T12:00:00.000Z",
    },
    now: NOW,
  });
  assertEquals(transition.paidThrough, "2026-08-12T12:00:00.000Z");
  assertEquals(transition.recovery, { action: "close" });
});

Deno.test("subscription lifecycle: trial expires at the exact boundary", () => {
  const transition = deriveSubscriptionTransition({
    status: "trialing",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-08-02T12:00:00.000Z",
    remoteModifiedAt: "2026-08-02T11:00:00.000Z",
    previous: null,
    now: NOW,
  });
  assertEquals(transition.commercialGrant.status, "revoked");
});

Deno.test("subscription lifecycle: incomplete_expired is revoked and closes recovery", () => {
  const transition = deriveSubscriptionTransition({
    status: "incomplete_expired",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-08-09T12:00:00.000Z",
    remoteModifiedAt: "2026-08-02T12:00:00.000Z",
    previous: null,
    now: NOW,
  });
  assertEquals(transition.commercialGrant, {
    status: "revoked",
    validUntil: null,
  });
  assertEquals(transition.recovery, { action: "close" });
});
