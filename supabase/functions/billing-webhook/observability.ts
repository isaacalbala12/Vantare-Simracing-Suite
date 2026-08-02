export type BillingSignalCode =
  | "endpoint_disabled"
  | "signature_invalid"
  | "mapping_invalid"
  | "webhook_duplicate"
  | "webhook_retry_scheduled"
  | "webhook_processing_busy"
  | "webhook_quarantined"
  | "webhook_processing_failed";

export type BillingSeverity = "info" | "warning" | "critical";

export type BillingSignal = {
  schemaVersion: 1;
  code: BillingSignalCode;
  severity: BillingSeverity;
  environment: "sandbox" | "production" | "unknown";
  observedAt: string;
  correlationId: string | null;
  eventType: string | null;
  reasonCode: string | null;
};

export interface BillingSignalSink {
  emit(signal: BillingSignal): void | Promise<void>;
}

export const consoleBillingSignalSink: BillingSignalSink = {
  emit(signal) {
    const log = signal.severity === "critical"
      ? console.error
      : signal.severity === "warning"
      ? console.warn
      : console.info;
    log("billing-operational-signal", signal);
  },
};

export async function emitBillingSignal(
  sink: BillingSignalSink,
  input: {
    code: BillingSignalCode;
    severity: BillingSeverity;
    environment?: string | null;
    observedAt?: Date;
    providerEventId?: string | null;
    eventType?: string | null;
    reasonCode?: string | null;
  },
): Promise<BillingSignal> {
  const signal: BillingSignal = {
    schemaVersion: 1,
    code: input.code,
    severity: input.severity,
    environment: environment(input.environment),
    observedAt: (input.observedAt ?? new Date()).toISOString(),
    correlationId: await correlationId(input.providerEventId),
    eventType: safeCode(input.eventType, 96),
    reasonCode: safeCode(input.reasonCode, 96),
  };
  try {
    await sink.emit(signal);
  } catch {
    // Observability must never change webhook delivery or commercial state.
  }
  return signal;
}

export type BillingMetricsSnapshot = {
  schemaVersion: 1;
  environment: "sandbox" | "production";
  observedAt: string;
  inbox: {
    received: number;
    processing: number;
    failed: number;
    quarantined: number;
    retryDue: number;
    orphaned: number;
    duplicateDeliveries: number;
    oldestPendingSeconds: number;
    unclassified: number;
    replays24h: number;
  };
  reconciliation: {
    runs24h: number;
    quarantined24h: number;
    changed24h: number;
    lastSuccessfulAgeSeconds: number;
  };
  projection: {
    resourcesWithConflicts: number;
    staleEvents24h: number;
    incoherentActiveGrants: number;
  };
};

export type BillingAlert = {
  key: string;
  severity: Exclude<BillingSeverity, "info">;
  value: number;
  threshold: number;
  runbook: string;
};

export function evaluateBillingAlerts(
  snapshot: BillingMetricsSnapshot,
): BillingAlert[] {
  const candidates: BillingAlert[] = [
    alert(
      "inbox_unclassified",
      "critical",
      snapshot.inbox.unclassified,
      0,
      "BIL10-INBOX-UNCLASSIFIED",
    ),
    alert(
      "inbox_orphaned",
      "critical",
      snapshot.inbox.orphaned,
      0,
      "BIL10-WEBHOOK-ORPHAN",
    ),
    alert(
      "inbox_quarantined",
      "critical",
      snapshot.inbox.quarantined,
      0,
      "BIL10-QUARANTINE",
    ),
    alert(
      "inbox_retry_due",
      "warning",
      snapshot.inbox.retryDue,
      10,
      "BIL10-RETRY",
    ),
    alert(
      "inbox_lag_seconds",
      "critical",
      snapshot.inbox.oldestPendingSeconds,
      300,
      "BIL10-WEBHOOK-LAG",
    ),
    alert(
      "reconciliation_quarantined",
      "critical",
      snapshot.reconciliation.quarantined24h,
      0,
      "BIL10-RECONCILIATION",
    ),
    alert(
      "projection_conflict",
      "critical",
      snapshot.projection.resourcesWithConflicts,
      0,
      "BIL10-PROJECTION-DRIFT",
    ),
    alert(
      "active_grant_incoherent",
      "critical",
      snapshot.projection.incoherentActiveGrants,
      0,
      "BIL10-GRANT-INCOHERENT",
    ),
  ];
  return candidates.filter((candidate) =>
    candidate.value > candidate.threshold
  );
}

export type BillingAlertState = Record<
  string,
  { lastEmittedAt: string; severity: BillingAlert["severity"] }
>;

export function deduplicateBillingAlerts(args: {
  alerts: BillingAlert[];
  previous?: BillingAlertState;
  now: Date;
  cooldownMs?: number;
}): { emitted: BillingAlert[]; state: BillingAlertState } {
  const previous = args.previous ?? {};
  const state: BillingAlertState = { ...previous };
  const emitted: BillingAlert[] = [];
  const cooldownMs = args.cooldownMs ?? 15 * 60 * 1000;
  for (const alert of args.alerts) {
    const last = previous[alert.key];
    const lastAt = last ? Date.parse(last.lastEmittedAt) : Number.NaN;
    const escalated = last?.severity === "warning" &&
      alert.severity === "critical";
    if (
      !last || escalated || !Number.isFinite(lastAt) ||
      args.now.getTime() - lastAt >= cooldownMs
    ) {
      emitted.push(alert);
      state[alert.key] = {
        lastEmittedAt: args.now.toISOString(),
        severity: alert.severity,
      };
    }
  }
  return { emitted, state };
}

function alert(
  key: string,
  severity: BillingAlert["severity"],
  value: number,
  threshold: number,
  runbook: string,
): BillingAlert {
  return { key, severity, value, threshold, runbook };
}

function environment(
  value: string | null | undefined,
): BillingSignal["environment"] {
  return value === "sandbox" || value === "production" ? value : "unknown";
}

function safeCode(
  value: string | null | undefined,
  max: number,
): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length <= max && /^[a-z0-9_.:-]+$/.test(normalized)
    ? normalized
    : "redacted";
}

async function correlationId(
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(digest).slice(0, 12),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
