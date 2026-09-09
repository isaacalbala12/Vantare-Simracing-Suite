import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { StrategyApplicationClient, StrategyApplicationCommandV1, StrategyApplicationResultV1 } from "../../strategy/strategy-application-client";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import { createRecordedWizardDraft } from "./strategy-recorded-wizard";
import { useRecordedLibrary } from "./use-recorded-library";

afterEach(cleanup);
const summary = { planId: "recorded-plan:event", variantId: "recorded-main", draftId: "recorded-draft:event", name: "Imola", mode: "manual", updatedAt: "2026-09-10T00:00:00Z", hasDraft: true, revisionCount: 0 };
const document = { contractVersion: "strategy.v1" as const, draftId: summary.draftId, planId: summary.planId, variantId: summary.variantId, name: "Imola", mode: "manual" as const, updatedAt: summary.updatedAt, capabilities: ["manual_inputs" as const], provenance: { kind: "manual" as const }, confidence: { level: "unknown" as const }, payload: { contractVersion: "strategy.recorded.draft.v1" as const, eventId: "event", draft: createRecordedWizardDraft() } };
function setup() {
  const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>): Promise<StrategyApplicationResultV1<RecordedDraftPayload>> => ({ protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 12, recoveredFromBackup: false, closed: false, ...(command.operation === "list" ? { plans: [summary, { ...summary, planId: "legacy", draftId: "legacy" }] } : { draft: document }) }));
  const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(), dispose: vi.fn() };
  return { ...renderHook(() => useRecordedLibrary(application)), execute };
}
it("lists summaries without opening payloads and retains the native repository version", async () => {
  const { result, execute } = setup();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(execute).toHaveBeenCalledOnce();
  expect(execute.mock.calls[0][0].operation).toBe("list");
  expect(result.current.plans).toEqual([summary]);
  expect(result.current.repositoryVersion).toBe(12);
  act(() => result.current.setQuery("spa"));
  expect(result.current.plans).toEqual([]);
});
it("opens one selected draft through the native service and rejects unlisted identities", async () => {
  const { result, execute } = setup();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  await act(async () => expect(await result.current.open(summary.draftId)).toEqual({ repositoryVersion: 12, document }));
  expect(execute.mock.calls[1][0]).toMatchObject({ operation: "open", draftId: summary.draftId });
  await act(async () => expect(await result.current.open("unlisted")).toBeUndefined());
  expect(execute).toHaveBeenCalledTimes(2);
});
it("reports a failed refresh and stops exposing a stale version as writable", async () => {
  const { result, execute } = setup();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  execute.mockRejectedValueOnce(new Error("repository unavailable"));
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.repositoryVersion).toBeUndefined();
  expect(result.current.error).toBe("repository unavailable");
});
it("refuses incompatible recorded payloads without pretending the draft opened", async () => {
  const { result, execute } = setup();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  execute.mockResolvedValueOnce({ protocolVersion: "strategy.application.v1", commandId: "open", repositoryVersion: 12, recoveredFromBackup: false, closed: false });
  await act(async () => expect(await result.current.open(summary.draftId)).toBeUndefined());
  expect(result.current.error).toContain("does not match");
});
it("rejects a payload belonging to a different event even when its draft identifier matches", async () => {
  const { result, execute } = setup();
  await waitFor(() => expect(result.current.status).toBe("ready"));
  execute.mockResolvedValueOnce({ protocolVersion: "strategy.application.v1", commandId: "open", repositoryVersion: 12, recoveredFromBackup: false, closed: false, draft: { ...document, payload: { ...document.payload, eventId: "another-event" } } });
  await act(async () => expect(await result.current.open(summary.draftId)).toBeUndefined());
  expect(result.current.error).toBe("recorded_plan_identity_mismatch");
});
