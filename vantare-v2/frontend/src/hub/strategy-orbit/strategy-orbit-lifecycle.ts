import {
  STRATEGY_APPLICATION_PROTOCOL_V1,
  type StrategyApplicationClient,
} from "../../strategy/strategy-application-client";
import type {
  ActivePlanV1,
  PlanDraftV1,
  RevisionRefV1,
} from "../../strategy/strategy-contract-v1";

export const STRATEGY_ORBIT_REVISION_CONTRACT_V1 =
  "strategy.orbit.revision.v1" as const;

/** The immutable, user-visible slice captured by Guardar. */
export type StrategyOrbitRevisionPayloadV1 = {
  readonly contractVersion: typeof STRATEGY_ORBIT_REVISION_CONTRACT_V1;
  readonly event: object & { readonly id: string };
  readonly variant: object & { readonly id: string };
  readonly calculatedPlan: object;
};

export type OrbitLifecycleState = {
  readonly repositoryVersion: number;
  readonly savedRevision?: RevisionRefV1;
  readonly activePlan?: ActivePlanV1;
};

export type OrbitLifecycleClock = {
  id(): string;
  now(): string;
};

const defaultClock: OrbitLifecycleClock = {
  id: () => globalThis.crypto.randomUUID(),
  now: () => new Date().toISOString(),
};

export async function loadOrbitLifecycle(
  client: StrategyApplicationClient<StrategyOrbitRevisionPayloadV1>,
  visible: StrategyOrbitRevisionPayloadV1,
  commandID: string,
): Promise<OrbitLifecycleState> {
  const identity = orbitLifecycleIdentity(visible.event.id);
  const listed = await client.execute({
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId: `orbit-list-${commandID}`,
    operation: "list",
    expectedRepositoryVersion: 0,
  });
  const summary = listed.plans?.find(
    (plan) => plan.planId === identity.planId && plan.variantId === identity.variantId,
  );
  if (!summary?.draftId) {
    return lifecycleState(listed.repositoryVersion, undefined, listed.activePlan);
  }
  const opened = await client.execute({
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId: `orbit-open-${commandID}`,
    operation: "open",
    expectedRepositoryVersion: 0,
    draftId: summary.draftId,
  });
  const savedRevision = opened.draft?.baseRevision && sameVisiblePayload(opened.draft.payload, visible)
    ? opened.draft.baseRevision
    : undefined;
  return lifecycleState(opened.repositoryVersion, savedRevision, listed.activePlan);
}

export async function saveOrbitRevision(
  client: StrategyApplicationClient<StrategyOrbitRevisionPayloadV1>,
  visible: StrategyOrbitRevisionPayloadV1,
  name: string,
  clock: OrbitLifecycleClock = defaultClock,
): Promise<OrbitLifecycleState & { readonly revision: RevisionRefV1 }> {
  const identity = orbitLifecycleIdentity(visible.event.id);
  const operationID = safeToken(clock.id());
  const timestamp = clock.now();
  const listed = await client.execute({
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId: `orbit-list-${operationID}`,
    operation: "list",
    expectedRepositoryVersion: 0,
  });
  const summary = listed.plans?.find(
    (plan) => plan.planId === identity.planId && plan.variantId === identity.variantId,
  );
  let repositoryVersion = listed.repositoryVersion;
  let baseRevision = summary?.latestRevision;
  if (summary?.draftId) {
    const opened = await client.execute({
      protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
      commandId: `orbit-open-${operationID}`,
      operation: "open",
      expectedRepositoryVersion: 0,
      draftId: summary.draftId,
    });
    repositoryVersion = opened.repositoryVersion;
    baseRevision = opened.draft?.baseRevision ?? baseRevision;
  } else {
    const draft = orbitDraft(identity, visible, name, timestamp, baseRevision);
    const created = await client.execute({
      protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
      commandId: `orbit-create-${operationID}`,
      operation: "create",
      expectedRepositoryVersion: repositoryVersion,
      draft,
    });
    repositoryVersion = created.repositoryVersion;
  }

  const draft = orbitDraft(identity, visible, name, timestamp, baseRevision);
  const saved = await client.execute({
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId: `orbit-save-${operationID}`,
    operation: "save_revision",
    expectedRepositoryVersion: repositoryVersion,
    draft,
    revisionId: `orbit-revision-${operationID}`,
    createdAt: timestamp,
  });
  if (!saved.revision) {
    throw new Error("Strategy save did not return the immutable revision");
  }
  const revision: RevisionRefV1 = {
    planId: saved.revision.planId,
    variantId: saved.revision.variantId,
    revisionId: saved.revision.revisionId,
    contentHash: saved.revision.contentHash,
  };
  const refreshed = await client.execute({
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId: `orbit-list-after-save-${operationID}`,
    operation: "list",
    expectedRepositoryVersion: 0,
  });
  return {
    ...lifecycleState(refreshed.repositoryVersion, revision, refreshed.activePlan),
    revision,
  };
}

export async function activateOrbitRevision(
  client: StrategyApplicationClient<StrategyOrbitRevisionPayloadV1>,
  state: OrbitLifecycleState,
  clock: OrbitLifecycleClock = defaultClock,
): Promise<OrbitLifecycleState> {
  if (!state.savedRevision) {
    throw new Error("Guarda esta revisión visible antes de activarla");
  }
  const operationID = safeToken(clock.id());
  const result = await client.execute({
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId: `orbit-activate-${operationID}`,
    operation: "activate",
    expectedRepositoryVersion: state.repositoryVersion,
    revision: state.savedRevision,
    activationId: `orbit-activation-${operationID}`,
    activatedAt: clock.now(),
    ...(state.activePlan ? { current: state.activePlan } : {}),
  });
  if (!result.activePlan || !sameRevision(result.activePlan.revision, state.savedRevision)) {
    throw new Error("Strategy activation did not confirm the requested revision");
  }
  return lifecycleState(result.repositoryVersion, state.savedRevision, result.activePlan);
}

export function orbitLifecycleIdentity(eventID: string): {
  readonly draftId: string;
  readonly planId: string;
  readonly variantId: string;
} {
  const event = safeToken(eventID);
  return {
    draftId: `orbit-draft-${event}`,
    planId: `orbit-event-${event}`,
    variantId: "visible-plan",
  };
}

export function sameRevision(left: RevisionRefV1 | undefined, right: RevisionRefV1 | undefined): boolean {
  return left !== undefined && right !== undefined &&
    left.planId === right.planId && left.variantId === right.variantId &&
    left.revisionId === right.revisionId && left.contentHash === right.contentHash;
}

function orbitDraft(
  identity: ReturnType<typeof orbitLifecycleIdentity>,
  payload: StrategyOrbitRevisionPayloadV1,
  name: string,
  updatedAt: string,
  baseRevision?: RevisionRefV1,
): PlanDraftV1<StrategyOrbitRevisionPayloadV1> {
  return {
    contractVersion: "strategy.v1",
    draftId: identity.draftId,
    planId: identity.planId,
    variantId: identity.variantId,
    ...(baseRevision ? { baseRevision } : {}),
    name,
    mode: "manual",
    capabilities: ["manual_inputs"],
    provenance: { kind: "manual", sourceId: "strategy-orbit" },
    confidence: { level: "high", basis: "visible calculated plan" },
    updatedAt,
    payload,
  };
}

function lifecycleState(
  repositoryVersion: number,
  savedRevision: RevisionRefV1 | undefined,
  activePlan: ActivePlanV1 | undefined,
): OrbitLifecycleState {
  return {
    repositoryVersion,
    ...(savedRevision ? { savedRevision } : {}),
    ...(activePlan ? { activePlan } : {}),
  };
}

function safeToken(value: string): string {
  const token = value.replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96);
  return token || "visible";
}

function sameVisiblePayload(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => sameVisiblePayload(value, right[index]));
  }
  if (typeof left !== "object" || typeof right !== "object") return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && sameVisiblePayload(leftRecord[key], rightRecord[key]));
}
