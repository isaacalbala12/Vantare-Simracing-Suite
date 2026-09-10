import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AnalysisClient } from "../../strategy/analysis-client";
import type { StrategyApplicationClient, StrategyApplicationCommandV1 } from "../../strategy/strategy-application-client";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import { openRecordedSession, type RecordedSession } from "./strategy-recorded-session";
import { StrategyRecordedWorkflow } from "./StrategyRecordedWorkflow";
import { getHubSuspendBlockerReasons } from "../hub-suspend-guard";

vi.mock("./strategy-recorded-session", () => ({ openRecordedSession: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const candidate = { id: "candidate", state: "ready", size: 1024, modifiedAt: "2026-09-09T12:00:00Z", walPresent: false };
const session = { candidateId: "candidate", combinationId: "combo", combination: { id: "combo", simId: "lmu", trackName: "Imola", trackLayout: "GP", carName: "Car", carClass: "LMP2" }, opened: { sessionId: "handle", session: { metadata: [] } }, base: { sessionId: "source" }, revision: { sessionId: "source", baseDigest: "a".repeat(64), revisionId: "b".repeat(64), snapshotId: "c".repeat(64) } } as RecordedSession;
function setup(version: number | undefined = 7) {
  const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>) => ({ protocolVersion: "strategy.application.v1" as const, commandId: command.commandId, repositoryVersion: 8, recoveredFromBackup: false, closed: false, ...("draft" in command ? { draft: structuredClone(command.draft) } : {}) }));
  const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(), dispose: vi.fn() };
  const close = vi.fn().mockResolvedValue(undefined);
  const discover = vi.fn().mockResolvedValue([candidate]);
  const analysis = { discover, close } as unknown as AnalysisClient;
  const onExit = vi.fn();
  vi.mocked(openRecordedSession).mockResolvedValue(session);
  return { ...render(<StrategyRecordedWorkflow eventId="event" repositoryVersion={version} catalog={[]} catalogState="available" calendar={null} application={application} analysis={analysis} onExit={onExit} onCleanupError={vi.fn()} t={key => key} />), execute, close, discover, onExit };
}
it("completes the five-step bootstrap using only an explicitly opened and accepted source", async () => {
  const { execute, close, unmount } = setup();
  fireEvent.click(screen.getByRole("button", { name: /strategy.journey.next/ }));
  fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.discover" }));
  const drawer = screen.getByRole("dialog");
  fireEvent.click(await within(drawer).findByRole("button", { name: "strategy.recorded.open" }));
  fireEvent.click(await within(drawer).findByRole("button", { name: "strategy.recorded.apply" }));
  await within(drawer).findByText("strategy.recorded.applied");
  expect(execute).not.toHaveBeenCalled();
  fireEvent.click(within(drawer).getAllByRole("button", { name: "strategy.recorded.close" })[0]);
  for (let step = 0; step < 3; step++) fireEvent.click(screen.getByRole("button", { name: /strategy.journey.next/ }));
  fireEvent.click(screen.getByRole("button", { name: /strategy.journey.openDraft/ }));
  await screen.findByText("strategy.workspace.saved");
  // The guard is released by an effect after the saved view commits.
  await waitFor(() => expect(getHubSuspendBlockerReasons()).not.toContain("strategy.workspace.unsaved"));
  expect(execute.mock.calls[0][0]).toMatchObject({ operation: "create", draft: { payload: { draft: { combination: { combinationId: "combo" }, sessions: [session.revision] } } } });
  fireEvent.click(screen.getByRole("button", { name: "strategy.workspace.preparation" }));
  expect(getHubSuspendBlockerReasons()).toContain("strategy.workspace.unsaved");
  expect(close).not.toHaveBeenCalled();
  unmount();
  expect(getHubSuspendBlockerReasons()).not.toContain("strategy.workspace.unsaved");
  await waitFor(() => expect(close).toHaveBeenCalledExactlyOnceWith("handle"));
});
it("asks before discarding an unsaved preparation", () => {
  const { onExit } = setup();
  fireEvent.click(screen.getByRole("button", { name: /strategy.journey.back/ }));
  expect(onExit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "strategy.workspace.leave" }));
  expect(onExit).toHaveBeenCalledOnce();
});
