import { expect, it, vi } from "vitest";
import type { StrategyApplicationClient, StrategyApplicationResultV1, StrategyPlanningInputsV2 } from "../../strategy/strategy-application-client";
import { prepareRecordedPlanningInputs } from "./strategy-recorded-planning-inputs";
import { createRecordedWizardDraft } from "./strategy-recorded-wizard";

const refs = [
  { sessionId: "race-a", baseDigest: "a".repeat(64), revisionId: "b".repeat(64), snapshotId: "c".repeat(64) },
  { sessionId: "race-b", baseDigest: "d".repeat(64), revisionId: "e".repeat(64), snapshotId: "f".repeat(64) },
];
const planning = {
  overrides: {},
  projection: { combinationId: "combo", sourceRevisions: refs, generatedAt: "2026-09-15T01:00:00.123Z" },
} as unknown as StrategyPlanningInputsV2;

function client(result: Partial<StrategyApplicationResultV1<unknown>>) {
  const execute = vi.fn().mockResolvedValue({
    protocolVersion: "strategy.application.v1", commandId: "prepare", repositoryVersion: 9,
    recoveredFromBackup: false, closed: false, ...result,
  });
  return { execute, cancel: vi.fn(), dispose: vi.fn() } as unknown as StrategyApplicationClient<unknown>;
}

it("requests one exact recorded projection without creating an event", async () => {
  const application = client({ planningInputStatus: "available", planningInputs: planning });
  const draft = { ...createRecordedWizardDraft(), combination: { combinationId: "combo", simId: "lmu", trackName: "Imola", trackLayout: "GP", carName: "499P", carClass: "Hypercar" }, sessions: refs };

  await expect(prepareRecordedPlanningInputs(application, draft, 9, "prepare", "2026-09-15T01:00:00.123Z")).resolves.toBe(planning);
  expect(application.execute).toHaveBeenCalledWith({
    protocolVersion: "strategy.application.v1", commandId: "prepare", operation: "get_revision_planning_inputs",
    expectedRepositoryVersion: 9, combinationId: "combo", sourceRevisions: refs, generatedAt: "2026-09-15T01:00:00.123Z",
  });
});

it.each([
  ["missing inputs", { planningInputStatus: "available" }],
  ["wrong status", { planningInputStatus: "manual_only", planningInputs: planning }],
  ["foreign combination", { planningInputStatus: "available", planningInputs: { ...planning, projection: { ...planning.projection!, combinationId: "other" } } }],
  ["foreign timestamp", { planningInputStatus: "available", planningInputs: { ...planning, projection: { ...planning.projection!, generatedAt: "2026-09-15T01:00:01.123Z" } } }],
  ["partial revisions", { planningInputStatus: "available", planningInputs: { ...planning, projection: { ...planning.projection!, sourceRevisions: refs.slice(0, 1) } } }],
  ["substituted revision", { planningInputStatus: "available", planningInputs: { ...planning, projection: { ...planning.projection!, sourceRevisions: [{ ...refs[0], revisionId: "9".repeat(64) }, refs[1]] } } }],
  ["duplicated response", { planningInputStatus: "available", planningInputs: { ...planning, projection: { ...planning.projection!, sourceRevisions: [refs[0], refs[0]] } } }],
] as const)("rejects %s", async (_name, result) => {
  const application = client(result as Partial<StrategyApplicationResultV1<unknown>>);
  const draft = { ...createRecordedWizardDraft(), combination: { combinationId: "combo", simId: "lmu", trackName: "Imola", trackLayout: "GP", carName: "499P", carClass: "Hypercar" }, sessions: refs };
  await expect(prepareRecordedPlanningInputs(application, draft, 9, "prepare", "2026-09-15T01:00:00.123Z")).rejects.toThrow(/recorded planning inputs/i);
});
