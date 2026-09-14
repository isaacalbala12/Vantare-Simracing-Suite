import { expect, it, vi } from "vitest";
import type { StrategyApplicationClient, StrategyApplicationCommandV1, StrategyApplicationResultV1 } from "../../strategy/strategy-application-client";
import { createRecordedDraft, saveRecordedDraft, openRecordedDraft } from "./strategy-recorded-persistence";
import { createRecordedWizardDraft } from "./strategy-recorded-wizard";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";

const draft = {
  ...createRecordedWizardDraft(),
  combination: { combinationId: "lmu:spa", simId: "lmu", trackName: "Spa", trackLayout: "", carClass: "LMP2", carName: "Car" },
  drivers: [{ id: "primary", name: "Alex" }],
  rules: { requiredWindows: [{ fromLap: 10, toLap: 20 }, { fromLap: 30, toLap: 40 }], mandatoryCompounds: ["hard", "wet"], allowedCompoundsByClimate: { dry: ["hard", "wet"], wet: ["soft"] }, driverLimits: { primary: { minLaps: 12, maxLaps: 40, maxContinuousTimeSeconds: 1800, maxTotalTimeSeconds: 5400, unavailable: [{ fromLap: 4, toLap: 4 }, { fromLap: 20, toLap: 25 }] } } },
};
const time = { id: () => "test-command", now: () => "2026-09-10T00:00:00Z" };
function fixture() {
  const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>): Promise<StrategyApplicationResultV1<RecordedDraftPayload>> => ({
    protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 8, recoveredFromBackup: false, closed: false,
    ...("draft" in command ? { draft: structuredClone(command.draft) } : {}),
  }));
  const client: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(), dispose: vi.fn() };
  return { client, execute };
}
it("creates a native configuration draft with missing inputs and no accepted/calculated state", async () => {
  const { client, execute } = fixture();
  const stored = await createRecordedDraft(client, "event", draft, 7, time);
  expect(execute).toHaveBeenCalledOnce();
  expect(execute.mock.calls[0][0]).toMatchObject({ operation: "create", expectedRepositoryVersion: 7, draft: { name: "Spa · Car", confidence: { level: "unknown" } } });
  expect(stored.document.payload.draft.tankLiters).toBeUndefined();
  expect(stored.document.baseRevision).toBeUndefined();
  expect(stored.document.payload).not.toHaveProperty("calculatedPlan");
  expect(stored.document.payload.draft).toEqual(draft);
});
it("preserves the original draft and propagates concurrent-edit failure without retrying", async () => {
  const { client, execute } = fixture();
  const stored = await createRecordedDraft(client, "event", draft, 7, time);
  execute.mockClear();
  execute.mockRejectedValueOnce(new Error("revision conflict"));
  await expect(saveRecordedDraft(client, stored, { ...draft, name: "Changed" }, time)).rejects.toThrow("revision conflict");
  expect(execute).toHaveBeenCalledOnce();
  expect(execute.mock.calls[0][0]).toMatchObject({ operation: "save_revision", expectedRepositoryVersion: 8 });
  expect(stored.document.payload.draft.name).toBe("");
});
it("reopens through the native operation and refuses incompatible payloads", async () => {
  const { client, execute } = fixture();
  const stored = await createRecordedDraft(client, "event", draft, 7, time);
  execute.mockResolvedValueOnce({ protocolVersion: "strategy.application.v1", commandId: "open", repositoryVersion: 9, recoveredFromBackup: false, closed: false, draft: stored.document });
  expect(await openRecordedDraft(client, stored.document.draftId, time)).toEqual({ ...stored, repositoryVersion: 9 });
  execute.mockResolvedValueOnce({ protocolVersion: "strategy.application.v1", commandId: "open", repositoryVersion: 9, recoveredFromBackup: false, closed: false });
  await expect(openRecordedDraft(client, stored.document.draftId, time)).rejects.toThrow("does not match");
});
it("does not write contradictory configuration or claim success after a storage failure", async () => {
  const { client, execute } = fixture();
  await expect(createRecordedDraft(client, "event", { ...draft, tankLiters: 70, initialFuelLiters: 80 }, 7, time)).rejects.toThrow("needs review");
  expect(execute).not.toHaveBeenCalled();
  execute.mockRejectedValueOnce(new Error("repository unavailable"));
  await expect(createRecordedDraft(client, "event", draft, 7, time)).rejects.toThrow("repository unavailable");
});
