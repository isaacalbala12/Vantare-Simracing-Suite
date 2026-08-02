import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type BillingMetricsSnapshot,
  type BillingSignal,
  deduplicateBillingAlerts,
  emitBillingSignal,
  evaluateBillingAlerts,
} from "./observability.ts";

function snapshot(): BillingMetricsSnapshot {
  return {
    schemaVersion: 1,
    environment: "sandbox",
    observedAt: "2026-08-02T12:00:00.000Z",
    inbox: {
      received: 1,
      processing: 1,
      failed: 11,
      quarantined: 1,
      retryDue: 11,
      orphaned: 1,
      duplicateDeliveries: 3,
      oldestPendingSeconds: 301,
      unclassified: 1,
      replays24h: 0,
    },
    reconciliation: {
      runs24h: 1,
      quarantined24h: 1,
      changed24h: 0,
      lastSuccessfulAgeSeconds: 60,
    },
    projection: {
      resourcesWithConflicts: 1,
      staleEvents24h: 2,
      incoherentActiveGrants: 1,
    },
  };
}

Deno.test("billing observability emits only sanitized structured signals", async () => {
  const signals: BillingSignal[] = [];
  const signal = await emitBillingSignal(
    {
      emit(value) {
        signals.push(value);
      },
    },
    {
      code: "webhook_processing_failed",
      severity: "critical",
      environment: "sandbox",
      observedAt: new Date("2026-08-02T12:00:00.000Z"),
      providerEventId: "provider-private-event-id",
      eventType: "Order.Paid",
      reasonCode: "email=user@example.invalid",
    },
  );

  assertEquals(signals, [signal]);
  assertEquals(signal.eventType, "order.paid");
  assertEquals(signal.reasonCode, "redacted");
  assertNotEquals(signal.correlationId, "provider-private-event-id");
  assertEquals(JSON.stringify(signal).includes("user@example.invalid"), false);
});

Deno.test("billing observability failures never change the caller outcome", async () => {
  const signal = await emitBillingSignal(
    {
      emit() {
        throw new Error("network unavailable");
      },
    },
    {
      code: "endpoint_disabled",
      severity: "critical",
      environment: "production",
      observedAt: new Date("2026-08-02T12:00:00.000Z"),
    },
  );
  assertEquals(signal.code, "endpoint_disabled");
});

Deno.test("billing alert evaluation links every critical state to a runbook", () => {
  assertEquals(evaluateBillingAlerts(snapshot()), [
    {
      key: "inbox_unclassified",
      severity: "critical",
      value: 1,
      threshold: 0,
      runbook: "BIL10-INBOX-UNCLASSIFIED",
    },
    {
      key: "inbox_orphaned",
      severity: "critical",
      value: 1,
      threshold: 0,
      runbook: "BIL10-WEBHOOK-ORPHAN",
    },
    {
      key: "inbox_quarantined",
      severity: "critical",
      value: 1,
      threshold: 0,
      runbook: "BIL10-QUARANTINE",
    },
    {
      key: "inbox_retry_due",
      severity: "warning",
      value: 11,
      threshold: 10,
      runbook: "BIL10-RETRY",
    },
    {
      key: "inbox_lag_seconds",
      severity: "critical",
      value: 301,
      threshold: 300,
      runbook: "BIL10-WEBHOOK-LAG",
    },
    {
      key: "reconciliation_quarantined",
      severity: "critical",
      value: 1,
      threshold: 0,
      runbook: "BIL10-RECONCILIATION",
    },
    {
      key: "projection_conflict",
      severity: "critical",
      value: 1,
      threshold: 0,
      runbook: "BIL10-PROJECTION-DRIFT",
    },
    {
      key: "active_grant_incoherent",
      severity: "critical",
      value: 1,
      threshold: 0,
      runbook: "BIL10-GRANT-INCOHERENT",
    },
  ]);
});

Deno.test("billing alerts deduplicate during cooldown and re-emit afterwards", () => {
  const alerts = evaluateBillingAlerts(snapshot());
  const first = deduplicateBillingAlerts({
    alerts,
    now: new Date("2026-08-02T12:00:00.000Z"),
  });
  const duplicate = deduplicateBillingAlerts({
    alerts,
    previous: first.state,
    now: new Date("2026-08-02T12:05:00.000Z"),
  });
  const afterCooldown = deduplicateBillingAlerts({
    alerts,
    previous: duplicate.state,
    now: new Date("2026-08-02T12:16:00.000Z"),
  });

  assertEquals(first.emitted.length, alerts.length);
  assertEquals(duplicate.emitted, []);
  assertEquals(afterCooldown.emitted.length, alerts.length);
});
