export const SUBSCRIPTION_RECOVERY_HOURS = 72;

export type SubscriptionLifecycleState = {
  status: string;
  paidThrough: string | null;
};

export type RecoveryCandidate = {
  cyclePaidThrough: string;
  failureAt: string;
};

export type RecoveryCycle = {
  cyclePaidThrough: string;
  firstFailureAt: string;
  recoveryUntil: string;
};

export type SubscriptionTransition = {
  status: string;
  paidThrough: string | null;
  commercialGrant: {
    status: "active" | "revoked";
    validUntil: string | null;
  };
  recovery:
    | { action: "open"; cyclePaidThrough: string; failureAt: string }
    | { action: "close" }
    | { action: "none"; reason: "paid_through_unproven" };
};

export function deriveSubscriptionTransition(args: {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  remoteModifiedAt: string;
  previous: SubscriptionLifecycleState | null;
  now: Date;
}): SubscriptionTransition {
  const status = args.status.trim().toLowerCase();
  const periodEnd = canonicalTimestamp(args.currentPeriodEnd);

  if (
    status === "incomplete" || status === "incomplete_expired"
  ) {
    return revoked(status, null, { action: "close" });
  }

  if (status === "active" || status === "uncanceled" || status === "trialing") {
    return {
      status,
      paidThrough: periodEnd,
      commercialGrant: grantUntil(periodEnd, args.now),
      recovery: { action: "close" },
    };
  }

  if (status === "canceled" || status === "cancelled") {
    return {
      status: "canceled",
      paidThrough: periodEnd,
      commercialGrant: args.cancelAtPeriodEnd
        ? grantUntil(periodEnd, args.now)
        : { status: "revoked", validUntil: periodEnd },
      recovery: { action: "close" },
    };
  }

  if (status === "past_due") {
    const paidThrough = canonicalTimestamp(args.previous?.paidThrough ?? null);
    const failureAt = canonicalTimestamp(args.remoteModifiedAt);
    if (!paidThrough || !failureAt) {
      return {
        status,
        paidThrough: null,
        commercialGrant: { status: "revoked", validUntil: null },
        recovery: { action: "none", reason: "paid_through_unproven" },
      };
    }
    return {
      status,
      paidThrough,
      commercialGrant: grantUntil(paidThrough, args.now),
      recovery: {
        action: "open",
        cyclePaidThrough: paidThrough,
        failureAt,
      },
    };
  }

  if (status === "unpaid" || status === "revoked") {
    return revoked(
      status,
      canonicalTimestamp(args.previous?.paidThrough ?? periodEnd),
      { action: "close" },
    );
  }

  return revoked(status || "unknown", null, { action: "close" });
}

export function mergeRecoveryCycle(
  current: RecoveryCycle | null,
  candidate: RecoveryCandidate,
): RecoveryCycle {
  const cyclePaidThrough = requireTimestamp(candidate.cyclePaidThrough);
  const candidateFailureAt = requireTimestamp(candidate.failureAt);
  const currentFailureAt = current?.cyclePaidThrough === cyclePaidThrough
    ? requireTimestamp(current.firstFailureAt)
    : null;
  const firstFailureAt =
    currentFailureAt && currentFailureAt < candidateFailureAt
      ? currentFailureAt
      : candidateFailureAt;
  return {
    cyclePaidThrough,
    firstFailureAt,
    recoveryUntil: new Date(
      Date.parse(firstFailureAt) + SUBSCRIPTION_RECOVERY_HOURS * 60 * 60 * 1000,
    ).toISOString(),
  };
}

export function isGrantActiveAt(
  validUntil: string | null,
  now: Date,
): boolean {
  if (!validUntil) return false;
  const timestamp = Date.parse(validUntil);
  return Number.isFinite(timestamp) && now.getTime() < timestamp;
}

function grantUntil(
  validUntil: string | null,
  now: Date,
): { status: "active" | "revoked"; validUntil: string | null } {
  return {
    status: isGrantActiveAt(validUntil, now) ? "active" : "revoked",
    validUntil,
  };
}

function revoked(
  status: string,
  paidThrough: string | null,
  recovery: { action: "close" },
): SubscriptionTransition {
  return {
    status,
    paidThrough,
    commercialGrant: { status: "revoked", validUntil: paidThrough },
    recovery,
  };
}

function canonicalTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function requireTimestamp(value: string): string {
  const canonical = canonicalTimestamp(value);
  if (!canonical) throw new Error("invalid_subscription_lifecycle_timestamp");
  return canonical;
}
