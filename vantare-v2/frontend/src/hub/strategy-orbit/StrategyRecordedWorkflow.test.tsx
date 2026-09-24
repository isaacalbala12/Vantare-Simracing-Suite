import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisClient, AnalysisSaveRequest } from "../../strategy/analysis-client";
import { parseAnalysisBase, parseAnalysisCandidates, parseAnalysisOpenedSession, parseAnalysisPage, parseCorrectionStoreResult } from "../../strategy/analysis-contract";
import type { StrategyApplicationClient, StrategyApplicationCommandV1 } from "../../strategy/strategy-application-client";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import { openRecordedSession, type RecordedSession } from "./strategy-recorded-session";
import { StrategyRecordedWorkflow } from "./StrategyRecordedWorkflow";
import { getHubSuspendBlockerReasons } from "../hub-suspend-guard";

vi.mock("./strategy-recorded-session", () => ({ openRecordedSession: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const candidate = { id: "candidate", displayName: "actual-session.duckdb", state: "ready", size: 1024, modifiedAt: "2026-09-09T12:00:00Z", walPresent: false };
const session = { candidateId: "candidate", combinationId: "combo", combination: { id: "combo", simId: "lmu", trackName: "Imola", trackLayout: "GP", carName: "Car", carClass: "LMP2" }, opened: { sessionId: "handle", session: { metadata: [] } }, base: { sessionId: "source" }, revision: { sessionId: "source", baseDigest: "a".repeat(64), revisionId: "b".repeat(64), snapshotId: "c".repeat(64) } } as RecordedSession;
function setup(version: number | undefined = 7, strict = false) {
  const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>) => ({ protocolVersion: "strategy.application.v1" as const, commandId: command.commandId, repositoryVersion: 8, recoveredFromBackup: false, closed: false, ...("draft" in command ? { draft: structuredClone(command.draft) } : {}) }));
  const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(), dispose: vi.fn() };
  const close = vi.fn().mockResolvedValue(undefined);
  const discover = vi.fn().mockResolvedValue([candidate]);
  const analysis = { discover, close } as unknown as AnalysisClient;
  const onExit = vi.fn();
  const drafts: { sessions: number; mode: string }[] = [];
  vi.mocked(openRecordedSession).mockResolvedValue(session);
  const workflow = <StrategyRecordedWorkflow eventId="event" repositoryVersion={version} catalog={[]} catalogState="available" calendar={null} application={application} analysis={analysis} onExit={onExit} onCleanupError={vi.fn()} navigation={({ requestExit, draft }) => { drafts.push({ sessions: draft.sessions.length, mode: draft.mode }); return <button type="button" onClick={() => requestExit()}>Leave Strategy</button>; }} t={key => key} />;
  return { ...render(strict ? <StrictMode>{workflow}</StrictMode> : workflow), execute, close, discover, onExit, drafts };
}
it("discovers recent candidates after StrictMode replays the mount effect", async () => {
  const { discover } = setup(7, true);
  expect(await screen.findByRole("button", { name: /strategy.entry.useSession/ })).toBeTruthy();
  expect(discover).toHaveBeenCalledOnce();
});
it("returns from the origin menu to the existing manual preparation", async () => {
  const { discover } = setup();
  await waitFor(() => expect(discover).toHaveBeenCalledOnce());
  const manual = await screen.findByRole<HTMLButtonElement>("button", { name: /strategy.entry.startManual/ });
  await waitFor(() => expect(manual.disabled).toBe(false));
  fireEvent.click(manual);
  fireEvent.change(await screen.findByRole("spinbutton", { name: "strategy.entry.input.paceSeconds" }), { target: { value: "91" } });
  fireEvent.click(screen.getByRole("button", { name: "strategy.entry.changeSource" }));
  fireEvent.click(screen.getByRole("button", { name: /strategy.entry.resume/ }));
  expect((screen.getByRole("spinbutton", { name: "strategy.entry.input.paceSeconds" }) as HTMLInputElement).value).toBe("91");
});
it("adds a second verified session from the desk library without replacing the first", async () => {
  const second = { ...candidate, id: "candidate-b", displayName: "second.duckdb", modifiedAt: "2026-09-08T12:00:00Z" };
  const { discover, drafts } = setup();
  discover.mockResolvedValue([candidate, second]);
  vi.mocked(openRecordedSession).mockImplementation(async (_client, id) => id === second.id
    ? { ...session, candidateId: second.id, opened: { ...session.opened, sessionId: "handle-b" }, base: { ...session.base, sessionId: "source-b" }, revision: { ...session.revision, sessionId: "source-b" } }
    : session);
  fireEvent.click(screen.getByRole("button", { name: "strategy.entry.openTelemetry" }));
  fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.discover" }));
  const library = screen.getByTestId("strategy-recorded-source-screen");
  const first = await within(library).findAllByRole("button", { name: "strategy.entry.useSession" });
  fireEvent.click(first[0]);
  await screen.findByRole("heading", { name: "strategy.entry.yourRace" });
  expect(within(document.querySelector(".strategy-preparation__source-list") as HTMLElement).getByText("actual-session.duckdb")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /strategy.entry.changeSession/ }));
  const opened = await within(screen.getByTestId("strategy-recorded-source-screen")).findAllByRole("button", { name: "strategy.recorded.open" });
  expect((opened[0] as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(opened[1]);
  const apply = screen.getByRole<HTMLButtonElement>("button", { name: "strategy.recorded.apply" });
  await waitFor(() => expect(apply.disabled).toBe(false));
  fireEvent.click(apply);
  await waitFor(() => expect(drafts.at(-1)).toMatchObject({ sessions: 2, mode: "automatic" }));
});
it("opens and adopts a chosen recent session in one action, without persisting early", async () => {
  const { execute, close, unmount } = setup();
  fireEvent.click(await screen.findByRole("button", { name: /strategy.entry.useSession/ }));
  await screen.findByRole("heading", { name: "strategy.entry.yourRace" });
  expect(screen.queryByRole("button", { name: /strategy.journey.next/ })).toBeNull();
  expect(execute.mock.calls.some(([command]) => command.operation !== "get_revision_planning_inputs")).toBe(false);
  expect(screen.getByText("strategy.entry.telemetryBase")).toBeTruthy();
  expect(getHubSuspendBlockerReasons()).toContain("strategy.workspace.unsaved");
  expect(close).not.toHaveBeenCalled();
  unmount();
  expect(getHubSuspendBlockerReasons()).not.toContain("strategy.workspace.unsaved");
  await waitFor(() => expect(close).toHaveBeenCalledExactlyOnceWith("handle"));
});
it("opens the race desk at the editable race when preparation is incomplete", async () => {
  setup();
  fireEvent.click(await screen.findByRole("button", { name: /strategy.entry.useSession/ }));
  await screen.findByRole("heading", { name: "strategy.entry.yourRace" });
  fireEvent.click(screen.getByRole("button", { name: /strategy.entry.openRace/ }));
  await waitFor(() => expect(screen.getByRole("tab", { name: "strategy.data.tab.race" }).getAttribute("aria-selected")).toBe("true"));
  expect(screen.getByRole("button", { name: "strategy.workspace.edit strategy.journey.step.rules" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "strategy.data.tab.plan" }).getAttribute("aria-selected")).toBe("false");
});
it("asks before discarding an unsaved manual preparation", async () => {
  const { onExit } = setup();
  const manual = await screen.findByRole<HTMLButtonElement>("button", { name: /strategy.entry.startManual/ });
  await waitFor(() => expect(manual.disabled).toBe(false));
  fireEvent.click(manual);
  expect(await screen.findByRole("heading", { name: "strategy.entry.yourRace" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Leave Strategy" }));
  expect(onExit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "strategy.workspace.leave" }));
  expect(onExit).toHaveBeenCalledOnce();
});

const pa = "a".repeat(64), pb = "b".repeat(64), pc = "c".repeat(64);
type DraftSeen = { step: string; mode: string; sessions: number; combination: string | undefined };
function inspectionJourney() {
  const base = parseAnalysisBase({ sessionId: "source", contentSha256: pa, sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "analysis", segmentationDigest: pb });
  const channel = { id: "fuel", source_name: "Fuel level", unit: { symbol: "L", quality: "valid" as const }, sampling: { kind: "event_timestamped" as const, origin: "source_timestamp" as const }, columns: [{ name: "value", type: "number" as const }] };
  const opened = parseAnalysisOpenedSession({ sessionId: "handle", session: { schema_version: 1, id: "source", channels: [channel], metadata: [] } });
  const partial: RecordedSession = { editableChannelIds: ["fuel"], candidateId: "partial", opened, base, revision: { sessionId: "source", baseDigest: pc, revisionId: pa, snapshotId: pa }, projectionUnavailableReason: "metadata_unavailable" };
  const current = parseCorrectionStoreResult({ headId: pa, revision: { revisionId: pa, parentRevisionId: "", command: { expectedRevision: "", commandId: "", reason: "", localAuthorId: "" }, commandDigest: "", createdAt: "", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: pa, corrections: [] } } });
  const page = parseAnalysisPage({ channel_id: "fuel", start: 0, sampling: channel.sampling, samples: [{ index: 0, values: [{ column: "value", present: true, quality: "unknown" as const, scalar: { kind: "number" as const, number: 12 } }] }] });
  const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>) => ({ protocolVersion: "strategy.application.v1" as const, commandId: command.commandId, repositoryVersion: 8, recoveredFromBackup: false, closed: false, ...("draft" in command ? { draft: structuredClone(command.draft) } : {}) }));
  const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(), dispose: vi.fn() };
  const close = vi.fn().mockResolvedValue(undefined);
  const candidates = parseAnalysisCandidates([{ id: "partial", displayName: "Imola_partial.duckdb", state: "ready", size: 1024, modifiedAt: "2026-09-09T12:00:00Z", walPresent: false }]);
  const project = vi.fn();
  const buildResponse = (request: AnalysisSaveRequest) => {
    const response = { headId: pb, revision: { revisionId: pb, parentRevisionId: pa, command: request.command, commandDigest: pc, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: pb, corrections: request.corrections.map(item => ({ baseId: pc, correctionId: pb, request: item, original: item.expected, corrected: { ...item.expected, scalar: item.replacement } })) } } };
    expect(parseCorrectionStoreResult(response)).toBe(response);
    return response;
  };
  const save = vi.fn(async (request: AnalysisSaveRequest) => buildResponse(request));
  const load = vi.fn(async () => current);
  const resolve = vi.fn();
  const analysis = { discover: vi.fn().mockResolvedValue(candidates), load, pending: vi.fn().mockResolvedValue(undefined), acknowledge: vi.fn().mockResolvedValue(undefined), page: vi.fn().mockResolvedValue(page), save, resolve, project, close } as unknown as AnalysisClient;
  vi.mocked(openRecordedSession).mockResolvedValue(partial);
  const onExit = vi.fn();
  const drafts: DraftSeen[] = [];
  const view = render(<StrategyRecordedWorkflow eventId="event" catalog={[]} catalogState="available" calendar={null} application={application} analysis={analysis} onExit={onExit} onCleanupError={vi.fn()} navigation={({ draft: d }) => { drafts.push({ step: d.step, mode: d.mode, sessions: d.sessions.length, combination: d.combination?.combinationId }); return null; }} t={key => key} />);
  return { ...view, execute, close, load, save, resolve, project, buildResponse, partial, current, drafts };
}
async function advanceToCombination() {
  fireEvent.click(screen.getByRole("button", { name: "strategy.entry.openTelemetry" }));
  await screen.findByRole("button", { name: "strategy.recorded.discover" });
}
async function discoverAndOpen() {
  fireEvent.click(screen.getByRole("button", { name: "strategy.recorded.discover" }));
  const sourceScreen = screen.getByTestId("strategy-recorded-source-screen");
  fireEvent.click(await within(sourceScreen).findByRole("button", { name: "strategy.entry.useSession" }));
  await within(sourceScreen).findByRole("button", { name: "strategy.recorded.inspect" });
  return sourceScreen;
}
async function inspectPartial() {
  const f = inspectionJourney();
  await advanceToCombination();
  const drawer = await discoverAndOpen();
  fireEvent.click(within(drawer).getByRole("button", { name: "strategy.recorded.inspect" }));
  await screen.findByRole("button", { name: "strategy.laps.advanced" });
  return f;
}
it("keeps the verified race context across tabs and opens the existing Plan", async () => {
  await inspectPartial();
  expect(screen.getByRole("complementary", { name: "strategy.entry.circuitAndSource" })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "strategy.data.tab.race" }));
  fireEvent.click(screen.getByRole("button", { name: "strategy.entry.openPlan" }));
  expect(screen.getByRole("tab", { name: "strategy.data.tab.plan" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("complementary", { name: "strategy.entry.circuitAndSource" })).toBeTruthy();
  expect(document.getElementById("recorded-panel-race")?.hidden).toBe(true);
});
it.each(["combination", "rules", "drivers"] as const)("opens %s directly when editing from the race desk", async step => {
  const f = await inspectPartial();
  fireEvent.click(screen.getByRole("tab", { name: "strategy.data.tab.race" }));
  fireEvent.click(screen.getByRole("button", { name: `strategy.workspace.edit ${step === "combination" ? "strategy.workspace.event" : `strategy.journey.step.${step}`}` }));
  expect(screen.getByRole("region", { name: "strategy.entry.preparation" })).toBeTruthy();
  if (step === "combination") expect(screen.getByRole("button", { name: /strategy.entry.changeCombination/, expanded: true })).toBeTruthy();
  else if (step === "rules") expect(screen.getByRole("spinbutton", { name: "strategy.journey.fuel.capacity" })).toBeTruthy();
  else expect(screen.getByRole("button", { name: /strategy.journey.driver.add/ })).toBeTruthy();
  expect(f.drafts.at(-1)?.step).toBe("start");
});
async function applyScalarSample() {
  fireEvent.click(screen.getByRole("button", { name: "strategy.laps.advanced" }));
  fireEvent.change(await screen.findByLabelText("strategy.data.channel"), { target: { value: "fuel" } });
  fireEvent.click(await screen.findByRole("button", { name: "strategy.data.sample 0" }));
  fireEvent.change(screen.getByLabelText("strategy.data.correctedValue"), { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText("strategy.data.reason"), { target: { value: "Checked observation" } });
  fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
}
describe("recorded inspection journey", () => {
  it("inspects a partial source, saves a scalar correction locally and returns to preparation", async () => {
    const f = inspectionJourney();
    expect(f.drafts[0]).toEqual({ step: "start", mode: "manual", sessions: 0, combination: undefined });
    await advanceToCombination();
    const drawer = await discoverAndOpen();
    expect((within(drawer).getByRole("button", { name: "strategy.recorded.apply" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(drawer).getByRole("button", { name: "strategy.recorded.inspect" }));
    await screen.findByRole("button", { name: "strategy.laps.advanced" });
    expect(screen.queryByTestId("strategy-recorded-source-screen")).toBeNull();
    expect(screen.getByRole("option", { name: "Imola_partial.duckdb" })).toBeTruthy();
    await applyScalarSample();
    fireEvent.change(screen.getByLabelText("strategy.data.revisionReason"), { target: { value: "Checked inspection" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.save" }));
    await screen.findByText("strategy.data.savedSeparately");
    expect(f.save).toHaveBeenCalledOnce();
    expect(f.project).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("strategy.recorded.metadataUnavailable")).toBeTruthy();
    expect(screen.getByText("strategy.recorded.notSelected")).toBeTruthy();
    expect((screen.getByRole("button", { name: "strategy.data.prepare" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "strategy.data.tab.revisions" }));
    expect(await screen.findByText("strategy.history.activeCorrections 1")).toBeTruthy();
    const history = document.getElementById("recorded-panel-revisions")!;
    expect(history.hidden).toBe(false);
    expect(within(history).getByText("strategy.workspace.notCalculated")).toBeTruthy();
    expect((screen.getByRole("button", { name: "strategy.history.reviewPinned" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "strategy.workspace.preparation" }));
    await screen.findByRole("heading", { name: "strategy.entry.yourRace" });
    expect(f.drafts.at(-1)).toEqual({ step: "start", mode: "manual", sessions: 0, combination: undefined });
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
  });
  it("blocks back and inspection on an uncertain command until resolve", async () => {
    const f = await inspectPartial();
    await applyScalarSample();
    f.save.mockRejectedValueOnce(new Error("confirmation lost"));
    fireEvent.change(screen.getByLabelText("strategy.data.revisionReason"), { target: { value: "Checked inspection" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.save" }));
    await screen.findByRole("button", { name: "strategy.data.resolve" });
    expect(f.save).toHaveBeenCalledOnce();
    expect((screen.getByRole("button", { name: "strategy.workspace.preparation" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "strategy.workspace.preparation" }));
    expect(screen.queryByRole("heading", { name: "strategy.entry.yourRace" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "strategy.data.tab.race" }));
    fireEvent.click(screen.getByRole("button", { name: "strategy.workspace.review" }));
    const drawer = screen.getByTestId("strategy-recorded-source-screen");
    expect(f.load).toHaveBeenCalledTimes(1);
    fireEvent.click(within(drawer).getByRole("button", { name: "strategy.recorded.inspect" }));
    expect(screen.getByTestId("strategy-recorded-source-screen")).toBeTruthy();
    expect(f.load).toHaveBeenCalledTimes(1);
    fireEvent.click(within(drawer).getByRole("button", { name: /strategy.journey.back/ }));
    expect(screen.queryByTestId("strategy-recorded-source-screen")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "strategy.data.tab.data" }));
    const request = f.save.mock.calls[0][0] as AnalysisSaveRequest;
    const response = f.buildResponse(request);
    f.resolve.mockResolvedValue({ found: true, headId: pb, revision: response.revision });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.resolve" }));
    await screen.findByText("strategy.data.savedSeparately");
    expect(f.save).toHaveBeenCalledOnce();
    expect(f.project).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "strategy.workspace.preparation" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "strategy.workspace.preparation" }));
    await screen.findByRole("heading", { name: "strategy.entry.yourRace" });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("blocks leaving the editor with an unresolved correction", async () => {
    const f = await inspectPartial();
    fireEvent.click(screen.getByRole("button", { name: "strategy.laps.advanced" }));
    fireEvent.change(await screen.findByLabelText("strategy.data.channel"), { target: { value: "fuel" } });
    fireEvent.click(await screen.findByRole("button", { name: "strategy.data.sample 0" }));
    fireEvent.change(screen.getByLabelText("strategy.data.correctedValue"), { target: { value: "0" } });
    expect((screen.getByRole("button", { name: "strategy.workspace.preparation" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("strategy.data.reason"), { target: { value: "Checked observation" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    expect((screen.getByRole("button", { name: "strategy.workspace.preparation" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "strategy.workspace.preparation" }));
    expect(screen.queryByRole("heading", { name: "strategy.entry.yourRace" })).toBeNull();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("keeps arrow, home and end navigation with back outside the tablist", async () => {
    await inspectPartial();
    const tablist = screen.getByRole("tablist");
    expect(within(tablist).queryByRole("button", { name: "strategy.workspace.preparation" })).toBeNull();
    expect(screen.getByRole("button", { name: "strategy.workspace.preparation" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "strategy.data.tab.race" }));
    const race = screen.getByRole("tab", { name: "strategy.data.tab.race" });
    fireEvent.keyDown(race, { key: "ArrowRight" });
    const data = screen.getByRole("tab", { name: "strategy.data.tab.data" });
    expect(data.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(data);
    fireEvent.keyDown(data, { key: "End" });
    const revisions = screen.getByRole("tab", { name: "strategy.data.tab.revisions" });
    expect(revisions.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(revisions);
    fireEvent.keyDown(revisions, { key: "Home" });
    expect(screen.getByRole("tab", { name: "strategy.data.tab.race" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "strategy.data.tab.race" }));
  });
  it("reports a failed inspection read as a visible error", async () => {
    const f = inspectionJourney();
    f.load.mockRejectedValueOnce(new Error("source unavailable"));
    await advanceToCombination();
    const drawer = await discoverAndOpen();
    fireEvent.click(within(drawer).getByRole("button", { name: "strategy.recorded.inspect" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("strategy.data.chooseSource")).toBeTruthy();
    expect(f.project).not.toHaveBeenCalled();
  });
});

function classificationJourney() {
  const base = parseAnalysisBase({ sessionId: "source", contentSha256: pa, sizeBytes: 10, parserId: "lmu-duckdb", parserVersion: "1", schemaFingerprint: "schema", analysisVersion: "analysis", segmentationDigest: pb });
  const channel = { id: "fuel", source_name: "Fuel level", unit: { symbol: "L", quality: "valid" as const }, sampling: { kind: "event_timestamped" as const, origin: "source_timestamp" as const }, columns: [{ name: "value", type: "number" as const }] };
  const opened = parseAnalysisOpenedSession({ sessionId: "handle", session: { schema_version: 1, id: "source", channels: [channel], metadata: [{ key: "SessionType", present: true, quality: "valid" as const, sensitive: false, value: "practice" }, { key: "WeatherConditions", present: true, quality: "valid" as const, sensitive: false, value: "Dry" }] } });
  const partial: RecordedSession = { editableChannelIds: ["fuel"], candidateId: "partial", opened, base, revision: { sessionId: "source", baseDigest: pc, revisionId: pa, snapshotId: pa }, projectionUnavailableReason: "metadata_unavailable" };
  const current = parseCorrectionStoreResult({ headId: pa, revision: { revisionId: pa, parentRevisionId: "", command: { expectedRevision: "", commandId: "", reason: "", localAuthorId: "" }, commandDigest: "", createdAt: "", snapshot: { contractVersion: "analysis.sample-snapshot.v1", base, snapshotId: pa, corrections: [] } } });
  const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>) => ({ protocolVersion: "strategy.application.v1" as const, commandId: command.commandId, repositoryVersion: 8, recoveredFromBackup: false, closed: false, ...("draft" in command ? { draft: structuredClone(command.draft) } : {}) }));
  const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(), dispose: vi.fn() };
  const close = vi.fn().mockResolvedValue(undefined);
  const candidates = parseAnalysisCandidates([{ id: "partial", displayName: "Imola_partial.duckdb", state: "ready", size: 1024, modifiedAt: "2026-09-09T12:00:00Z", walPresent: false }]);
  const project = vi.fn();
  const save = vi.fn(async (request: AnalysisSaveRequest) => {
    const response = { headId: pb, revision: { revisionId: pb, parentRevisionId: pa, command: request.command, commandDigest: pc, createdAt: "2026-09-10T00:00:00Z", snapshot: { contractVersion: "analysis.mixed-snapshot.v3", base, snapshotId: pb, corrections: [], familyUses: [], classifications: (request.classifications ?? []).map(item => ({ baseId: pa, correctionId: pc, request: item, original: item.expectedOriginal, corrected: item.replacement })) } } };
    expect(parseCorrectionStoreResult(response)).toBe(response);
    return response;
  });
  const load = vi.fn(async () => current);
  const analysis = { discover: vi.fn().mockResolvedValue(candidates), load, pending: vi.fn().mockResolvedValue(undefined), acknowledge: vi.fn().mockResolvedValue(undefined), save, resolve: vi.fn(), project, close } as unknown as AnalysisClient;
  vi.mocked(openRecordedSession).mockResolvedValue(partial);
  const onExit = vi.fn();
  const view = render(<StrategyRecordedWorkflow eventId="event" catalog={[]} catalogState="available" calendar={null} application={application} analysis={analysis} onExit={onExit} onCleanupError={vi.fn()} t={key => key} />);
  return { ...view, execute, close, load, save, project, partial, current };
}
describe("recorded classification view continuity (T12hc2)", () => {
  it("keeps the selected classification view with its confirmed value after a confirmed save", async () => {
    const f = classificationJourney();
    await advanceToCombination();
    const drawer = await discoverAndOpen();
    fireEvent.click(within(drawer).getByRole("button", { name: "strategy.recorded.inspect" }));
    await screen.findByRole("button", { name: "strategy.laps.advanced" });
    fireEvent.click(screen.getByRole("button", { name: "strategy.classification.tab" }));
    fireEvent.click(await screen.findByRole("button", { name: "strategy.classification.field.SessionType" }));
    fireEvent.change(screen.getByLabelText("strategy.data.correctedValue"), { target: { value: "race" } });
    fireEvent.change(screen.getByLabelText("strategy.data.reason"), { target: { value: "Stewards bulletin" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.apply" }));
    fireEvent.change(screen.getByLabelText("strategy.data.revisionReason"), { target: { value: "Stewards bulletin" } });
    fireEvent.click(screen.getByRole("button", { name: "strategy.data.save" }));
    await screen.findByText("strategy.data.savedSeparately");
    expect(f.save).toHaveBeenCalledOnce();
    expect(f.save.mock.calls[0][0].command.expectedRevision).toBe(pa);
    expect(f.save.mock.calls[0][0].classifications).toHaveLength(1);
    expect(screen.getByRole("button", { name: "strategy.classification.field.SessionType" })).toBeTruthy();
    const rows = screen.getAllByRole("row").map(row => within(row).queryAllByRole("cell").map(item => item.textContent)).filter(cells => cells.length > 0);
    expect(rows).toContainEqual(["strategy.classification.field.SessionType", "practice", "race", "strategy.data.unchanged"]);
    expect(f.project).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
});
