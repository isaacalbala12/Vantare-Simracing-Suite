import { describe, expect, it, vi } from "vitest";

import type {
  StrategyApplicationClient,
  StrategyApplicationCommandV1,
  StrategyApplicationResultV1,
} from "../../strategy/strategy-application-client";
import type { RevisionRefV1 } from "../../strategy/strategy-contract-v1";
import {
  activateOrbitRevision,
  loadOrbitLifecycle,
  saveOrbitRevision,
  type StrategyOrbitRevisionPayloadV1,
} from "./strategy-orbit-lifecycle";

const payload: StrategyOrbitRevisionPayloadV1 = {
  contractVersion: "strategy.orbit.revision.v1",
  event: { id: "event-1", name: "Enduro", track: "Imola" },
  variant: { id: "strategy-a", name: "Base", mode: "dry" },
  calculatedPlan: { totalLaps: 139 },
};

const revision: RevisionRefV1 = {
  planId: "orbit-event-event-1",
  variantId: "visible-plan",
  revisionId: "revision-visible",
  contentHash: "a".repeat(64),
};

function clientWith(
  execute: (command: StrategyApplicationCommandV1<StrategyOrbitRevisionPayloadV1>) =>
    Promise<StrategyApplicationResultV1<StrategyOrbitRevisionPayloadV1>>,
): StrategyApplicationClient<StrategyOrbitRevisionPayloadV1> {
  return { execute, cancel: () => false, dispose: () => undefined };
}

function result(
  command: StrategyApplicationCommandV1<StrategyOrbitRevisionPayloadV1>,
  overrides: Partial<StrategyApplicationResultV1<StrategyOrbitRevisionPayloadV1>> = {},
): StrategyApplicationResultV1<StrategyOrbitRevisionPayloadV1> {
  return {
    protocolVersion: "strategy.application.v1",
    commandId: command.commandId,
    repositoryVersion: 4,
    recoveredFromBackup: false,
    closed: false,
    ...overrides,
  };
}

describe("Strategy Orbit lifecycle canónico", () => {
  it("Guardar crea el draft si falta y después una revisión inmutable de lo visible", async () => {
    const seen: StrategyApplicationCommandV1<StrategyOrbitRevisionPayloadV1>[] = [];
    const client = clientWith(async (command) => {
      seen.push(command);
      if (command.operation === "list") {
        return result(command, { repositoryVersion: seen.length === 1 ? 7 : 9, plans: [] });
      }
      if (command.operation === "create") {
        return result(command, { repositoryVersion: 8, draft: command.draft, savedDraft: command.draft });
      }
      if (command.operation === "save_revision") {
        return result(command, {
          repositoryVersion: 9,
          draft: { ...command.draft, baseRevision: revision },
          savedDraft: { ...command.draft, baseRevision: revision },
          revision: {
            contractVersion: "strategy.v1",
            hashAlgorithm: "sha256:strategy-c14n-v1",
            revisionId: revision.revisionId,
            sourceDraftId: command.draft.draftId,
            planId: revision.planId,
            variantId: revision.variantId,
            name: command.draft.name,
            mode: command.draft.mode,
            capabilities: command.draft.capabilities,
            provenance: command.draft.provenance,
            confidence: command.draft.confidence,
            createdAt: command.createdAt,
            payload: command.draft.payload,
            contentHash: revision.contentHash,
          } as never,
        });
      }
      throw new Error(`unexpected ${command.operation}`);
    });

    const saved = await saveOrbitRevision(client, payload, "Enduro · Base", {
      id: () => "visible",
      now: () => "2026-08-21T18:00:00Z",
    });

    expect(seen.map((command) => command.operation)).toEqual(["list", "create", "save_revision", "list"]);
    expect(seen[1]).toMatchObject({
      operation: "create",
      expectedRepositoryVersion: 7,
      draft: { payload, planId: revision.planId, variantId: revision.variantId },
    });
    expect(seen[2]).toMatchObject({
      operation: "save_revision",
      expectedRepositoryVersion: 8,
      revisionId: "orbit-revision-visible",
      draft: { payload },
    });
    expect(saved.revision).toEqual(revision);
    expect(saved.repositoryVersion).toBe(9);
  });

  it("al recargar recupera revisión exacta y ActivePlan solo del backend", async () => {
    const activePlan = {
      contractVersion: "strategy.v1" as const,
      activationId: "activation-1",
      revision,
      activatedAt: "2026-08-21T18:01:00Z",
    };
    const client = clientWith(async (command) => {
      if (command.operation === "list") {
        return result(command, {
          repositoryVersion: 12,
          activePlan,
          plans: [{
            planId: revision.planId,
            variantId: revision.variantId,
            draftId: "orbit-draft-event-1",
            name: "Enduro · Base",
            mode: "manual",
            updatedAt: "2026-08-21T18:00:00Z",
            hasDraft: true,
            revisionCount: 1,
            latestRevision: revision,
            latestRevisionAt: "2026-08-21T18:00:00Z",
          }],
        });
      }
      if (command.operation === "open") {
        const draft = {
          contractVersion: "strategy.v1" as const,
          draftId: command.draftId,
          planId: revision.planId,
          variantId: revision.variantId,
          baseRevision: revision,
          name: "Enduro · Base",
          mode: "manual" as const,
          capabilities: ["manual_inputs" as const],
          provenance: { kind: "manual" as const, sourceId: "strategy-orbit" },
          confidence: { level: "high" as const, basis: "visible calculated plan" },
          updatedAt: "2026-08-21T18:00:00Z",
          payload,
        };
        return result(command, { repositoryVersion: 12, draft, savedDraft: draft });
      }
      throw new Error(`unexpected ${command.operation}`);
    });

    const loaded = await loadOrbitLifecycle(client, payload, "reload");
    expect(loaded.savedRevision).toEqual(revision);
    expect(loaded.activePlan).toEqual(activePlan);
    expect(loaded.repositoryVersion).toBe(12);
  });

  it("Activar envía exactamente la revisión guardada y conserva el ActivePlan devuelto", async () => {
    const execute = vi.fn(async (command: StrategyApplicationCommandV1<StrategyOrbitRevisionPayloadV1>) => {
      if (command.operation !== "activate") throw new Error(`unexpected ${command.operation}`);
      return result(command, {
        repositoryVersion: 13,
        activePlan: {
          contractVersion: "strategy.v1",
          activationId: command.activationId,
          revision: command.revision,
          activatedAt: command.activatedAt,
        },
      });
    });

    const activated = await activateOrbitRevision(clientWith(execute), {
      repositoryVersion: 12,
      savedRevision: revision,
    }, { id: () => "visible", now: () => "2026-08-21T18:01:00Z" });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      operation: "activate",
      expectedRepositoryVersion: 12,
      revision,
    }));
    expect(activated.activePlan?.revision).toEqual(revision);
  });
});
