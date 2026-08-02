import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  STRATEGY_APPLICATION_PROTOCOL_V1,
  StrategyApplicationError,
  type StrategyApplicationClient,
  type StrategyApplicationCommandV1,
  type StrategyApplicationResultV1,
} from "../../strategy/strategy-application-client";
import type { PlanDraftV1 } from "../../strategy/strategy-contract-v1";
import type { StrategyEditorDocument } from "../../strategy/strategy-editor";
import { createStrategyEditorDraft, createStrategyEditorRuntime } from "../../strategy/strategy-editor-store";
import { effectiveLapRows } from "../../strategy/strategy-manual-input";
import type { StrategyManualClient, StrategyManualResult } from "../../strategy/strategy-manual-client";
import { createStrategyStore } from "../../strategy/strategy-store";
import { StrategyPlannerPage } from "./StrategyPlannerPage";

configure({ asyncUtilTimeout: 3_000 });

afterEach(cleanup);

describe("Strategy Planner shell", () => {
  it("exposes the complete gallery to workspace flow without claiming live data", async () => {
    await renderPlanner({ demo: true });

    expect(await screen.findByRole("heading", { name: "Mis planes" })).toBeTruthy();
    expect(screen.getByText("Datos de ejemplo · sin telemetría live")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Crear plan" }));
    expect(screen.getByRole("heading", { name: "Entrada de carrera" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Continuar a revisión/ }));
    expect(screen.getByRole("heading", { name: "Revisar datos" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Crear workspace/ }));
    expect(screen.getByRole("heading", { name: "Plan de carrera" })).toBeTruthy();
    expect(screen.getByTestId("strategy-column-plans")).toBeTruthy();
    expect(screen.getByTestId("strategy-column-stints")).toBeTruthy();
    expect(screen.getByTestId("strategy-column-inventory")).toBeTruthy();
  });

  it("traps comparison focus, isolates the background and restores the opener", async () => {
    await renderPlanner({ demo: true, initialScreen: "workspace" });

    const opener = await screen.findByRole("button", { name: "Comparar planes" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Comparar estrategias" })).toBeTruthy();
    const close = screen.getByRole("button", { name: "Cerrar comparación" });
    expect(document.activeElement).toBe(close);
    expect(document.querySelector(".strategy-planner__background")?.hasAttribute("inert")).toBe(true);
    expect(document.querySelector(".strategy-planner__background")?.getAttribute("aria-hidden")).toBe("true");

    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Comparar estrategias" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));

    fireEvent.click(screen.getByRole("button", { name: "＋ Stint" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar plan" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("guardado localmente"));
  });

  it("labels wide panels without referring to hidden responsive controls", async () => {
    await renderPlanner({ demo: true, initialScreen: "workspace" });

    expect(await screen.findByRole("complementary", { name: "Estrategias" })).toBeTruthy();
    expect(screen.getByRole("main", { name: "Stints" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Inventario" })).toBeTruthy();
    expect(document.querySelector("[role=tabpanel]")).toBeNull();
    expect(document.querySelector("[aria-labelledby^=strategy-tab]")).toBeNull();
  });

  it("renders a complete 78-lap plan and coherent metrics for every strategy", async () => {
    await renderPlanner({ demo: true, initialScreen: "workspace" });

    const stints = await screen.findAllByTestId(/^strategy-stint-/);
    expect(stints).toHaveLength(4);
    expect(stints.reduce((total, stint) => total + Number(stint.getAttribute("data-laps")), 0)).toBe(78);
    expect(within(stints[3]).getByText("v.59–78 · 20v")).toBeTruthy();

    const expectations = [
      { label: "A", compounds: ["M", "H", "H", "S"], usage: "1M · 2H · 1S", time: "6h 04m 12.0s", fuelSave: "+1.0 v/stint" },
      { label: "B", compounds: ["S", "M", "S", "S"], usage: "3S · 1M", time: "6h 04m 15.2s", fuelSave: "+3.0 v/stint" },
      { label: "C", compounds: ["H", "H", "H", "M"], usage: "3H · 1M", time: "6h 04m 17.9s", fuelSave: "0 v/stint" },
    ];

    for (const expected of expectations) {
      const option = screen.getByTestId(`strategy-option-${expected.label}`);
      const compounds = Array.from(option.querySelectorAll<HTMLElement>("[data-compound]"), (chip) => chip.dataset.compound);
      expect(compounds).toEqual(expected.compounds);
      expect(within(option).getByTestId("strategy-option-usage").textContent).toBe(expected.usage);
      expect(definitionValue(option, "Tiempo")).toBe(expected.time);
      expect(definitionValue(option, "Pits")).toBe("3");
      expect(definitionValue(option, "Ahorro")).toBe(expected.fuelSave);
    }
    expect(screen.getByTestId("strategy-fuel-save-per-lap").textContent).toBe("0.95 L/v");
  });

  it("supports keyboard navigation between compact workspace panels", async () => {
    await renderPlanner({ demo: true, initialScreen: "workspace" });

    const tab = await screen.findByRole("button", { name: "Stints" });
    tab.focus();
    fireEvent.keyDown(tab, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Inventario" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(screen.getByRole("button", { name: "Inventario" }), { key: "Home" });
    expect(screen.getByRole("button", { name: "Estrategias" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("returns from the workspace to the editable inputs", async () => {
    await renderPlanner({ demo: true, initialScreen: "workspace" });
    fireEvent.click(await screen.findByRole("button", { name: "Editar datos" }));
    expect(screen.getByRole("heading", { name: "Entrada de carrera" })).toBeTruthy();
  });

  it("renders explicit loading, empty and error gallery states", async () => {
    const store = createTestStrategyStore();
    const { rerender } = render(<StrategyPlannerPage strategyStore={store} demo galleryState="loading" />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Cargando planes"));

    rerender(<StrategyPlannerPage strategyStore={store} galleryState="empty" />);
    expect(screen.getByText("Todavía no tienes planes guardados")).toBeTruthy();

    rerender(<StrategyPlannerPage strategyStore={store} galleryState="error" />);
    expect(screen.getByRole("alert").textContent).toContain("No se pudo abrir la galería");
  });

  it("edits stint order and preserves undo and redo as one canonical history", async () => {
    await renderPlanner({ demo: true, initialScreen: "workspace" });
    await screen.findByTestId("strategy-stint-stint-4");

    fireEvent.click(screen.getByRole("button", { name: "＋ Stint" }));
    await waitFor(() => expect(screen.getAllByTestId(/^strategy-stint-/)).toHaveLength(5));
    fireEvent.click(screen.getByRole("button", { name: "Insertar antes del stint 2" }));
    await waitFor(() => expect(screen.getAllByTestId(/^strategy-stint-/)).toHaveLength(6));
    fireEvent.click(screen.getByRole("button", { name: "Duplicar stint 3" }));
    await waitFor(() => expect(screen.getAllByTestId(/^strategy-stint-/)).toHaveLength(7));
    fireEvent.click(screen.getByRole("button", { name: "Mover stint 4 arriba" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar stint 4" }));
    await waitFor(() => expect(screen.getAllByTestId(/^strategy-stint-/)).toHaveLength(6));
    expect(screen.getByText("Cambios sin guardar")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(screen.getAllByTestId(/^strategy-stint-/)).toHaveLength(7));
    fireEvent.click(screen.getByRole("button", { name: "Rehacer" }));
    await waitFor(() => expect(screen.getAllByTestId(/^strategy-stint-/)).toHaveLength(6));
  });

  it("assigns individual tyres by drag and keyboard, cancels cleanly and enforces corner identity", async () => {
    await renderPlanner({ demo: true, initialScreen: "workspace" });
    const tyre = await screen.findByTestId("strategy-tyre-S-05");
    const slot = screen.getByTestId("strategy-slot-stint-1-front_left");
    const transfer = createDataTransfer();

    fireEvent.dragStart(tyre, { dataTransfer: transfer });
    fireEvent.dragOver(slot, { dataTransfer: transfer });
    fireEvent.drop(slot, { dataTransfer: transfer });
    await waitFor(() => expect(within(slot).getByText("S-05")).toBeTruthy());
    expect(screen.getByText("Cambios sin guardar")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(within(slot).getByText("M-01")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Rehacer" }));
    expect(within(slot).getByText("S-05")).toBeTruthy();

    fireEvent.click(screen.getByTestId("strategy-tyre-S-06"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("Asignación cancelada. El plan no ha cambiado.")).toBeTruthy();
    expect(screen.getByTestId("strategy-tyre-S-06").getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByTestId("strategy-tyre-S-06"));
    fireEvent.click(screen.getByTestId("strategy-slot-stint-1-front_right"));
    expect(within(screen.getByTestId("strategy-slot-stint-1-front_right")).getByText("S-06")).toBeTruthy();
    fireEvent.click(screen.getByTestId("strategy-tyre-S-06"));
    fireEvent.click(screen.getByTestId("strategy-slot-stint-2-rear_right"));
    expect(screen.getByRole("alert").textContent).toContain("S-06 está ligado a FR");
  });

  it("survives React StrictMode without duplicate opening or a disposed runtime", async () => {
    const operations: string[] = [];
    let disposed = 0;
    const client = createTestStrategyClient((operation) => operations.push(operation));
    const runtimeFactory = () => {
      const runtime = createStrategyEditorRuntime(client);
      return { store: runtime.store, dispose: () => { disposed += 1; runtime.dispose(); } };
    };
    const view = render(
      <StrictMode>
        <StrategyPlannerPage demo initialScreen="workspace" runtimeFactory={runtimeFactory} />
      </StrictMode>,
    );

    await screen.findByTestId("strategy-stint-stint-1");
    expect(operations).toEqual(["open", "create"]);
    fireEvent.click(screen.getByRole("button", { name: "＋ Stint" }));
    await waitFor(() => expect(screen.getAllByTestId(/^strategy-stint-/)).toHaveLength(5));
    expect(disposed).toBe(0);

    view.unmount();
    await waitFor(() => expect(disposed).toBe(1));
  });

  it("sanitizes an opening failure and retries with a fresh request", async () => {
    const operations: string[] = [];
    let firstOpen = true;
    const baseClient = createTestStrategyClient((operation) => operations.push(operation));
    const client: StrategyApplicationClient<StrategyEditorDocument> = {
      ...baseClient,
      async execute(command) {
        if (firstOpen && command.operation === "open") {
          firstOpen = false;
          throw new Error("C:\\Users\\private\\strategy-repository.json could not be read");
        }
        return baseClient.execute(command);
      },
    };
    render(
      <StrategyPlannerPage
        demo
        initialScreen="workspace"
        runtimeFactory={() => createStrategyEditorRuntime(client)}
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo abrir el plan local");
    expect(alert.textContent).not.toContain("Users");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByTestId("strategy-stint-stint-1");
    expect(operations).toEqual(["open", "create"]);
  });

  it("applies quick corrections non-destructively and updates stint cards and fuel-save", async () => {
    await renderPlanner({ demo: true, initialScreen: "workspace" });

    const input = await screen.findByRole("spinbutton", { name: "Fuel por vuelta" });
    fireEvent.change(input, { target: { value: "4.6" } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByTestId("strategy-manual-original-fuelPerLapLitres").textContent).toContain("4.8"));
    expect(screen.getByText("Cambios sin guardar")).toBeTruthy();
    await waitFor(() => expect(within(screen.getByTestId("strategy-stint-stint-1")).getByText("78.2 L")).toBeTruthy());
    expect(screen.getByTestId("strategy-fuel-save-per-lap").textContent).toContain("0.75 L/v");

    fireEvent.click(screen.getByRole("button", { name: "Restaurar Fuel por vuelta" }));
    await waitFor(() => expect((screen.getByRole("spinbutton", { name: "Fuel por vuelta" }) as HTMLInputElement).value).toBe("4.8"));
    expect(screen.queryByTestId("strategy-manual-original-fuelPerLapLitres")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(within(screen.getByTestId("strategy-stint-stint-1")).getByText("78.2 L")).toBeTruthy());
    expect(screen.getByTestId("strategy-manual-original-fuelPerLapLitres")).toBeTruthy();
  });

  it("neutralizes the previous calculation while a revised draft is recalculating", async () => {
    const store = createTestStrategyStore();
    await store.create(createStrategyEditorDraft("2026-08-02T00:00:00Z"));
    let calls = 0;
    let resolveRevision: ((result: StrategyManualResult) => void) | undefined;
    const client: StrategyManualClient = {
      calculate(document) {
        calls += 1;
        if (calls === 1) return Promise.resolve(calculateTestManualResult(document));
        return new Promise((resolve) => { resolveRevision = resolve; });
      },
      dispose() {},
    };
    render(<StrategyPlannerPage demo initialScreen="workspace" strategyStore={store} manualClient={client} />);
    await waitFor(() => expect(screen.getByTestId("strategy-fuel-save-per-lap").textContent).toBe("0.95 L/v"));
    expect(screen.queryByText("−18.4s")).toBeNull();

    const input = screen.getByRole("spinbutton", { name: "Fuel por vuelta" });
    fireEvent.change(input, { target: { value: "4.6" } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByTestId("strategy-fuel-save-per-lap").textContent).toBe("—"));
    expect(screen.getByText("Calculando")).toBeTruthy();

    const revised = store.getSnapshot().draft;
    if (!revised || !resolveRevision) throw new Error("manual recalculation did not start");
    resolveRevision(calculateTestManualResult(revised.payload as StrategyEditorDocument));
    await waitFor(() => expect(screen.getByTestId("strategy-fuel-save-per-lap").textContent).toBe("0.75 L/v"));
  });

  it("edits a per-lap correction, clears it and includes manual pit extras", async () => {
    await renderPlanner({ demo: true, initialScreen: "workspace" });

    fireEvent.click(await screen.findByRole("button", { name: "Tabla por vuelta" }));
    const lapFuel = screen.getByRole("spinbutton", { name: "Fuel vuelta 2" });
    fireEvent.change(lapFuel, { target: { value: "5.1" } });
    fireEvent.blur(lapFuel);
    await waitFor(() => expect(screen.getByTestId("strategy-lap-source-2-fuelPerLapLitres").textContent).toContain("Corregido"));
    expect(screen.getByTestId("strategy-lap-source-2-fuelPerLapLitres").textContent).toContain("4.8");

    fireEvent.click(screen.getByRole("button", { name: "Restaurar Fuel de la vuelta 2" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Restaurar Fuel de la vuelta 2" })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Entrada rápida" }));
    const penalty = screen.getByRole("spinbutton", { name: "Penalización" });
    fireEvent.change(penalty, { target: { value: "10" } });
    fireEvent.blur(penalty);
    await waitFor(() => expect(screen.getByTestId("strategy-total-pit-time").textContent).toContain("77.2"));
    expect(screen.getAllByText(/PIT STOP · 22.4s/).length).toBeGreaterThan(0);
  }, 15_000);

  it("rejects impossible manual ranges without dirtying the document", async () => {
    await renderPlanner({ demo: true, initialScreen: "workspace" });
    const start = await screen.findByRole("spinbutton", { name: "Fuel inicial" });
    fireEvent.change(start, { target: { value: "110" } });
    fireEvent.blur(start);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("starting Fuel"));
    expect((start as HTMLInputElement).value).toBe("100");
    expect((screen.getByRole("button", { name: "Guardar plan" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

type PlannerTestProps = Omit<React.ComponentProps<typeof StrategyPlannerPage>, "strategyStore">;

async function renderPlanner(props: PlannerTestProps) {
  const store = createTestStrategyStore();
  await store.create(createStrategyEditorDraft("2026-08-02T00:00:00Z"));
  return render(<StrategyPlannerPage {...props} strategyStore={store} manualClient={createTestManualClient()} />);
}

function createTestManualClient(): StrategyManualClient {
  return {
    async calculate(document) { return calculateTestManualResult(document); },
    dispose() {},
  };
}

function calculateTestManualResult(document: StrategyEditorDocument): StrategyManualResult {
  const rows = effectiveLapRows(document);
  const totals = rows.reduce((result, row) => ({
    fuel: result.fuel + row.fuelPerLapLitres.value,
    energy: result.energy + row.virtualEnergyPerLapPercent.value,
    pace: result.pace + row.averageLapSeconds.value,
    wear: result.wear + row.tyreWearPerLapPercent.value,
  }), { fuel: 0, energy: 0, pace: 0, wear: 0 });
  const quick = document.manualInputs.quick;
  const fuelStart = quick.fuelStartLitres.correction?.value ?? quick.fuelStartLitres.original;
  const fuelUsable = quick.fuelUsableLitres.correction?.value ?? quick.fuelUsableLitres.original;
  const fuelStops = Math.max(0, Math.ceil(Math.max(totals.fuel - fuelStart, 0) / fuelUsable));
  const fuelAmount = fuelStops > 0 ? Math.max(totals.fuel - (fuelStart + fuelUsable * (fuelStops - 1)), 0) : 0;
  const energyStart = quick.virtualEnergyStartPercent.correction?.value ?? quick.virtualEnergyStartPercent.original;
  const energyUsable = quick.virtualEnergyUsablePercent.correction?.value ?? quick.virtualEnergyUsablePercent.original;
  const energyStops = Math.max(0, Math.ceil(Math.max(totals.energy - energyStart, 0) / energyUsable));
  const energyAmount = energyStops > 0 ? Math.max(totals.energy - (energyStart + energyUsable * (energyStops - 1)), 0) : 0;
  const pitLossPerStop = quick.pitLossPerStopSeconds.correction?.value ?? quick.pitLossPerStopSeconds.original;
  const pitStopCount = Math.max(0, document.stints.length - 1);
  const totalPitLoss = pitLossPerStop * pitStopCount;
  const repair = quick.repairSeconds.correction?.value ?? quick.repairSeconds.original;
  const penalty = quick.penaltySeconds.correction?.value ?? quick.penaltySeconds.original;
  const pit = totalPitLoss + repair + penalty;
  let offset = 0;
  const stints = document.stints.map((stint) => {
    const slice = rows.slice(offset, offset + stint.lapCount);
    offset += stint.lapCount;
    return {
      lapCount: stint.lapCount,
      fuelNeed: slice.reduce((sum, row) => sum + row.fuelPerLapLitres.value, 0),
      virtualEnergyNeed: slice.reduce((sum, row) => sum + row.virtualEnergyPerLapPercent.value, 0),
      averageLapSeconds: slice.reduce((sum, row) => sum + row.averageLapSeconds.value, 0) / stint.lapCount,
      tyreWearPercent: slice.reduce((sum, row) => sum + row.tyreWearPerLapPercent.value, 0),
      fuelSavingAmount: fuelAmount / rows.length * stint.lapCount,
      virtualEnergySavingAmount: energyAmount / rows.length * stint.lapCount,
    };
  });
  const resource = (total: number, stops: number, amount: number) => ({
    used: total > 0, raceNeed: total, formationNeed: 0, reserveAmount: 0, totalNeed: total,
    startAmount: 100, additionalRequired: Math.max(total - 100, 0), usableCapacity: 100,
    availableCompetitiveLaps: 0, stopsRequired: stops,
    saving: { available: stops > 0, feasible: amount > 0, targetStops: Math.max(0, stops - 1), amount, perLap: amount / rows.length, percentOfConsumption: 0 },
  });
  return {
    fuel: resource(totals.fuel, fuelStops, fuelAmount),
    virtualEnergy: resource(totals.energy, energyStops, energyAmount),
    pitStopCount, pitLossPerStopSeconds: pitLossPerStop, totalPitLossSeconds: totalPitLoss,
    repairSeconds: repair, penaltySeconds: penalty, totalPitSeconds: pit,
    averageLapSeconds: totals.pace / rows.length,
    averageTyreWearPercent: totals.wear / rows.length,
    stints,
  };
}

function createTestStrategyStore() {
  let id = 0;
  return createStrategyStore(createTestStrategyClient(), { id: () => `test-${++id}` });
}

function createTestStrategyClient(onOperation?: (operation: string) => void) {
  let persisted: PlanDraftV1<StrategyEditorDocument> | undefined;
  let repositoryVersion = 0;
  const client: StrategyApplicationClient<StrategyEditorDocument> = {
    async execute(command) {
      onOperation?.(command.operation);
      if (command.operation === "open" || command.operation === "restore") {
        if (!persisted) throw new StrategyApplicationError("draft_not_found", "draftId", "missing draft");
        return result(command, persisted, repositoryVersion);
      }
      if (command.operation === "create") {
        persisted = structuredClone(command.draft);
        repositoryVersion += 1;
        return result(command, persisted, repositoryVersion);
      }
      if (command.operation === "save_revision") {
        persisted = structuredClone(command.draft);
        persisted.baseRevision = {
          planId: persisted.planId,
          variantId: persisted.variantId,
          revisionId: command.revisionId,
          contentHash: "a".repeat(64),
        };
        repositoryVersion += 1;
        return result(command, persisted, repositoryVersion);
      }
      return result(command, persisted ?? commandDraft(command), repositoryVersion);
    },
    cancel: () => false,
    dispose: () => undefined,
  };
  return client;
}

function createDataTransfer(): DataTransfer {
  const values = new Map<string, string>();
  return {
    dropEffect: "none",
    effectAllowed: "all",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: (format?: string) => format ? values.delete(format) : values.clear(),
    getData: (format: string) => values.get(format) ?? "",
    setData: (format: string, value: string) => { values.set(format, value); },
    setDragImage: () => undefined,
  };
}

function result(
  command: StrategyApplicationCommandV1<StrategyEditorDocument>,
  draft: PlanDraftV1<StrategyEditorDocument>,
  repositoryVersion: number,
): StrategyApplicationResultV1<StrategyEditorDocument> {
  return {
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId: command.commandId,
    repositoryVersion,
    draft: structuredClone(draft),
    savedDraft: structuredClone(draft),
    recoveredFromBackup: false,
    closed: false,
  };
}

function commandDraft(command: StrategyApplicationCommandV1<StrategyEditorDocument>) {
  if ("draft" in command) return command.draft;
  if ("sourceDraft" in command) return command.sourceDraft;
  throw new Error("test command does not contain a draft");
}

function definitionValue(container: HTMLElement, term: string) {
  const dt = within(container).getByText(term, { selector: "dt" });
  return dt.parentElement?.querySelector("dd")?.textContent ?? "";
}
