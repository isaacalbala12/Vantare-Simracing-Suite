import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AnalysisClient } from "../../strategy/analysis-client";
import type { StrategyApplicationClient, StrategyApplicationCommandV1 } from "../../strategy/strategy-application-client";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import { openRecordedSession, type RecordedSession } from "./strategy-recorded-session";
import { StrategyRecordedWorkflow } from "./StrategyRecordedWorkflow";

vi.mock("./strategy-recorded-session", () => ({ openRecordedSession: vi.fn() }));
vi.mock("./use-recorded-calculation", () => ({ useRecordedCalculation: () => ({
  state: { status: "success", input: { activeVariantId: "recorded-main", variants: [{ id: "recorded-main" }], planningInputs: { projection: { sourceRevisions: [{ sessionId: "source", revisionId: "b".repeat(64) }] } } },
    result: { plans: { "recorded-main": { optimality: "proven", total: 3600, totalLaps: 35, stops: 0, reserveLaps: 1, reserveRequiredLaps: 1, stints: [], stopDetails: [] } } } },
  calculate: vi.fn(), recalculateStints: vi.fn(), recalculatePits: vi.fn(), cancel: vi.fn(),
}) }));
vi.mock("./use-recorded-acceptance", () => ({ useRecordedAcceptance: () => ({ state: { status: "idle" }, accept: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("names an exact source revision using its stable session identity, not its open handle", async () => {
  const candidate = { id: "candidate", displayName: "actual-session.duckdb", state: "ready", size: 1024, modifiedAt: "2026-09-09T12:00:00Z", walPresent: false };
  const session = { candidateId: candidate.id, combinationId: "combo", combination: { id: "combo", simId: "lmu", trackName: "Imola", trackLayout: "GP", carName: "Car", carClass: "LMP2" }, opened: { sessionId: "temporary-handle", session: { metadata: [] } }, base: { sessionId: "source" }, revision: { sessionId: "source", baseDigest: "a".repeat(64), revisionId: "b".repeat(64), snapshotId: "c".repeat(64) } } as RecordedSession;
  vi.mocked(openRecordedSession).mockResolvedValue(session);
  const analysis = { discover: vi.fn().mockResolvedValue([candidate]), close: vi.fn().mockResolvedValue(undefined) } as unknown as AnalysisClient;
  const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>) => ({ protocolVersion: "strategy.application.v1" as const, commandId: command.commandId, repositoryVersion: 8, recoveredFromBackup: false, closed: false, ...("draft" in command ? { draft: structuredClone(command.draft) } : {}) }));
  const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(), dispose: vi.fn() };
  render(<StrategyRecordedWorkflow eventId="event" repositoryVersion={7} catalog={[]} catalogState="available" calendar={null} application={application} analysis={analysis} onExit={vi.fn()} onCleanupError={vi.fn()} t={key => key} />);
  fireEvent.click(await screen.findByRole("button", { name: /strategy.entry.useSession/ }));
  await screen.findByRole("heading", { name: "strategy.entry.yourRace" });
  fireEvent.click(screen.getByRole("button", { name: /strategy.entry.openRace/ }));
  await waitFor(() => expect(screen.getByRole("tab", { name: "strategy.data.tab.race" }).getAttribute("aria-selected")).toBe("true"));
  fireEvent.click(screen.getByRole("tab", { name: "strategy.data.tab.plan" }));
  const sources = document.querySelector(".strategy-recorded-plan__sources");
  if (!sources) throw new Error("Expected exact plan sources");
  expect(within(sources as HTMLElement).getByText("actual-session.duckdb")).toBeTruthy();
});
