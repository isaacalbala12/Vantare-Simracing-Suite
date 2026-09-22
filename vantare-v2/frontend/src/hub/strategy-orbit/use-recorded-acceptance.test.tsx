import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StrategyApplicationClient, StrategyApplicationCommandV1, StrategyApplicationResultV1, StrategyOrbitCalculationInputV1, StrategyOrbitCalculatedPlanV1 } from "../../strategy/strategy-application-client";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import { createRecordedWizardDraft } from "./strategy-recorded-wizard";
import { useRecordedAcceptance } from "./use-recorded-acceptance";

const input: StrategyOrbitCalculationInputV1 = {
  event: { raceKind: "laps", targetLaps: 4, durationMinutes: 0, tankLiters: 10, pitLossSeconds: 20, virtualEnergy: { applicability: "not_applicable" } },
  drivers: [{ id: "alex", name: "Alex", paceDeltaSeconds: 0 }],
  variants: [{ id: "recorded-main", mode: "dry", driverOrderMode: "fixed", order: ["alex"], overrides: {} }], activeVariantId: "recorded-main",
};
const plan = { totalLaps: 4, total: 360, stops: 0, stints: [] } as unknown as StrategyOrbitCalculatedPlanV1;

describe("useRecordedAcceptance", () => {
  it("accepts a manual plan without claiming imported telemetry", async () => {
    const seen: StrategyApplicationCommandV1<RecordedDraftPayload>[] = [];
    let version = 1;
    const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>): Promise<StrategyApplicationResultV1<RecordedDraftPayload>> => {
      seen.push(command);
      const base = { protocolVersion: "strategy.application.v1" as const, commandId: command.commandId, repositoryVersion: version, recoveredFromBackup: false, closed: false };
      if (command.operation === "get_pending_revision_save") return base;
      if (command.operation === "list") return { ...base, plans: [] };
      if (command.operation === "create") { version += 1; return { ...base, repositoryVersion: version, draft: command.draft }; }
      if (command.operation === "save_revision") { version += 1; return { ...base, repositoryVersion: version, revision: { planId: command.draft.planId, variantId: command.draft.variantId, revisionId: command.revisionId, contentHash: "a".repeat(64) }, pendingRevision: { command, commandDigest: "b".repeat(64) } }; }
      return base;
    });
    const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(() => false), dispose: vi.fn() };
    const draft = { ...createRecordedWizardDraft(), mode: "manual" as const, calculationMode: "dry" as const, manualInputs: { paceSeconds: 90, fuelLitersPerLap: 2 } };
    const calculation = { status: "success" as const, input, result: { plans: { "recorded-main": plan }, comparisons: {} } };
    const { result } = renderHook(() => useRecordedAcceptance("event-1", draft, calculation, application));
    await waitFor(() => expect(result.current.state.status).toBe("idle"));
    await act(() => result.current.accept());
    expect(result.current.state.status).toBe("accepted");
    expect(seen.find(command => command.operation === "save_revision")).toMatchObject({ draft: {
      mode: "manual", capabilities: ["manual_inputs", "fuel_strategy", "virtual_energy_strategy"], provenance: { kind: "manual", sourceId: "strategy-manual" },
    } });
  });

  it("saves the exact proposal as an assisted recoverable revision", async () => {
    const seen: StrategyApplicationCommandV1<RecordedDraftPayload>[] = [];
    let version = 1;
    const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>): Promise<StrategyApplicationResultV1<RecordedDraftPayload>> => {
      seen.push(command);
      const base = { protocolVersion: "strategy.application.v1" as const, commandId: command.commandId, repositoryVersion: version, recoveredFromBackup: false, closed: false };
      if (command.operation === "get_pending_revision_save") return base;
      if (command.operation === "list") return { ...base, repositoryVersion: version, plans: [] };
      if (command.operation === "create") { version += 1; return { ...base, repositoryVersion: version, draft: command.draft }; }
      if (command.operation === "save_revision") {
        version += 1;
        const revision = { planId: command.draft.planId, variantId: command.draft.variantId, revisionId: command.revisionId, contentHash: "a".repeat(64) };
        return { ...base, repositoryVersion: version, revision, pendingRevision: { command, commandDigest: "b".repeat(64) } };
      }
      return { ...base, repositoryVersion: version };
    });
    const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(() => false), dispose: vi.fn() };
    const draft = { ...createRecordedWizardDraft(), mode: "automatic" as const, name: "Imola", calculationMode: "dry" as const, sessions: [{ sessionId: "source", baseDigest: "a".repeat(64), revisionId: "b".repeat(64), snapshotId: "c".repeat(64) }] };
    const calculation = { status: "success" as const, input, result: { plans: { "recorded-main": plan }, comparisons: {} } };
    const { result, rerender } = renderHook(({ value }) => useRecordedAcceptance("event-1", value, calculation, application), { initialProps: { value: draft } });
    await waitFor(() => expect(result.current.state.status).toBe("idle"));

    await act(() => result.current.accept());

    expect(result.current.state.status).toBe("accepted");
    const save = seen.find(command => command.operation === "save_revision");
    expect(save).toMatchObject({ operation: "save_revision", recoverable: true, draft: {
      mode: "assisted", capabilities: ["fuel_strategy", "telemetry_import", "virtual_energy_strategy"],
      provenance: { kind: "derived", sourceId: "strategy-recorded" },
      payload: { calculationInput: input, calculatedPlan: plan },
    } });
    expect(seen.some(command => command.operation === "acknowledge_pending_revision_save")).toBe(true);

    rerender({ value: { ...draft, name: "Changed" } });
    expect(result.current.state.status).toBe("idle");
  });
});
