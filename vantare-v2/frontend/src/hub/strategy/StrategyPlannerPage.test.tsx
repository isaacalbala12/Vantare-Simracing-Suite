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
import type { StrategyPlanViolation, StrategyTyreClient } from "../../strategy/strategy-tyre-client";
import { createStrategyStore } from "../../strategy/strategy-store";
import type { StrategySolverClient, StrategyVariant } from "../../strategy/strategy-solver-client";
import type { StrategyPlanSummaryV1 } from "../../strategy/strategy-application-client";
import { StrategyPlannerPage } from "./StrategyPlannerPage";

configure({ asyncUtilTimeout: 3_000 });

/** Stand-ins for solver output, shaped exactly as the bridge returns it. */
function variant(overrides: Partial<StrategyVariant> & Pick<StrategyVariant, "kind">): StrategyVariant {
  return {
    stops: 3,
    stints: [{ laps: 20, greenSeconds: 2000, degradationSeconds: 19, totalSeconds: 2019 }],
    total: { optimisticSeconds: 21_800, expectedSeconds: 21_852, pessimisticSeconds: 21_904 },
    deltaToFastestSeconds: 0,
    marginLaps: 2,
    survivesPessimistic: true,
    risk: "low",
    dominated: false,
    reasons: [{ code: "time_optimal", message: "the quickest plan if every estimate holds" }],
    ...overrides,
  };
}

const TEST_VARIANTS: readonly StrategyVariant[] = [
  variant({ kind: "fast", marginLaps: 0, risk: "high", survivesPessimistic: false }),
  variant({ kind: "robust", stops: 4, deltaToFastestSeconds: 22.4, marginLaps: 3 }),
  variant({
    kind: "conservative", stops: 5, deltaToFastestSeconds: 44.8, marginLaps: 5,
    dominated: true, dominatedBy: "robust",
  }),
];

/** Library entries as the application service reports them. */
function summary(overrides: Partial<StrategyPlanSummaryV1> & Pick<StrategyPlanSummaryV1, "planId">): StrategyPlanSummaryV1 {
  return {
    variantId: "variant-1",
    name: "Plan",
    mode: "manual",
    updatedAt: "2026-08-01T10:00:00Z",
    hasDraft: true,
    revisionCount: 2,
    draftId: "draft-1",
    ...overrides,
  };
}

function createTestLibraryClient(plans: readonly StrategyPlanSummaryV1[] | Error) {
  return {
    async execute(command: { commandId: string }) {
      if (plans instanceof Error) throw plans;
      return {
        protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
        commandId: command.commandId,
        repositoryVersion: 3,
        plans,
        recoveredFromBackup: false,
        closed: false,
      };
    },
    cancel: () => false,
    dispose: () => {},
  } as never;
}

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
    // The opener stays disabled until the solver answers, so clicking earlier
    // would silently do nothing.
    await waitFor(() => expect(opener.hasAttribute("disabled")).toBe(false));
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

  it("renders the plan from the document and the solver's own variants", async () => {
    await renderPlanner({ demo: true, initialScreen: "workspace" });

    const stints = await screen.findAllByTestId(/^strategy-stint-/);
    expect(stints).toHaveLength(4);
    expect(stints.reduce((total, stint) => total + Number(stint.getAttribute("data-laps")), 0)).toBe(78);
    expect(within(stints[3]).getByText("v.59–78 · 20v")).toBeTruthy();
    expect(screen.getByTestId("strategy-fuel-save-per-lap").textContent).toBe("0.95 L/v");

    const option = await screen.findByTestId("strategy-option-fast");
    expect(definitionValue(option, "Pits")).toBe("3");
    expect(definitionValue(option, "Riesgo")).toBe("Alto");
    expect(screen.queryByTestId("strategy-candidates-empty")).toBeNull();
    expect(screen.getByRole("button", { name: "Comparar planes" }).hasAttribute("disabled")).toBe(false);
  });

  it("shows a time range rather than a single figure", async () => {
    await renderPlanner({ demo: true, initialScreen: "workspace" });

    // A lone number would claim a precision the estimates do not have.
    const total = await screen.findByTestId("strategy-total-fast");
    expect(total.textContent).toMatch(/\d+h \d{2}m \d{2}s – \d+h \d{2}m \d{2}s/);
  });

  it("marks a plan another already beats on both time and margin", async () => {
    await renderPlanner({ demo: true, initialScreen: "workspace" });

    expect(await screen.findByTestId("strategy-dominated-conservative")).toBeTruthy();
    expect(screen.queryByTestId("strategy-dominated-fast")).toBeNull();
  });

  it("says why the strategy panel is empty when the solver refuses", async () => {
    await renderPlanner({
      demo: true,
      initialScreen: "workspace",
      solverClient: {
        async compare() { throw new Error("No strategy finishes this race within the stated limits."); },
        dispose() {},
      },
    });

    const message = await screen.findByTestId("strategy-candidates-error");
    expect(message.textContent).toContain("No strategy finishes this race");
  });

  it("reports what the physical tyre domain rejected", async () => {
    await renderPlanner({
      demo: true,
      initialScreen: "workspace",
      tyreClient: createTestTyreClient([{
        code: "corner_locked",
        message: "tyre is permanently assigned to front_left",
        stintId: "stint-2",
        tyreId: "M-01",
        corner: "rear_right",
      }]),
    });

    const report = await screen.findByTestId("strategy-plan-violations");
    expect(report.textContent).toContain("M-01");
    expect(report.textContent).toContain("RR");
    expect(report.textContent).toContain("permanently assigned to front_left");
  });

  it("says nothing when the domain accepts the plan", async () => {
    await renderPlanner({ demo: true, initialScreen: "workspace" });
    await screen.findAllByTestId(/^strategy-stint-/);
    expect(screen.queryByTestId("strategy-plan-violations")).toBeNull();
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

  it("lists the plans the repository actually holds", async () => {
    await renderPlanner({
      libraryClient: createTestLibraryClient([
        summary({ planId: "spa-2026", name: "6h Spa · Hypercar" }),
        summary({ planId: "lemans-2026", name: "24h Le Mans · LMGT3", hasDraft: false, revisionCount: 1, draftId: undefined }),
      ]),
    });

    expect(await screen.findByTestId("strategy-plan-spa-2026-variant-1")).toBeTruthy();
    expect(screen.getByTestId("strategy-plan-lemans-2026-variant-1")).toBeTruthy();
    expect(screen.getByText("6h Spa · Hypercar")).toBeTruthy();
    // A plan with no open draft cannot be opened into the workspace.
    const lemans = screen.getByTestId("strategy-plan-lemans-2026-variant-1");
    expect(within(lemans).getByRole("button", { name: "Abrir workspace" }).hasAttribute("disabled")).toBe(true);
  });

  it("searches the library and says when nothing matches", async () => {
    await renderPlanner({
      libraryClient: createTestLibraryClient([
        summary({ planId: "spa-2026", name: "6h Spa · Hypercar" }),
        summary({ planId: "lemans-2026", name: "24h Le Máns · LMGT3" }),
      ]),
    });

    const search = await screen.findByLabelText("Buscar");
    fireEvent.change(search, { target: { value: "le mans" } });
    expect(screen.queryByTestId("strategy-plan-spa-2026-variant-1")).toBeNull();
    expect(screen.getByTestId("strategy-plan-lemans-2026-variant-1")).toBeTruthy();

    fireEvent.change(search, { target: { value: "monza" } });
    expect(screen.getByTestId("strategy-gallery-no-match")).toBeTruthy();
  });

  it("says the library is empty rather than inventing a plan", async () => {
    await renderPlanner({ libraryClient: createTestLibraryClient([]) });
    expect(await screen.findByText("Todavía no tienes planes guardados")).toBeTruthy();
    expect(screen.queryByTestId("strategy-gallery-grid")).toBeNull();
  });

  it("explains a library that failed to open and offers a retry", async () => {
    await renderPlanner({
      libraryClient: createTestLibraryClient(new Error("El repositorio local no está disponible.")),
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("El repositorio local no está disponible.");
    expect(within(alert).getByRole("button", { name: "Reintentar" })).toBeTruthy();
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

    // S-06 has never run, so it may be planned on a different corner later.
    fireEvent.click(screen.getByTestId("strategy-tyre-S-06"));
    fireEvent.click(screen.getByTestId("strategy-slot-stint-1-front_right"));
    expect(within(screen.getByTestId("strategy-slot-stint-1-front_right")).getByText("S-06")).toBeTruthy();
    fireEvent.click(screen.getByTestId("strategy-tyre-S-06"));
    fireEvent.click(screen.getByTestId("strategy-slot-stint-2-rear_right"));
    expect(within(screen.getByTestId("strategy-slot-stint-2-rear_right")).getByText("S-06")).toBeTruthy();

    // M-01 already ran on front left, so the domain refuses any other corner.
    fireEvent.click(screen.getByTestId("strategy-tyre-M-01"));
    fireEvent.click(screen.getByTestId("strategy-slot-stint-2-rear_left"));
    expect(screen.getByRole("alert").textContent).toContain("M-01 está ligado a FL");
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

/**
 * Stands in for the application service across the whole transfer flow: it
 * lists, exports and imports, and records every command so the tests can prove
 * what was and was not sent.
 */
function createTestTransferClient(options: {
  plans: readonly StrategyPlanSummaryV1[];
  importable?: boolean;
  failImportWith?: Error;
  seen: Array<StrategyApplicationCommandV1<StrategyEditorDocument>>;
}) {
  const importable = options.importable ?? true;
  const preview = {
    packageVersion: "strategy.package.v1",
    contractVersion: "strategy.v1",
    provenance: { application: "vantare", applicationVersion: "0.1.0.7", exportedAt: "2026-08-08T09:00:00Z" },
    checksum: "abc123",
    importable,
    entries: [{
      planId: "monza-2026",
      variantId: "variant-1",
      name: "6h Monza",
      mode: "manual",
      disposition: importable ? "new" : "conflict",
      hasDraft: true,
      revisionCount: 2,
      newRevisions: importable ? 2 : 0,
      conflictingRevisions: importable ? [] : ["revision-1"],
    }],
  };
  return {
    async execute(command: StrategyApplicationCommandV1<StrategyEditorDocument>) {
      options.seen.push(command);
      const base = {
        protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
        commandId: command.commandId,
        repositoryVersion: 3,
        recoveredFromBackup: false,
        closed: false,
      };
      if (command.operation === "export") {
        return { ...base, package: "eyJhIjoxfQ==" };
      }
      if (command.operation === "import") {
        const dryRun = "dryRun" in command && command.dryRun === true;
        if (!dryRun && options.failImportWith) throw options.failImportWith;
        return { ...base, preview, imported: !dryRun };
      }
      return { ...base, plans: options.plans };
    },
    cancel: () => false,
    dispose: () => {},
  } as never;
}

function packageFile(): File {
  return new File(['{"packageVersion":"strategy.package.v1"}'], "monza.vantareplan.json", {
    type: "application/json",
  });
}

/** Reads the import commands that actually asked to write. */
function writeCommands(seen: Array<StrategyApplicationCommandV1<StrategyEditorDocument>>) {
  return seen.filter(
    (command) => command.operation === "import" && !("dryRun" in command && command.dryRun === true),
  );
}

describe("Strategy Planner plan transfer", () => {
  it("exports a plan and hands the bytes to the user without sending them anywhere", async () => {
    const seen: Array<StrategyApplicationCommandV1<StrategyEditorDocument>> = [];
    const saved: Array<{ fileName: string; bytes: Uint8Array }> = [];
    await renderPlanner({
      libraryClient: createTestTransferClient({ plans: [summary({ planId: "spa-2026" })], seen }),
      appVersion: "0.1.0.8",
      onSavePackage: (fileName, bytes) => saved.push({ fileName, bytes }),
    });

    fireEvent.click(await screen.findByTestId("strategy-export-spa-2026-variant-1"));
    await waitFor(() => expect(saved).toHaveLength(1));

    expect(seen.find((command) => command.operation === "export")).toMatchObject({
      operation: "export",
      plans: [{ planId: "spa-2026", variantId: "variant-1" }],
      provenance: { application: "vantare", applicationVersion: "0.1.0.8" },
    });
    expect(saved[0].fileName).toContain("spa-2026");
    expect(saved[0].bytes.byteLength).toBeGreaterThan(0);
  });

  it("previews an imported package before writing anything", async () => {
    const seen: Array<StrategyApplicationCommandV1<StrategyEditorDocument>> = [];
    await renderPlanner({
      libraryClient: createTestTransferClient({ plans: [summary({ planId: "spa-2026" })], seen }),
    });

    fireEvent.change(await screen.findByLabelText("Importar plan"), { target: { files: [packageFile()] } });

    expect(await screen.findByTestId("strategy-import-preview")).toBeTruthy();
    expect(screen.getByTestId("strategy-import-summary").textContent).toBe("1 plan");
    expect(screen.getByTestId("strategy-import-entry-monza-2026-variant-1").textContent)
      .toContain("Nuevo · 2 revisiones");

    const imports = seen.filter((command) => command.operation === "import");
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({ dryRun: true });
    expect(writeCommands(seen)).toHaveLength(0);
  });

  it("only writes once the preview is confirmed, and against the version it showed", async () => {
    const seen: Array<StrategyApplicationCommandV1<StrategyEditorDocument>> = [];
    await renderPlanner({
      libraryClient: createTestTransferClient({ plans: [summary({ planId: "spa-2026" })], seen }),
    });

    fireEvent.change(await screen.findByLabelText("Importar plan"), { target: { files: [packageFile()] } });
    await screen.findByTestId("strategy-import-preview");
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));

    await waitFor(() => {
      const writes = writeCommands(seen);
      expect(writes).toHaveLength(1);
      expect(writes[0].expectedRepositoryVersion).toBe(3);
    });
  });

  it("refuses to offer an import that would collide with saved revisions", async () => {
    const seen: Array<StrategyApplicationCommandV1<StrategyEditorDocument>> = [];
    await renderPlanner({
      libraryClient: createTestTransferClient({
        plans: [summary({ planId: "spa-2026" })],
        importable: false,
        seen,
      }),
    });

    fireEvent.change(await screen.findByLabelText("Importar plan"), { target: { files: [packageFile()] } });
    await screen.findByTestId("strategy-import-preview");

    expect(screen.getByTestId("strategy-import-summary").textContent)
      .toBe("1 plan choca con lo que ya tienes guardado");
    const confirm = screen.getByRole("button", { name: "Importar" });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.click(confirm);
    expect(writeCommands(seen)).toHaveLength(0);
  });

  it("says the library is untouched when an import fails", async () => {
    const seen: Array<StrategyApplicationCommandV1<StrategyEditorDocument>> = [];
    await renderPlanner({
      libraryClient: createTestTransferClient({
        plans: [summary({ planId: "spa-2026" })],
        failImportWith: new StrategyApplicationError("import_refused", "", "El paquete fue rechazado."),
        seen,
      }),
    });

    fireEvent.change(await screen.findByLabelText("Importar plan"), { target: { files: [packageFile()] } });
    await screen.findByTestId("strategy-import-preview");
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));

    const failure = await screen.findByTestId("strategy-transfer-error");
    expect(failure.textContent).toContain("El paquete fue rechazado.");
    // The plan that was already there is still there.
    expect(screen.getByTestId("strategy-plan-spa-2026-variant-1")).toBeTruthy();
  });

  it("cancels a preview without writing", async () => {
    const seen: Array<StrategyApplicationCommandV1<StrategyEditorDocument>> = [];
    await renderPlanner({
      libraryClient: createTestTransferClient({ plans: [summary({ planId: "spa-2026" })], seen }),
    });

    fireEvent.change(await screen.findByLabelText("Importar plan"), { target: { files: [packageFile()] } });
    await screen.findByTestId("strategy-import-preview");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByTestId("strategy-import-preview")).toBeNull();
    expect(writeCommands(seen)).toHaveLength(0);
  });
});

type PlannerTestProps = Omit<React.ComponentProps<typeof StrategyPlannerPage>, "strategyStore">;

async function renderPlanner(props: PlannerTestProps) {
  const store = createTestStrategyStore();
  await store.create(createStrategyEditorDraft("2026-08-02T00:00:00Z"));
  return render(
    <StrategyPlannerPage
      tyreClient={createTestTyreClient()}
      solverClient={createTestSolverClient()}
      {...props}
      strategyStore={store}
      manualClient={createTestManualClient()}
    />,
  );
}

/** Stands in for the Go solver so the shell tests stay deterministic. */
function createTestSolverClient(variants: readonly StrategyVariant[] = TEST_VARIANTS): StrategySolverClient {
  return {
    async compare() { return { variants, maxStintLaps: 20, binding: "fuel", assumptions: [] }; },
    dispose() {},
  };
}

/** Stands in for the Go tyre domain so the shell tests stay deterministic. */
function createTestTyreClient(violations: readonly StrategyPlanViolation[] = []): StrategyTyreClient {
  return {
    async validate() { return { valid: violations.length === 0, violations }; },
    dispose() {},
  };
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
