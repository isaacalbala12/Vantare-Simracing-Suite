import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { BillingEnvironment } from "../_shared/mapping.ts";
import {
  isGrantActiveAt,
  mergeRecoveryCycle,
  type RecoveryCycle,
  type SubscriptionLifecycleState,
  type SubscriptionTransition,
} from "./subscription-lifecycle.ts";

export type SubscriptionLifecycleApply = {
  userId: string;
  environment: BillingEnvironment;
  subscriptionId: string;
  productId: string;
  capabilities: string[];
  periodStart: string | null;
  remotePeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  modifiedAt: string;
  snapshotHash: string;
  transition: SubscriptionTransition;
  evaluatedAt: string;
};

export interface SubscriptionLifecycleStore {
  read(args: {
    environment: BillingEnvironment;
    subscriptionId: string;
  }): Promise<SubscriptionLifecycleState | null>;
  apply(value: SubscriptionLifecycleApply): Promise<void>;
}

type StoredLifecycle = SubscriptionLifecycleState & {
  modifiedAt: string;
  snapshotHash: string;
};

type MemoryRecoveryGrant = {
  subscriptionId: string;
  cyclePaidThrough: string;
  capability: string;
  status: "active" | "revoked";
  validUntil: string;
};

export class MemorySubscriptionLifecycleStore
  implements SubscriptionLifecycleStore {
  readonly subscriptions = new Map<string, StoredLifecycle>();
  readonly cycles = new Map<
    string,
    RecoveryCycle & { closedAt: string | null }
  >();
  readonly recoveryGrants = new Map<string, MemoryRecoveryGrant>();
  private pendingFailures = 0;

  read(args: {
    environment: BillingEnvironment;
    subscriptionId: string;
  }): Promise<SubscriptionLifecycleState | null> {
    const current = this.subscriptions.get(this.key(
      args.environment,
      args.subscriptionId,
    ));
    return Promise.resolve(
      current
        ? { status: current.status, paidThrough: current.paidThrough }
        : null,
    );
  }

  apply(value: SubscriptionLifecycleApply): Promise<void> {
    const key = this.key(value.environment, value.subscriptionId);
    const current = this.subscriptions.get(key);
    if (this.pendingFailures > 0) {
      this.pendingFailures--;
      return Promise.reject(Object.assign(new Error("test lifecycle failure"), {
        code: "test_lifecycle_failure",
      }));
    }
    let lateRecoveryCorrection = false;
    if (current) {
      const incomingTime = Date.parse(value.modifiedAt);
      const currentTime = Date.parse(current.modifiedAt);
      if (incomingTime < currentTime) {
        const recovery = value.transition.recovery;
        const cycleKey = recovery.action === "open"
          ? this.cycleKey(
            value.environment,
            value.subscriptionId,
            recovery.cyclePaidThrough,
          )
          : null;
        lateRecoveryCorrection = current.status === "past_due" &&
          recovery.action === "open" &&
          value.remotePeriodEnd === current.paidThrough &&
          recovery.cyclePaidThrough === current.paidThrough &&
          cycleKey !== null && this.cycles.has(cycleKey);
        if (!lateRecoveryCorrection) return Promise.resolve();
      }
      if (
        incomingTime === currentTime &&
        value.snapshotHash !== current.snapshotHash
      ) {
        return Promise.resolve();
      }
    }
    if (
      !lateRecoveryCorrection &&
      (!current ||
        Date.parse(value.modifiedAt) >= Date.parse(current.modifiedAt))
    ) {
      this.subscriptions.set(key, {
        status: value.transition.status,
        paidThrough: value.transition.paidThrough,
        modifiedAt: value.modifiedAt,
        snapshotHash: value.snapshotHash,
      });
    }

    if (value.transition.recovery.action === "open") {
      const cycleKey = this.cycleKey(
        value.environment,
        value.subscriptionId,
        value.transition.recovery.cyclePaidThrough,
      );
      const existing = this.cycles.get(cycleKey) ?? null;
      const cycle = mergeRecoveryCycle(existing, {
        cyclePaidThrough: value.transition.recovery.cyclePaidThrough,
        failureAt: value.transition.recovery.failureAt,
      });
      this.cycles.set(cycleKey, { ...cycle, closedAt: null });
      const capabilities = [...new Set(value.capabilities)].sort();
      const allowedCapabilities = new Set(capabilities);
      for (const [grantKey, grant] of this.recoveryGrants) {
        if (!grantKey.startsWith(`${cycleKey}:`)) continue;
        if (!allowedCapabilities.has(grant.capability)) {
          this.recoveryGrants.set(grantKey, { ...grant, status: "revoked" });
        }
      }
      for (const capability of capabilities) {
        this.recoveryGrants.set(`${cycleKey}:${capability}`, {
          subscriptionId: value.subscriptionId,
          cyclePaidThrough: cycle.cyclePaidThrough,
          capability,
          status:
            isGrantActiveAt(cycle.recoveryUntil, new Date(value.evaluatedAt))
              ? "active"
              : "revoked",
          validUntil: cycle.recoveryUntil,
        });
      }
      return Promise.resolve();
    }

    if (value.transition.recovery.action === "close") {
      for (const [cycleKey, cycle] of this.cycles) {
        if (!cycleKey.startsWith(`${key}:`)) continue;
        this.cycles.set(cycleKey, {
          ...cycle,
          closedAt: cycle.closedAt ?? value.modifiedAt,
        });
        for (const [grantKey, grant] of this.recoveryGrants) {
          if (!grantKey.startsWith(`${cycleKey}:`)) continue;
          this.recoveryGrants.set(grantKey, { ...grant, status: "revoked" });
        }
      }
    }
    return Promise.resolve();
  }

  failNextApply(count = 1): void {
    this.pendingFailures = Math.max(0, count);
  }

  private key(environment: BillingEnvironment, subscriptionId: string): string {
    return `${environment}:${subscriptionId}`;
  }

  private cycleKey(
    environment: BillingEnvironment,
    subscriptionId: string,
    cyclePaidThrough: string,
  ): string {
    return `${this.key(environment, subscriptionId)}:${cyclePaidThrough}`;
  }
}

export class SupabaseSubscriptionLifecycleStore
  implements SubscriptionLifecycleStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async read(args: {
    environment: BillingEnvironment;
    subscriptionId: string;
  }): Promise<SubscriptionLifecycleState | null> {
    const { data, error } = await this.supabase.from("billing_subscriptions")
      .select("status,paid_through")
      .eq("provider", "polar")
      .eq("environment", args.environment)
      .eq("provider_subscription_id", args.subscriptionId)
      .maybeSingle();
    if (error) throw lifecycleError(error);
    if (!data) return null;
    return {
      status: typeof data.status === "string" ? data.status : "unknown",
      paidThrough: typeof data.paid_through === "string"
        ? data.paid_through
        : null,
    };
  }

  async apply(value: SubscriptionLifecycleApply): Promise<void> {
    const recovery = value.transition.recovery;
    const { error } = await this.supabase.rpc(
      "billing_apply_subscription_lifecycle",
      {
        p_user_id: value.userId,
        p_environment: value.environment,
        p_subscription_id: value.subscriptionId,
        p_product_id: value.productId,
        p_status: value.transition.status,
        p_period_start: value.periodStart,
        p_remote_period_end: value.remotePeriodEnd,
        p_paid_through: value.transition.paidThrough,
        p_cancel_at_period_end: value.cancelAtPeriodEnd,
        p_modified_at: value.modifiedAt,
        p_snapshot_hash: value.snapshotHash,
        p_recovery_action: recovery.action,
        p_failure_at: recovery.action === "open" ? recovery.failureAt : null,
        p_cycle_paid_through: recovery.action === "open"
          ? recovery.cyclePaidThrough
          : null,
        p_evaluated_at: value.evaluatedAt,
        p_capabilities: value.capabilities,
      },
    );
    if (error) throw lifecycleError(error);
  }
}

function lifecycleError(error: unknown): Error {
  const code = typeof error === "object" && error !== null &&
      "code" in error && typeof error.code === "string"
    ? error.code
    : "subscription_lifecycle_failed";
  return Object.assign(new Error("subscription lifecycle projection failed"), {
    code,
  });
}
