import type { PolarProductMap } from "../_shared/mapping.ts";
import { resolveCheckoutKeyByProductId } from "../_shared/mapping.ts";
import type { PolarCustomerState } from "../_shared/polar.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type CommercialGrant,
  type CommercialResourceSnapshot,
  hashCommercialSnapshot,
} from "./commercial-projection.ts";

export type LocalCommercialResource = {
  resourceType: "order" | "subscription" | "benefit_grant" | "legacy";
  resourceId: string;
  productId: string | null;
  capabilities: string[];
  modifiedAt: string;
  status: "active" | "revoked";
};

export type ReconciliationIssue = {
  code: "unknown_product" | "unknown_benefit" | "invalid_local_resource";
  resourceId: string;
};

export type ReconciliationPlan = {
  userId: string;
  environment: "sandbox" | "production";
  observedAt: string;
  snapshotHash: string;
  planHash: string;
  operations: CommercialResourceSnapshot[];
  preservedResourceIds: string[];
  issues: ReconciliationIssue[];
  safeToApply: boolean;
};

export interface ReconciliationStore {
  apply(
    plan: ReconciliationPlan,
    trigger: "manual" | "scheduled",
  ): Promise<{
    status: "applied" | "unchanged" | "quarantined";
    changed: number;
  }>;
}

export async function buildReconciliationPlan(args: {
  userId: string;
  customerState: PolarCustomerState;
  localResources: LocalCommercialResource[];
  productMap: PolarProductMap;
  benefitCapabilities?: Record<string, string[]>;
}): Promise<ReconciliationPlan> {
  const operations: CommercialResourceSnapshot[] = [];
  const issues: ReconciliationIssue[] = [];
  const preservedResourceIds: string[] = [];
  const remoteSubscriptions = new Set<string>();
  const remoteBenefits = new Set<string>();

  for (const subscription of args.customerState.activeSubscriptions) {
    remoteSubscriptions.add(subscription.id);
    const resolved = resolveCheckoutKeyByProductId(
      args.productMap,
      subscription.productId,
    );
    if (!resolved.ok) {
      issues.push({ code: "unknown_product", resourceId: subscription.id });
      continue;
    }
    operations.push(
      await snapshot({
        userId: args.userId,
        environment: args.productMap.environment,
        resourceType: "subscription",
        resourceId: subscription.id,
        modifiedAt: subscription.modifiedAt,
        state: subscription.status,
        grants: grants(
          resolved.config.capabilities,
          "active",
          subscription.currentPeriodEnd,
        ),
      }),
    );
  }

  for (const benefit of args.customerState.grantedBenefits) {
    remoteBenefits.add(benefit.id);
    const capabilities = args.benefitCapabilities?.[benefit.benefitId];
    if (!capabilities?.length) {
      issues.push({ code: "unknown_benefit", resourceId: benefit.id });
      continue;
    }
    operations.push(
      await snapshot({
        userId: args.userId,
        environment: args.productMap.environment,
        resourceType: "benefit_grant",
        resourceId: benefit.id,
        modifiedAt: benefit.modifiedAt,
        state: "granted",
        grants: grants(capabilities, "active", null),
      }),
    );
  }

  for (const local of args.localResources) {
    if (local.resourceType === "order" || local.resourceType === "legacy") {
      preservedResourceIds.push(local.resourceId);
      continue;
    }
    if (local.status !== "active") continue;
    const remotelyPresent = local.resourceType === "subscription"
      ? remoteSubscriptions.has(local.resourceId)
      : remoteBenefits.has(local.resourceId);
    if (remotelyPresent) continue;
    if (local.resourceType === "benefit_grant") {
      if (!local.capabilities.length) {
        issues.push({
          code: "invalid_local_resource",
          resourceId: local.resourceId,
        });
        continue;
      }
      operations.push(
        await snapshot({
          userId: args.userId,
          environment: args.productMap.environment,
          resourceType: "benefit_grant",
          resourceId: local.resourceId,
          modifiedAt: args.customerState.observedAt,
          state: "absent_from_customer_state",
          grants: grants(
            local.capabilities,
            "revoked",
            args.customerState.observedAt,
          ),
        }),
      );
      continue;
    }
    if (!local.productId) {
      issues.push({
        code: "invalid_local_resource",
        resourceId: local.resourceId,
      });
      continue;
    }
    const resolved = resolveCheckoutKeyByProductId(
      args.productMap,
      local.productId,
    );
    if (!resolved.ok) {
      issues.push({ code: "unknown_product", resourceId: local.resourceId });
      continue;
    }
    operations.push(
      await snapshot({
        userId: args.userId,
        environment: args.productMap.environment,
        resourceType: local.resourceType,
        resourceId: local.resourceId,
        modifiedAt: args.customerState.observedAt,
        state: "absent_from_customer_state",
        grants: grants(
          resolved.config.capabilities,
          "revoked",
          args.customerState.observedAt,
        ),
      }),
    );
  }

  operations.sort((left, right) =>
    `${left.resourceType}:${left.resourceId}`.localeCompare(
      `${right.resourceType}:${right.resourceId}`,
    )
  );
  preservedResourceIds.sort();
  issues.sort((left, right) => left.resourceId.localeCompare(right.resourceId));
  const snapshotHash = await hashValue(
    normalizeCustomerState(args.customerState),
  );
  const planHash = await hashValue({
    operations,
    preservedResourceIds,
    issues,
  });
  return {
    userId: args.userId,
    environment: args.productMap.environment,
    observedAt: args.customerState.observedAt,
    snapshotHash,
    planHash,
    operations,
    preservedResourceIds,
    issues,
    safeToApply: issues.length === 0,
  };
}

export async function executeReconciliation(args: {
  plan: ReconciliationPlan;
  dryRun: boolean;
  trigger: "manual" | "scheduled";
  store: ReconciliationStore;
}): Promise<{
  status: "dry_run" | "applied" | "unchanged" | "quarantined";
  changed: number;
}> {
  if (!args.plan.safeToApply) return { status: "quarantined", changed: 0 };
  if (args.dryRun) return { status: "dry_run", changed: 0 };
  return await args.store.apply(args.plan, args.trigger);
}

export class MemoryReconciliationStore implements ReconciliationStore {
  readonly appliedPlanHashes = new Set<string>();
  calls = 0;

  apply(plan: ReconciliationPlan): Promise<{
    status: "applied" | "unchanged";
    changed: number;
  }> {
    this.calls++;
    if (this.appliedPlanHashes.has(plan.planHash)) {
      return Promise.resolve({ status: "unchanged", changed: 0 });
    }
    this.appliedPlanHashes.add(plan.planHash);
    return Promise.resolve({
      status: plan.operations.length ? "applied" : "unchanged",
      changed: plan.operations.length,
    });
  }
}

export class SupabaseReconciliationStore implements ReconciliationStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async apply(
    plan: ReconciliationPlan,
    trigger: "manual" | "scheduled",
  ): Promise<{
    status: "applied" | "unchanged" | "quarantined";
    changed: number;
  }> {
    const { data, error } = await this.supabase.rpc(
      "billing_apply_reconciliation_plan",
      {
        p_user_id: plan.userId,
        p_environment: plan.environment,
        p_trigger_kind: trigger,
        p_snapshot_hash: plan.snapshotHash,
        p_plan_hash: plan.planHash,
        p_observed_at: plan.observedAt,
        p_operations: plan.operations,
      },
    );
    if (error) {
      throw Object.assign(new Error("billing reconciliation failed"), {
        code: typeof error.code === "string"
          ? error.code
          : "reconciliation_failed",
      });
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (
      row?.status !== "applied" && row?.status !== "unchanged" &&
      row?.status !== "quarantined"
    ) {
      throw new Error("invalid_reconciliation_result");
    }
    return {
      status: row.status,
      changed: typeof row.changed === "number" ? row.changed : 0,
    };
  }
}

export type ReconciliationTarget = { userId: string; externalId: string };
export interface ReconciliationTargetSource {
  listPage(args: {
    cursor: string | null;
    limit: number;
    signal: AbortSignal;
  }): Promise<{ targets: ReconciliationTarget[]; nextCursor: string | null }>;
}

export async function runReconciliationBatch(args: {
  source: ReconciliationTargetSource;
  signal: AbortSignal;
  pageSize?: number;
  reconcile: (target: ReconciliationTarget) => Promise<void>;
}): Promise<number> {
  const pageSize = Math.max(1, Math.min(args.pageSize ?? 50, 100));
  let cursor: string | null = null;
  let processed = 0;
  const seenCursors = new Set<string>();
  for (;;) {
    if (args.signal.aborted) throw new DOMException("aborted", "AbortError");
    const page = await args.source.listPage({
      cursor,
      limit: pageSize,
      signal: args.signal,
    });
    for (const target of page.targets) {
      if (args.signal.aborted) throw new DOMException("aborted", "AbortError");
      await args.reconcile(target);
      processed++;
    }
    if (!page.nextCursor) return processed;
    if (seenCursors.has(page.nextCursor)) throw new Error("repeated_cursor");
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

function grants(
  capabilities: string[],
  status: "active" | "revoked",
  validUntil: string | null,
): CommercialGrant[] {
  return [...capabilities].sort().map((capability) => ({
    capability,
    status,
    validUntil,
  }));
}

async function snapshot(
  value: Omit<CommercialResourceSnapshot, "provider" | "snapshotHash">,
): Promise<CommercialResourceSnapshot> {
  const withoutHash = { ...value, provider: "polar" as const };
  return {
    ...withoutHash,
    snapshotHash: await hashCommercialSnapshot(withoutHash),
  };
}

async function hashValue(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function normalizeCustomerState(state: PolarCustomerState): PolarCustomerState {
  return {
    ...state,
    activeSubscriptions: [...state.activeSubscriptions].sort((left, right) =>
      left.id.localeCompare(right.id)
    ),
    grantedBenefits: [...state.grantedBenefits].sort((left, right) =>
      left.id.localeCompare(right.id)
    ),
  };
}
