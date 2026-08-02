import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { BillingEnvironment } from "../_shared/mapping.ts";

export type ResourceVersion = {
  modifiedAt: string;
  snapshotHash: string;
};

export type ResourceVersionDecision =
  | "apply"
  | "duplicate"
  | "stale_noop"
  | "version_conflict";

export type CommercialGrant = {
  capability: string;
  status: "active" | "revoked";
  validUntil: string | null;
};

export type CommercialResourceSnapshot = ResourceVersion & {
  provider: "polar";
  environment: BillingEnvironment;
  resourceType: "order" | "subscription" | "benefit_grant";
  resourceId: string;
  userId: string;
  state: string;
  grants: CommercialGrant[];
};

export type ProjectionApplyResult = {
  outcome: ResourceVersionDecision;
  grantsChanged: number;
};

export interface CommercialProjection {
  apply(snapshot: CommercialResourceSnapshot): Promise<ProjectionApplyResult>;
}

export async function hashCommercialSnapshot(
  snapshot: Omit<CommercialResourceSnapshot, "snapshotHash">,
): Promise<string> {
  const canonical = JSON.stringify({
    ...snapshot,
    grants: [...snapshot.grants].sort((left, right) =>
      left.capability.localeCompare(right.capability)
    ),
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("invalid_resource_version");
  return parsed;
}

export function compareResourceVersion(
  current: ResourceVersion | null,
  incoming: ResourceVersion,
): ResourceVersionDecision {
  if (!current) return "apply";
  const currentTime = timestamp(current.modifiedAt);
  const incomingTime = timestamp(incoming.modifiedAt);
  if (incomingTime < currentTime) return "stale_noop";
  if (incomingTime > currentTime) return "apply";
  return incoming.snapshotHash === current.snapshotHash
    ? "duplicate"
    : "version_conflict";
}

export class SupabaseCommercialProjection implements CommercialProjection {
  constructor(private readonly supabase: SupabaseClient) {}

  async apply(
    snapshot: CommercialResourceSnapshot,
  ): Promise<ProjectionApplyResult> {
    const { data, error } = await this.supabase.rpc(
      "billing_apply_resource_snapshot",
      {
        p_provider: snapshot.provider,
        p_environment: snapshot.environment,
        p_resource_type: snapshot.resourceType,
        p_resource_id: snapshot.resourceId,
        p_user_id: snapshot.userId,
        p_modified_at: snapshot.modifiedAt,
        p_snapshot_hash: snapshot.snapshotHash,
        p_state: snapshot.state,
        p_grants: snapshot.grants,
      },
    );
    if (error) {
      throw Object.assign(new Error("commercial projection failed"), {
        code: typeof error.code === "string" ? error.code : "projection_failed",
      });
    }
    const row = Array.isArray(data) ? data[0] : data;
    const outcome = row?.outcome;
    if (
      outcome !== "apply" && outcome !== "duplicate" &&
      outcome !== "stale_noop" && outcome !== "version_conflict"
    ) throw new Error("invalid_projection_result");
    return {
      outcome,
      grantsChanged: typeof row?.grants_changed === "number"
        ? row.grants_changed
        : 0,
    };
  }
}

export class MemoryCommercialProjection implements CommercialProjection {
  readonly resources = new Map<string, CommercialResourceSnapshot>();
  readonly grants = new Map<string, CommercialGrant>();

  async apply(
    snapshot: CommercialResourceSnapshot,
  ): Promise<ProjectionApplyResult> {
    const resourceKey = this.#resourceKey(snapshot);
    const current = this.resources.get(resourceKey) ?? null;
    const outcome = compareResourceVersion(current, snapshot);
    if (outcome !== "apply") return { outcome, grantsChanged: 0 };

    this.resources.set(resourceKey, structuredClone(snapshot));
    let grantsChanged = 0;
    const incoming = new Set(snapshot.grants.map((grant) => grant.capability));
    for (const [key, grant] of this.grants) {
      if (
        key.startsWith(`${resourceKey}:`) && !incoming.has(grant.capability)
      ) {
        this.grants.set(key, { ...grant, status: "revoked" });
        grantsChanged++;
      }
    }
    for (const grant of snapshot.grants) {
      const key = `${resourceKey}:${grant.capability}`;
      const previous = this.grants.get(key);
      if (JSON.stringify(previous) !== JSON.stringify(grant)) grantsChanged++;
      this.grants.set(key, structuredClone(grant));
    }
    return { outcome, grantsChanged };
  }

  #resourceKey(snapshot: CommercialResourceSnapshot): string {
    return [
      snapshot.provider,
      snapshot.environment,
      snapshot.resourceType,
      snapshot.resourceId,
    ].join(":");
  }
}
