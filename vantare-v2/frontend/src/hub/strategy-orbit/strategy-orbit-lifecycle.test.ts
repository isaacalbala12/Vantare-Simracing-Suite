import { describe, expect, it, vi } from "vitest";

import type {
  StrategyApplicationClient,
  StrategyApplicationCommandV1,
  StrategyApplicationResultV1,
  StrategyOrbitCalculationInputV1,
} from "../../strategy/strategy-application-client";
import projectionGolden from "../../../../internal/telemetryanalysis/strategyprojection/testdata/strategyinputprojection_v2_new.json";
import type { RevisionRefV1 } from "../../strategy/strategy-contract-v1";
import {
  activateOrbitRevision,
  acknowledgeOrbitRevisionRecovery,
  loadOrbitLifecycle,
  loadOrbitRevisionRecovery,
  resolveOrbitRevisionRecovery,
  retryOrbitRevisionRecovery,
  saveOrbitRevision,
  type StrategyOrbitRevisionPayloadV1,
} from "./strategy-orbit-lifecycle";

const payload: StrategyOrbitRevisionPayloadV1 = {
  contractVersion: "strategy.orbit.revision.v1",
  event: { id: "event-1", name: "Enduro", track: "Imola" },
  variant: { id: "strategy-a", name: "Base", mode: "dry" },
  calculatedPlan: { totalLaps: 139 },
};

function payloadWithSourceRevision(revisionId: string): StrategyOrbitRevisionPayloadV1 {
  const sourceRevisions = projectionGolden.sourceSessions.map((sessionId) => ({
    sessionId,
    baseDigest: "a".repeat(64),
    revisionId,
    snapshotId: "c".repeat(64),
  }));
  const calculationInput = {
    event: { durationMinutes: 60, tankLiters: 100, pitLossSeconds: 30 },
    drivers: [],
    variants: [],
    activeVariantId: "strategy-a",
    planningInputs: {
      projection: { ...projectionGolden, sourceRevisions },
      overrides: {},
    },
  } as StrategyOrbitCalculationInputV1;
  return { ...payload, calculationInput };
}

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
          pendingRevision: { command, commandDigest: "c".repeat(64) },
        });
      }
      if (command.operation === "acknowledge_pending_revision_save") return result(command);
      throw new Error(`unexpected ${command.operation}`);
    });

    const saved = await saveOrbitRevision(client, payload, "Enduro · Base", {
      id: () => "visible",
      now: () => "2026-08-21T18:00:00Z",
    });

    expect(seen.map((command) => command.operation)).toEqual(["list", "create", "save_revision", "acknowledge_pending_revision_save", "list"]);
    expect(seen[1]).toMatchObject({
      operation: "create",
      expectedRepositoryVersion: 7,
      draft: { payload, planId: revision.planId, variantId: revision.variantId },
    });
    expect(seen[2]).toMatchObject({
      operation: "save_revision",
      expectedRepositoryVersion: 8,
      revisionId: "orbit-revision-visible",
      recoverable: true,
      draft: { payload },
    });
    expect(saved.revision).toEqual(revision);
    expect(saved.repositoryVersion).toBe(9);
  });

  it("recupera, comprueba, reintenta y reconoce solo por la intención exacta", async () => {
    const saveCommand: Extract<StrategyApplicationCommandV1<StrategyOrbitRevisionPayloadV1>, { operation: "save_revision" }> = {
      protocolVersion: "strategy.application.v1",
      commandId: "orbit-save-lost",
      operation: "save_revision",
      expectedRepositoryVersion: 8,
      draft: {
        contractVersion: "strategy.v1",
        draftId: "orbit-draft-event-1",
        planId: revision.planId,
        variantId: revision.variantId,
        name: "Enduro · Base",
        mode: "manual",
        capabilities: ["manual_inputs"],
        provenance: { kind: "manual", sourceId: "strategy-orbit" },
        confidence: { level: "high", basis: "visible calculated plan" },
        updatedAt: "2026-08-21T18:00:00Z",
        payload,
      },
      revisionId: revision.revisionId,
      createdAt: "2026-08-21T18:00:00Z",
      recoverable: true,
    };
    const pendingRevision = { command: saveCommand, commandDigest: "d".repeat(64) };
    const seen: StrategyApplicationCommandV1<StrategyOrbitRevisionPayloadV1>[] = [];
    const client = clientWith(async (command) => {
      seen.push(command);
      if (command.operation === "get_pending_revision_save") return result(command, { pendingRevision });
      if (command.operation === "resolve_pending_revision_save") return result(command, { pendingRevision, pendingResolution: "stored", revision: { ...saveCommand.draft, ...revision } as never });
      if (command.operation === "save_revision") return result(command, { revision: { ...saveCommand.draft, ...revision } as never, pendingRevision });
      if (command.operation === "acknowledge_pending_revision_save") return result(command);
      throw new Error(`unexpected ${command.operation}`);
    });

    expect(await loadOrbitRevisionRecovery(client, "load")).toEqual(pendingRevision);
    expect(await resolveOrbitRevisionRecovery(client, "check")).toEqual({ stored: true, revision });
    expect(await retryOrbitRevisionRecovery(client, pendingRevision, "retry")).toEqual(revision);
    await acknowledgeOrbitRevisionRecovery(client, pendingRevision, "dismiss");
    expect(seen.map((command) => command.operation)).toEqual([
      "get_pending_revision_save", "resolve_pending_revision_save", "save_revision",
      "acknowledge_pending_revision_save", "acknowledge_pending_revision_save",
    ]);
    expect(seen[2]).toEqual(saveCommand);
  });

  it("al recargar recupera revisión exacta y ActivePlan solo del backend", async () => {
    const savedPayload = payloadWithSourceRevision("b".repeat(64));
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
        if (!("draftId" in command) || command.draftId === undefined) {
          throw new Error("unexpected revision open");
        }
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
          payload: savedPayload,
        };
        return result(command, { repositoryVersion: 12, draft, savedDraft: draft });
      }
      throw new Error(`unexpected ${command.operation}`);
    });

    const loaded = await loadOrbitLifecycle(client, savedPayload, "reload");
    expect(loaded.savedRevision).toEqual(revision);
    expect(loaded.activePlan).toEqual(activePlan);
    expect(loaded.repositoryVersion).toBe(12);

    const changedSource = await loadOrbitLifecycle(
      client,
      payloadWithSourceRevision("d".repeat(64)),
      "changed-source",
    );
    expect(changedSource.savedRevision).toBeUndefined();
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

  it("usa una marca canónica al activar en un segundo exacto", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:05:00.000Z"));
    try {
      const execute = vi.fn(async (command: StrategyApplicationCommandV1<StrategyOrbitRevisionPayloadV1>) => {
        if (command.operation !== "activate") throw new Error(`unexpected ${command.operation}`);
        return result(command, { activePlan: { contractVersion: "strategy.v1", activationId: command.activationId, revision: command.revision, activatedAt: command.activatedAt } });
      });
      await activateOrbitRevision(clientWith(execute), { repositoryVersion: 12, savedRevision: revision });
      expect(execute.mock.calls[0][0].activatedAt).toBe("2026-09-15T12:05:00Z");
    } finally {
      vi.useRealTimers();
    }
  });
});
