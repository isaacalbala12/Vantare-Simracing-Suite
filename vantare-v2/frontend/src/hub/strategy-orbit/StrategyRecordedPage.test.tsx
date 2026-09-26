import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ToastProvider } from "../../ui/orbit";
import type { StrategyApplicationClient, StrategyApplicationCommandV1, StrategyApplicationResultV1 } from "../../strategy/strategy-application-client";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import { createRecordedWizardDraft } from "./strategy-recorded-wizard";
import { StrategyRecordedPage, STRATEGY_CONTEXT_SLOT_ID } from "./StrategyRecordedPage";

vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key: string) => key, locale: "es" }) }));
vi.mock("../orbit/use-calendar-starts", () => ({ useCalendarStarts: () => ({ calendar: null, starts: [] }) }));
vi.mock("./strategy-orbit-bridge", () => ({ createStrategyOrbitApplicationClient: vi.fn() }));
afterEach(() => { cleanup(); document.getElementById(STRATEGY_CONTEXT_SLOT_ID)?.remove(); });
const combination = { combinationId: "lmu:imola", simId: "lmu", trackName: "Imola", trackLayout: "GP", carName: "Car", carClass: "LMP2", sessionCount: 1, raceCount: 1, lastActivity: "2026-09-10T00:00:00Z", climateBuckets: [], sessions: [] };
const draft = { contractVersion: "strategy.v1" as const, draftId: "recorded-draft:existing", planId: "recorded-plan:existing", variantId: "recorded-main", name: "Saved Imola", mode: "manual" as const, updatedAt: "2026-09-10T00:00:00Z", capabilities: ["manual_inputs" as const], provenance: { kind: "manual" as const }, confidence: { level: "unknown" as const }, payload: { contractVersion: "strategy.recorded.draft.v1" as const, eventId: "existing", draft: { ...createRecordedWizardDraft(), combination, name: "Saved Imola" } } };
function setup(options?: { delayLibrary?: boolean; plans?: StrategyApplicationResultV1<RecordedDraftPayload>["plans"]; catalogFails?: boolean }) {
  let releaseLibrary = () => {};
  const libraryReady = options?.delayLibrary ? new Promise<void>(resolve => { releaseLibrary = resolve; }) : Promise.resolve();
  const execute = vi.fn(async (command: StrategyApplicationCommandV1<RecordedDraftPayload>): Promise<StrategyApplicationResultV1<RecordedDraftPayload>> => {
    const base = { protocolVersion: "strategy.application.v1" as const, commandId: command.commandId, repositoryVersion: 4, recoveredFromBackup: false, closed: false };
    switch (command.operation) {
      case "list": await libraryReady; return { ...base, plans: options?.plans ?? [{ planId: draft.planId, variantId: draft.variantId, draftId: draft.draftId, name: draft.name, mode: draft.mode, updatedAt: draft.updatedAt, hasDraft: true, revisionCount: 0 }] };
      case "list_session_combinations": if (options?.catalogFails) throw new Error("catalog unavailable"); return { ...base, sessionCatalogStatus: "available", sessionCombinations: [combination] };
      case "list_events": return { ...base, events: [] };
      case "open": if ("revision" in command && command.revision) return { ...base, revision: {
        contractVersion: "strategy.v1", hashAlgorithm: "sha256", sourceDraftId: draft.draftId, name: draft.name, mode: draft.mode,
        capabilities: [], provenance: { kind: "manual" }, confidence: { level: "unknown" }, createdAt: "2026-09-09T10:00:00Z",
        payload: { contractVersion: "strategy.orbit.revision.v1", calculatedPlan: { totalLaps: 71, total: 7420, stops: 2 } }, ...command.revision,
      } as never }; return { ...base, draft };
      case "create": return { ...base, draft: command.draft };
      default: throw new Error(`Unexpected native operation ${command.operation}`);
    }
  });
  const application: StrategyApplicationClient<RecordedDraftPayload> = { execute, cancel: vi.fn(), dispose: vi.fn() };
  const slot = document.createElement("div"); slot.id = STRATEGY_CONTEXT_SLOT_ID; document.body.append(slot);
  return { ...render(<ToastProvider><StrategyRecordedPage applicationClient={application} /></ToastProvider>), execute, slot, releaseLibrary };
}
it("opens manual preparation and saves a draft without invoking live or calculation commands", async () => {
  const { execute } = setup();
  const manual = (await screen.findAllByRole("button", { name: /strategy.entry.startManual/ }))[0];
  await waitFor(() => expect((manual as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(manual);
  expect(screen.queryByRole("combobox", { name: "strategy.journey.car" })).toBeNull();
  fireEvent.click((await screen.findAllByRole("button", { name: /strategy.entry.changeCombination/ }))[0]);
  const car = await screen.findByRole("combobox", { name: "strategy.journey.car" });
  await waitFor(() => expect((car as HTMLSelectElement).disabled).toBe(false));
  fireEvent.change(car, { target: { value: JSON.stringify([combination.carClass, combination.carName]) } });
  fireEvent.change(screen.getByRole("combobox", { name: "strategy.journey.track" }), { target: { value: combination.combinationId } });
  expect(screen.queryByRole("button", { name: "strategy.workspace.calculate" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /strategy.entry.openRace/ }));
  await screen.findByText("strategy.workspace.saved");
  expect(screen.getByRole("tab", { name: "strategy.data.tab.race" }).getAttribute("aria-selected")).toBe("true");
  expect(execute.mock.calls.map(([command]) => command.operation)).toEqual(expect.arrayContaining(["list", "list_session_combinations", "list_events", "create"]));
  const create = execute.mock.calls.map(([command]) => command).find(command => command.operation === "create");
  expect(create).toMatchObject({ expectedRepositoryVersion: 4, draft: { payload: { draft: { combination: { combinationId: combination.combinationId }, race: { format: "timed" }, drivers: [], sessions: [] } } } });
  expect(execute.mock.calls.some(([command]) => command.operation === "calculate_orbit")).toBe(false);
  expect(screen.queryByTestId("orbit-strategy-form")).toBeNull();
});
it("opens the saved library directly from an untouched entry menu", async () => {
  const { slot, execute } = setup();
  fireEvent.click(await within(slot).findByRole("button", { name: "strategy.home.saved" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  const open = await screen.findByRole("button", { name: "strategy.workspace.open" });
  await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(open);
  await screen.findByText("strategy.workspace.saved");
  expect(execute.mock.calls.filter(([command]) => command.operation === "open")).toHaveLength(1);
  expect(execute.mock.calls.some(([command]) => command.operation === "create")).toBe(false);
});

it("opens a saved draft directly from an untouched entry menu", async () => {
  const { execute } = setup();
  const open = await screen.findByRole("button", { name: "strategy.workspace.open" });
  fireEvent.click(open);
  await screen.findByText("strategy.workspace.saved");
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(execute.mock.calls.filter(([command]) => command.operation === "open")).toHaveLength(1);
});

it("opens a saved plan's history from the menu without reading a revision until chosen", async () => {
  const ref = { planId: "recorded-plan:history", variantId: "recorded-main", revisionId: "revision-a", contentHash: "a".repeat(64) };
  const { execute } = setup({ plans: [{ ...ref, name: "Historical Le Mans", mode: "manual", updatedAt: "2026-09-14T12:00:00Z", hasDraft: false, revisionCount: 1, revisionRefs: [ref], latestRevision: ref }] });
  fireEvent.click(await screen.findByRole("button", { name: "strategy.planHistory.open" }));
  expect(await screen.findByTestId("strategy-plan-history")).toBeTruthy();
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(screen.queryByRole("heading", { name: "strategy.home.saved" })).toBeNull();
  expect(execute.mock.calls.filter(([command]) => command.operation === "open")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "strategy.planHistory.choose" }));
  expect(await screen.findByText("2:03:40")).toBeTruthy();
  expect(execute.mock.calls.find(([command]) => command.operation === "open")?.[0]).toMatchObject({ revision: ref });
  fireEvent.click(screen.getByRole("button", { name: "strategy.planHistory.close" }));
  expect(await screen.findByRole("heading", { name: "strategy.home.saved" })).toBeTruthy();
  expect(screen.queryByTestId("strategy-plan-history")).toBeNull();
});
it("prevents a pending reopen from replacing a newly started preparation", async () => {
  const { slot, execute } = setup();
  fireEvent.click(await within(slot).findByRole("button", { name: "strategy.home.saved" }));
  const open = await screen.findByRole("button", { name: "strategy.workspace.open" });
  await waitFor(() => expect((open as HTMLButtonElement).disabled).toBe(false));
  execute.mockImplementationOnce(() => new Promise(() => {}));
  fireEvent.click(open);
  expect((within(slot).getByRole("button", { name: "strategy.home.new" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("strategy.journey.opening")).toBeTruthy();
});
it("keeps preparation editable but waits for the native repository version before offering to save", async () => {
  const { execute, releaseLibrary } = setup({ delayLibrary: true });
  const manual = (await screen.findAllByRole("button", { name: /strategy.entry.startManual/ }))[0];
  await waitFor(() => expect((manual as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(manual);
  fireEvent.click((await screen.findAllByRole("button", { name: /strategy.entry.changeCombination/ }))[0]);
  const car = await screen.findByRole("combobox", { name: "strategy.journey.car" });
  await waitFor(() => expect((car as HTMLSelectElement).disabled).toBe(false));
  fireEvent.change(car, { target: { value: JSON.stringify([combination.carClass, combination.carName]) } });
  fireEvent.change(screen.getByRole("combobox", { name: "strategy.journey.track" }), { target: { value: combination.combinationId } });
  const save = screen.getByRole("button", { name: /strategy.entry.openRace/ });
  expect((save as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("strategy.workspace.repositoryLoading")).toBeTruthy();
  fireEvent.click(save);
  expect(execute.mock.calls.some(([command]) => command.operation === "create")).toBe(false);
  await act(async () => { releaseLibrary(); });
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(save);
  await screen.findByText("strategy.workspace.saved");
});
it("offers saved history without a draft and only opens the explicitly chosen revision", async () => {
  const refA = { planId: "recorded-plan:history", variantId: "recorded-main", revisionId: "revision-a", contentHash: "a".repeat(64) };
  const refB = { ...refA, revisionId: "revision-b", contentHash: "b".repeat(64) };
  const { slot, execute } = setup({ catalogFails: true, plans: [{ ...refA, name: "Historical Le Mans", mode: "manual", updatedAt: "2026-09-14T12:00:00Z", hasDraft: false, revisionCount: 2, revisionRefs: [refA, refB], latestRevision: refB }] });
  fireEvent.click(await within(slot).findByRole("button", { name: "strategy.home.saved" }));
  expect(await screen.findByText("Historical Le Mans")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "strategy.planHistory.open" }));
  expect(execute.mock.calls.filter(([command]) => command.operation === "open")).toHaveLength(0);
  fireEvent.click(screen.getAllByRole("button", { name: "strategy.planHistory.choose" })[0]);
  expect(await screen.findByText("2:03:40")).toBeTruthy();
  expect(execute.mock.calls.find(([command]) => command.operation === "open")?.[0]).toMatchObject({ revision: refA });
});
