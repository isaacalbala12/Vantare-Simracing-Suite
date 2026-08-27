import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { ToastProvider } from "../../ui/orbit/Toast";
import { StrategyOrbitPage, STRATEGY_CONTEXT_SLOT_ID } from "./StrategyOrbitPage";
import type { Calendar, RaceSeries } from "../../calendar/calendar-types";
import type { StrategyRoster } from "./strategy-orbit-bridge";
import { createStrategyEditorRuntime } from "../../strategy/strategy-editor-store";
import type {
  StrategyApplicationCommandV1,
  StrategyApplicationClient,
  StrategyApplicationResultV1,
  StrategyEventV2,
  StrategyPlanningInputsV2,
  StrategySessionCombinationV1,
} from "../../strategy/strategy-application-client";
import { StrategyApplicationError } from "../../strategy/strategy-application-client";
import {
  createDefaultStrategyEditorDocument,
  type StrategyEditorDocument,
} from "../../strategy/strategy-editor";
import { createStrategyEditorDraft } from "../../strategy/strategy-editor-store";
import { createOrbitCalculationTestClient } from "./strategy-orbit-calculation.test-support";
import type { PlanDraftV1, RevisionRefV1 } from "../../strategy/strategy-contract-v1";
import type { StrategyOrbitRevisionPayloadV1 } from "./strategy-orbit-lifecycle";

vi.mock("@wailsio/runtime", () => ({
  Events: { Emit: vi.fn(), On: () => () => undefined },
}));

/** Salidas del calendario real que ve la pantalla; cada prueba pone las suyas. */
const starts: unknown[] = [];
/** Calendario completo (los especiales viven en `events`); mutable por prueba. */
const calendarRef: { current: unknown } = { current: null };

vi.mock("../orbit/use-calendar-starts", () => ({
  useCalendarStarts: () => ({ calendar: calendarRef.current, starts, target: null }),
}));

const SPA_START = {
  seriesId: "gt3-sprint",
  name: "GT3 Sprint Series",
  track: "Spa-Francorchamps",
  tier: "advanced",
  licenseLabel: "",
  note: "",
  intervalMin: 30,
  vehicleClass: "GT3",
  durationMin: 45,
  at: new Date("2030-01-01T14:00:00Z"),
  followed: true,
};

const WEEKLY_START = {
  seriesId: "weekly-endurance",
  name: "LMU Weekly Endurance",
  track: "Le Mans",
  tier: "weekly",
  licenseLabel: "",
  note: "Cada semana",
  intervalMin: 10080,
  vehicleClass: "LMP2",
  durationMin: 90,
  at: new Date("2030-01-05T18:00:00Z"),
  followed: false,
};

/** Cliente en memoria del editor real: mismos comandos, sin backend. */
function memoryRuntime() {
  const draft = createStrategyEditorDraft();
  let persisted = { ...draft, payload: createDefaultStrategyEditorDocument() };
  let repositoryVersion = 1;
  const client = {
    async execute(command: StrategyApplicationCommandV1<StrategyEditorDocument>) {
      if (command.operation === "save_revision") {
        persisted = structuredClone(command.draft);
        repositoryVersion += 1;
      }
      const result: StrategyApplicationResultV1<StrategyEditorDocument> = {
        protocolVersion: "strategy.application.v1",
        commandId: command.commandId,
        repositoryVersion,
        draft: structuredClone(persisted),
        savedDraft: structuredClone(persisted),
        recoveredFromBackup: false,
        closed: command.operation === "close",
      };
      return result;
    },
    cancel: () => false,
    dispose: () => undefined,
  };
  return createStrategyEditorRuntime(client);
}

const ROSTER: StrategyRoster = {
  event: {
    startMin: 14 * 60,
    durationMin: 240,
    tankL: 90,
    pitS: 64,
    name: "4 Horas de Imola",
    subtitle: "ELMS · Imola",
    monogram: "4H",
    vehicleClass: "LMGT3",
    team: "Vantare Racing · #58",
    dayLabel: "Sáb 12",
  },
  drivers: [
    { id: "isaac", name: "Isaac Albalá", ini: "IA", color: "#ff6a5f", cls: "Gold SR", dry: [104, 2.75], wet: [112, 2.4], eco: [105.1, 2.55] },
    { id: "sol", name: "Sol Martín", ini: "SM", color: "#78d68b", cls: "Gold SR", dry: [104.6, 2.72], wet: [113, 2.38], eco: [105.7, 2.52] },
    { id: "diego", name: "Diego Ferrer", ini: "DF", color: "#5ccbd5", cls: "Silver SR", dry: [105.3, 2.8], wet: [114.2, 2.44], eco: [106.4, 2.58] },
  ],
  strategies: [
    { id: "s1", name: "Estrategia #1", note: "Mínimo tiempo", mode: "dry", order: ["isaac", "sol", "diego"] },
  ],
};

function mount(
  roster: StrategyRoster | null = ROSTER,
  applicationClient: StrategyApplicationClient<unknown> = createOrbitCalculationTestClient(),
  runtimeFactory: () => ReturnType<typeof memoryRuntime> = memoryRuntime,
) {
  const slot = document.createElement("div");
  slot.id = STRATEGY_CONTEXT_SLOT_ID;
  document.body.append(slot);
  return render(
    <I18nProvider>
      <ToastProvider>
        <StrategyOrbitPage
          applicationClient={applicationClient}
          roster={roster}
          runtimeFactory={runtimeFactory}
        />
      </ToastProvider>
    </I18nProvider>,
  );
}

async function mounted() {
  mount();
  await screen.findByTestId("orbit-stint-0");
}

function lifecycleClient() {
  const calculation = createOrbitCalculationTestClient();
  const seen: StrategyApplicationCommandV1<unknown>[] = [];
  let version = 0;
  let draft: PlanDraftV1<StrategyOrbitRevisionPayloadV1> | undefined;
  let revision: RevisionRefV1 | undefined;
  let activePlan: StrategyApplicationResultV1<unknown>["activePlan"];
  const client: StrategyApplicationClient<unknown> = {
    async execute(command) {
      seen.push(command);
      if (command.operation === "calculate_orbit") return calculation.execute(command);
      const base = {
        protocolVersion: "strategy.application.v1" as const,
        commandId: command.commandId,
        repositoryVersion: version,
        recoveredFromBackup: false,
        closed: false,
      };
      if (command.operation === "list") {
        return {
          ...base,
          activePlan,
          plans: draft ? [{
            planId: draft.planId,
            variantId: draft.variantId,
            draftId: draft.draftId,
            name: draft.name,
            mode: draft.mode,
            updatedAt: draft.updatedAt,
            hasDraft: true,
            revisionCount: revision ? 1 : 0,
            ...(revision ? { latestRevision: revision, latestRevisionAt: draft.updatedAt } : {}),
          }] : [],
        };
      }
      if (command.operation === "create") {
        draft = structuredClone(command.draft) as PlanDraftV1<StrategyOrbitRevisionPayloadV1>;
        version += 1;
        return { ...base, repositoryVersion: version, draft, savedDraft: draft };
      }
      if (command.operation === "open") {
        if (!draft) throw new StrategyApplicationError("draft_not_found", "draftId", "missing");
        return { ...base, draft, savedDraft: draft };
      }
      if (command.operation === "save_revision") {
        revision = {
          planId: command.draft.planId,
          variantId: command.draft.variantId,
          revisionId: command.revisionId,
          contentHash: "b".repeat(64),
        };
        draft = { ...command.draft, baseRevision: revision } as PlanDraftV1<StrategyOrbitRevisionPayloadV1>;
        version += 1;
        return {
          ...base,
          repositoryVersion: version,
          draft,
          savedDraft: draft,
          revision: {
            contractVersion: "strategy.v1",
            hashAlgorithm: "sha256:strategy-c14n-v1",
            revisionId: revision.revisionId,
            sourceDraftId: draft.draftId,
            planId: revision.planId,
            variantId: revision.variantId,
            name: draft.name,
            mode: draft.mode,
            capabilities: draft.capabilities,
            provenance: draft.provenance,
            confidence: draft.confidence,
            createdAt: command.createdAt,
            payload: draft.payload,
            contentHash: revision.contentHash,
          } as never,
        };
      }
      if (command.operation === "activate") {
        activePlan = {
          contractVersion: "strategy.v1",
          activationId: command.activationId,
          revision: command.revision,
          activatedAt: command.activatedAt,
        };
        version += 1;
        return { ...base, repositoryVersion: version, activePlan };
      }
      if (command.operation === "export") {
        return { ...base, package: btoa("exact revision") };
      }
      throw new Error(`unexpected ${command.operation}`);
    },
    cancel: () => false,
    dispose: () => undefined,
  };
  return { client, seen };
}

function failingOpenRuntime() {
  const client: StrategyApplicationClient<StrategyEditorDocument> = {
    execute: async () => { throw new StrategyApplicationError("stale_command", "draftId", "bridge caído"); },
    cancel: () => false,
    dispose: () => undefined,
  };
  return createStrategyEditorRuntime(client);
}

/**
 * Recorre el asistente de creación (ISA-377) hasta el punto de partida, que es
 * donde viven los dos caminos de siempre.
 */
async function openWizard(team: "solo" | "team" = "team") {
  fireEvent.click(await screen.findByTestId("orbit-strategy-new-strategy"));
  fireEvent.click(await screen.findByTestId("orbit-strategy-wizard-manual"));
  fireEvent.click(await screen.findByTestId(`orbit-strategy-wizard-${team}`));
  await screen.findByTestId("orbit-strategy-paths");
}

const USABLE_SESSION_COMBINATION: StrategySessionCombinationV1 = {
  combinationId: "lmu:spa:united-21",
  simId: "lmu",
  trackName: "Circuit de Spa-Francorchamps",
  trackLayout: "GP",
  carName: "United Autosports #21:ELMS25",
  carClass: "LMP2_ELMS",
  sessionCount: 5,
  raceCount: 2,
  lastActivity: "2026-08-23T12:00:00Z",
  climateBuckets: [{ bucket: "dry", laps: 27 }],
  sessions: [{
    sessionId: "spa-race-1",
    type: "race",
    status: "identified_usable",
    defaultIncluded: true,
    lastActivity: "2026-08-23T12:00:00Z",
    climateBuckets: [{ bucket: "dry", laps: 27 }],
  }],
};

const LMGT3_SESSION_COMBINATION: StrategySessionCombinationV1 = {
  ...USABLE_SESSION_COMBINATION,
  combinationId: "lmu:spa:lmgt3-46",
  carName: "BMW M4 LMGT3 #46",
  carClass: "GT3",
  sessions: [{
    ...USABLE_SESSION_COMBINATION.sessions[0],
    sessionId: "spa-lmgt3-race-1",
  }],
};

const SPA_ENDURANCE_SESSION_COMBINATION: StrategySessionCombinationV1 = {
  ...USABLE_SESSION_COMBINATION,
  combinationId: "lmu:spa-endurance:united-22",
  trackLayout: "Circuit de Spa-Francorchamps Endurance",
  carName: "United Autosports #22:ELMS25",
  sessionCount: 2,
  sessions: [{
    ...USABLE_SESSION_COMBINATION.sessions[0],
    sessionId: "spa-endurance-race-1",
  }],
};

function raceSeries(overrides: Partial<RaceSeries> = {}): RaceSeries {
  return {
    id: "spa-endurance",
    name: "Spa Endurance",
    tier: "advanced",
    licenseLabel: "Gold",
    track: "Spa (WEC)",
    telemetryTrackName: USABLE_SESSION_COMBINATION.trackName,
    vehicleClass: "LMP2",
    classes: [{
      name: "LMP2",
      qualifier: "full fuel tank",
      telemetryClassName: "LMP2_ELMS",
    }],
    setup: "fixed",
    durationMin: 120,
    raceDurationMin: 120,
    splits: 2,
    assists: "",
    tyreWarmers: true,
    tyres: 12,
    veLimit: 75,
    recurrence: { kind: "weekly", days: ["sat"], timesUTC: ["14:00"] },
    ...overrides,
  };
}

function loadedCalendar(series: readonly RaceSeries[]): Calendar {
  return {
    version: 1,
    timezone: "Europe/Madrid",
    reminderMinutes: [],
    events: [],
    series: [...series],
    seriesPreviews: series.map((item) => ({
      seriesId: item.id,
      scheduleLabel: "",
      nextStarts: ["2030-01-01T14:00:00Z"],
    })),
    updated: "2026-08-23T12:00:00Z",
  };
}

function startOf(series: RaceSeries) {
  return {
    ...SPA_START,
    seriesId: series.id,
    name: series.name,
    track: series.track,
    vehicleClass: series.vehicleClass,
    durationMin: series.raceDurationMin ?? series.durationMin,
  };
}

const WIZARD_DERIVED_PLANNING: StrategyPlanningInputsV2 = {
  projection: {
    contractVersion: "strategyinputprojection.v2",
    generatedAt: "2026-08-23T12:00:00.000Z",
    computationVersion: "producer.v1",
    sourceSessions: ["spa-race-1"],
    combinationId: USABLE_SESSION_COMBINATION.combinationId,
    fuelConsumption: { presence: "valid", provenance: { kind: "derived", sourceId: "aggregate:lmu:spa" }, confidence: { sampleSize: 27, rangeLower: 2.6, rangeUpper: 2.9, computationVersion: "producer.v1" }, meanPerLap: 2.75, rangeLower: 2.6, rangeUpper: 2.9, byClimateBucket: { dry: 2.75 } },
    virtualEnergyConsumption: { presence: "missing", provenance: { kind: "derived" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" }, reason: "missing_virtual_energy_consumption", meanPerLap: 0, rangeLower: 0, rangeUpper: 0 },
    combinedStintPaceCurve: { presence: "missing", provenance: { kind: "derived" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" }, reason: "missing_combined_stint_pace_curve", identifiability: "combined_only", points: [] },
    tyreDegradation: { presence: "missing", provenance: { kind: "derived" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" }, reason: "missing_tyre_degradation" },
    pit: { presence: "missing", provenance: { kind: "derived" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" } },
    savingCost: { presence: "missing", provenance: { kind: "derived" }, confidence: { sampleSize: 0, computationVersion: "producer.v1" }, reason: "missing_saving_cost" },
  },
  overrides: {},
};

function wizardCatalogClient(
  catalog: "error" | "no_sessions" | readonly StrategySessionCombinationV1[],
): StrategyApplicationClient<unknown> {
  const calculation = createOrbitCalculationTestClient();
  let saved: StrategyEventV2 | undefined;
  let repositoryVersion = 0;
  return {
    async execute(command) {
      const base = {
        protocolVersion: "strategy.application.v1" as const,
        commandId: command.commandId,
        repositoryVersion,
        recoveredFromBackup: false,
        closed: false,
      };
      if (command.operation === "get_cold_start_status") {
        return { ...base, coldStartStatus: { shouldShow: false, checking: false, found: 0, imported: 0, skipped: 0, failures: [], decision: "pending" } };
      }
      if (command.operation === "list_session_combinations") {
        if (catalog === "error") throw new Error("catalog transport unavailable");
        if (catalog === "no_sessions") return { ...base, sessionCatalogStatus: "no_authorized_telemetry", sessionCombinations: [] };
        return { ...base, sessionCatalogStatus: "available", sessionCombinations: catalog };
      }
      if (command.operation === "list_events") return { ...base, events: saved ? [saved] : [] };
      if (command.operation === "create_event" || command.operation === "edit_event") {
        saved = command.event;
        repositoryVersion += 1;
        return {
          ...base,
          repositoryVersion,
          strategyDocument: {
            contractVersion: "strategy.v2",
            schemaVersion: "2.0.0",
            generatedAt: command.updatedAt,
            events: [saved],
          },
        };
      }
      if (command.operation === "get_event_planning_inputs") {
        return { ...base, planningInputStatus: "available", planningInputs: WIZARD_DERIVED_PLANNING };
      }
      if (command.operation === "calculate_orbit" || command.operation === "list") {
        return calculation.execute(command);
      }
      throw new Error(`unexpected ${command.operation}`);
    },
    cancel: () => false,
    dispose: () => undefined,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  starts.length = 0;
  calendarRef.current = null;
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("StrategyOrbitPage · Resumen", () => {
  it("muestra loading y después el error tipado del motor sin cifras de fallback", async () => {
    let rejectCalculation: (error: Error) => void = () => undefined;
    const client: StrategyApplicationClient<unknown> = {
      execute: () => new Promise((_resolve, reject) => { rejectCalculation = reject; }),
      cancel: () => false,
      dispose: () => undefined,
    };
    mount(ROSTER, client);
    expect(await screen.findByTestId("orbit-strategy-calculation-loading")).toBeTruthy();
    expect(screen.queryByTestId("orbit-stint-0")).toBeNull();

    rejectCalculation(new StrategyApplicationError(
      "calculation_invalid",
      "input.variants.0.order.1",
      "The Strategy calculation input is invalid.",
    ));
    const error = await screen.findByTestId("orbit-strategy-calculation-error");
    expect(error.textContent).toContain("The Strategy calculation input is invalid.");
    expect(error.textContent).toContain("calculation_invalid · input.variants.0.order.1");
    expect(screen.queryByTestId("orbit-stint-0")).toBeNull();
  });

  it("entra directa a la última estrategia con cabecera de evento y stints", async () => {
    await mounted();

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("4 Horas de Imola");
    expect(screen.getByTestId("orbit-strategy-name").textContent).toBe("Estrategia #1");
    expect(screen.getAllByText("Al día").length).toBeGreaterThan(0);
    // 240 min a ~104.6 s ⇒ 138 vueltas en 5 stints (`13.5`).
    expect(screen.getAllByTestId(/^orbit-stint-\d+$/)).toHaveLength(5);
    expect(screen.getByTestId("orbit-pit-0")).toBeTruthy();
  });

  it("cambiar el piloto de un stint recalcula el plan y marca Borrador", async () => {
    await mounted();

    const hourOf = (index: number) =>
      within(screen.getByTestId(`orbit-stint-${index}`)).getAllByText(/–/)[0].textContent;
    const before = hourOf(2);
    // El `Select` del kit es un combobox propio: se abre y se elige la opción.
    fireEvent.click(screen.getByRole("combobox", { name: "Piloto del stint 2" }));
    fireEvent.click(screen.getByRole("option", { name: "Diego Ferrer" }));

    await waitFor(() => expect(screen.getAllByText("Borrador").length).toBeGreaterThan(0));
    expect(screen.getByRole("combobox", { name: "Piloto del stint 2" }).textContent).toContain(
      "Diego Ferrer",
    );
    // El ritmo de Diego es más lento: las horas de los stints siguientes se mueven.
    expect(hourOf(2)).not.toBe(before);
  });

  it("un override de vueltas fija el stint y redistribuye el resto", async () => {
    await mounted();

    const laps = () =>
      screen
        .getAllByTestId(/^orbit-stint-\d+$/)
        .map((card) => Number(card.getAttribute("data-laps")));
    const original = laps();

    fireEvent.click(screen.getByTestId("orbit-stint-edit-0"));
    const input = await screen.findByLabelText("Vueltas");
    fireEvent.blur(input, { target: { value: "20" } });

    await waitFor(() => expect(laps()[0]).toBe(20));
    expect(screen.getByTestId("orbit-stint-manual-0")).toBeTruthy();
    const next = laps();
    expect(next.reduce((sum, value) => sum + value, 0)).toBe(
      original.reduce((sum, value) => sum + value, 0),
    );
    expect(next[1]).toBeGreaterThan(original[1]);
  });

  it("Restablecer devuelve el estado a Al día", async () => {
    await mounted();

    fireEvent.click(screen.getByRole("combobox", { name: "Piloto del stint 2" }));
    fireEvent.click(screen.getByRole("option", { name: "Diego Ferrer" }));
    await waitFor(() => expect(screen.getAllByText("Borrador").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByTestId("orbit-strategy-reset"));
    await waitFor(() => expect(screen.getAllByText("Al día").length).toBeGreaterThan(0));
    expect(screen.getByRole("combobox", { name: "Piloto del stint 2" }).textContent).toContain(
      "Sol Martín",
    );
  });
});

describe("StrategyOrbitPage · neumáticos", () => {
  it("la pestaña Neumáticos oculta la de Pilotos", async () => {
    await mounted();

    expect(screen.getByTestId("orbit-strategy-drivers")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Neumáticos" }));

    await screen.findByTestId("orbit-strategy-tyres");
    expect(screen.queryByTestId("orbit-strategy-drivers")).toBeNull();
  });

  it("F2-f: inventario vacío honesto — sin Spa sintético, muestra estado vacío (no fabrica asignación)", async () => {
    await mounted();

    fireEvent.click(screen.getByRole("button", { name: "Neumáticos" }));
    const tyres = await screen.findByTestId("orbit-strategy-tyres");
    // El inventario global Spa fue retirado: donde el evento no tiene inventario
    // per-event (documento v2), se muestra vacío honesto con copy claro.
    expect(tyres.textContent).toContain("Sin inventario");
    expect(screen.queryByTestId("orbit-tyre-item-S-05")).toBeNull();

    // Incluso intentando asignar, no se fabrica inventario sintético.
    fireEvent.click(screen.getByTestId("orbit-stint-edit-0"));
    const fr = await screen.findByTestId("orbit-corner-slot-FR");
    fireEvent.keyDown(fr, { key: "Enter" });
    expect(fr.getAttribute("data-state")).not.toBe("filled");
  });

  it("F2-f: arrastrar sin inventario no fabrica montaje", async () => {
    await mounted();

    fireEvent.click(screen.getByTestId("orbit-stint-edit-0"));
    const rl = await screen.findByTestId("orbit-corner-slot-RL");
    fireEvent.drop(rl, {
      dataTransfer: { getData: () => "S-06", types: ["text/plain"] },
    });

    // Sin inventario per-event no hay neumático que montar: permanece vacío
    expect(rl.getAttribute("data-state")).not.toBe("filled");
    expect(rl.textContent).not.toContain("S-06");
  });
});

describe("StrategyOrbitPage · ⚙ Ajustes", () => {
  it("el menú abre con el botón y cierra con Esc", async () => {
    await mounted();

    const trigger = screen.getByTestId("orbit-strategy-settings");
    expect(trigger.textContent).toContain("Ajustes");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu", { name: "Ajustes del evento" });
    expect(within(menu).getByText("Exportar plan")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("StrategyOrbitPage · Estrategias", () => {

  it("Guardar confirma la revisión visible y Activar usa exactamente esa identidad", async () => {
    const backend = lifecycleClient();
    mount(ROSTER, backend.client);
    await screen.findByTestId("orbit-stint-0");

    const save = await screen.findByTestId("orbit-strategy-save-revision");
    await waitFor(() => expect(save.hasAttribute("disabled")).toBe(false));
    fireEvent.click(save);

    const saved = await screen.findByTestId("orbit-strategy-revision-status");
    expect(saved.textContent).toContain("orbit-revision-");
    const saveCommand = backend.seen.find((command) => command.operation === "save_revision");
    expect(saveCommand).toMatchObject({ operation: "save_revision" });

    const activate = screen.getByTestId("orbit-strategy-activate-revision");
    fireEvent.click(activate);
    await waitFor(() => expect(saved.textContent).toContain("Activa"));
    const activation = backend.seen.find((command) => command.operation === "activate");
    const savedCommand = saveCommand as Extract<StrategyApplicationCommandV1<unknown>, { operation: "save_revision" }>;
    expect(activation).toMatchObject({
      operation: "activate",
      revision: {
        planId: savedCommand.draft.planId,
        variantId: savedCommand.draft.variantId,
        revisionId: savedCommand.revisionId,
        contentHash: "b".repeat(64),
      },
    });

    fireEvent.click(screen.getByTestId("orbit-strategy-settings"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Exportar plan/ }));
    await waitFor(() => expect(backend.seen.some((command) => command.operation === "export")).toBe(true));
    const exported = backend.seen.find((command) => command.operation === "export");
    expect(exported).toMatchObject({
      operation: "export",
      plans: [{
        planId: savedCommand.draft.planId,
        variantId: savedCommand.draft.variantId,
        revision: {
          revisionId: savedCommand.revisionId,
          contentHash: "b".repeat(64),
        },
      }],
    });
  });

  it("muestra código y campo cuando Guardar falla", async () => {
    const backend = lifecycleClient();
    const failing: StrategyApplicationClient<unknown> = {
      ...backend.client,
      async execute(command) {
        if (command.operation === "save_revision") {
          throw new StrategyApplicationError(
            "stale_command",
            "expectedRepositoryVersion",
            "El documento cambió",
          );
        }
        return backend.client.execute(command);
      },
    };
    mount(ROSTER, failing);
    const save = await screen.findByTestId("orbit-strategy-save-revision");
    await waitFor(() => expect(save.hasAttribute("disabled")).toBe(false));
    fireEvent.click(save);

    const error = await screen.findByTestId("orbit-strategy-lifecycle-error");
    expect(error.textContent).toContain("El documento cambió");
    expect(error.textContent).toContain("stale_command");
    expect(error.textContent).toContain("expectedRepositoryVersion");
  });

  it("muestra el fallo tipado al abrir el borrador canónico", async () => {
    mount(ROSTER, createOrbitCalculationTestClient(), failingOpenRuntime);
    const error = await screen.findByTestId("orbit-strategy-editor-open-error");
    expect(error.textContent).toContain("bridge caído");
    expect(error.textContent).toContain("stale_command");
    expect(error.textContent).toContain("draftId");
  });
  async function strategiesTab() {
    await mounted();
    fireEvent.click(screen.getByRole("tab", { name: "Estrategias" }));
    return screen.findByTestId("orbit-strategy-strategies");
  }

  it("con una sola estrategia no hay nada que comparar", async () => {
    await strategiesTab();

    expect(screen.getByTestId("orbit-strat-s1")).toBeTruthy();
    expect(screen.getByTestId("orbit-strategy-verdict").textContent).toContain(
      "no hay nada que comparar",
    );
  });

  it("duplicar crea un borrador y el veredicto compara vueltas", async () => {
    await strategiesTab();

    fireEvent.click(screen.getByTestId("orbit-strat-duplicate-s1"));
    const copy = await screen.findByTestId("orbit-strat-local-1");
    expect(copy.textContent).toContain("Estrategia #1 (copia)");
    expect(within(copy).getByText("Borrador")).toBeTruthy();

    // Mismo modo y mismo orden: empatan en vueltas y nadie ahorra paradas.
    const verdict = screen.getByTestId("orbit-strategy-verdict").textContent ?? "";
    expect(verdict).toContain("completa");
    expect(verdict).toContain("vueltas frente a");
    expect(verdict).toContain("empate");
    expect(verdict).toContain("dobla turno");
  });

  it("Seleccionar cambia la estrategia visible sin fingir que está activa", async () => {
    await strategiesTab();

    fireEvent.click(screen.getByTestId("orbit-strat-duplicate-s1"));
    fireEvent.click(await screen.findByTestId("orbit-strat-select-local-1"));

    await waitFor(() =>
      expect(screen.getByTestId("orbit-strategy-name").textContent).toBe("Estrategia #1 (copia)"),
    );
    expect(screen.getByTestId("orbit-strat-local-1").getAttribute("data-active")).toBeNull();
    expect(screen.getByTestId("orbit-strat-s1").getAttribute("data-active")).toBeNull();
    // La seleccionada no se llama activa; la anterior ofrece Seleccionar.
    expect(screen.getByTestId("orbit-strat-select-s1")).toBeTruthy();
  });

  it("«+ Nueva estrategia» la crea y la deja seleccionada, no activa", async () => {
    await strategiesTab();

    fireEvent.click(screen.getByTestId("orbit-strategy-new-card"));

    await waitFor(() =>
      expect(screen.getByTestId("orbit-strategy-name").textContent).toBe("Estrategia #2"),
    );
    expect(screen.getByTestId("orbit-strat-local-1").getAttribute("data-active")).toBeNull();
  });
});

describe("StrategyOrbitPage · Disponibilidad", () => {
  it("añade un tramo y recorta el que solapaba", async () => {
    await mounted();
    fireEvent.click(screen.getByRole("tab", { name: "Disponibilidad de pilotos" }));
    await screen.findByTestId("orbit-strategy-availability");

    // Cada piloto entra con un único tramo disponible de 13:00 a 18:30.
    expect(screen.getAllByTestId("orbit-availability-cell")).toHaveLength(3);

    fireEvent.click(screen.getByRole("combobox", { name: "Estado" }));
    fireEvent.click(screen.getByRole("option", { name: "No disponible" }));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "15:00" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "16:00" } });
    fireEvent.submit(screen.getByTestId("orbit-availability-form"));

    // El tramo interior parte el de Isaac en tres (`13.5`).
    await waitFor(() => expect(screen.getAllByTestId("orbit-availability-cell")).toHaveLength(5));
    expect(
      screen.getByLabelText("Isaac Albalá · 15:00–16:00 · no disponible"),
    ).toBeTruthy();
  });

  it("una hora final anterior a la inicial no cambia el tablero", async () => {
    await mounted();
    fireEvent.click(screen.getByRole("tab", { name: "Disponibilidad de pilotos" }));
    await screen.findByTestId("orbit-strategy-availability");

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "16:00" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "15:00" } });
    fireEvent.submit(screen.getByTestId("orbit-availability-form"));

    expect(await screen.findByText("Tramo no válido")).toBeTruthy();
    expect(screen.getAllByTestId("orbit-availability-cell")).toHaveLength(3);
  });
});

describe("StrategyOrbitPage · estado inicial", () => {
  it("sin nada guardado el menú ofrece crear y lo dice, no una lista muerta", async () => {
    mount(null);

    const home = await screen.findByTestId("orbit-strategy-home");
    expect(home.textContent).toContain("Nueva estrategia");
    // Nunca se abrió nada: no hay tarjeta de «Continuar».
    expect(screen.queryByTestId("orbit-strategy-continue")).toBeNull();
    expect((await screen.findByTestId("orbit-strategy-saved")).textContent).toContain(
      "Aún no hay nada guardado",
    );
    expect(screen.queryByTestId("orbit-strategy-overview")).toBeNull();
    // El asistente todavía no está abierto.
    expect(screen.queryByTestId("orbit-strategy-wizard")).toBeNull();
  });

  it("lista una carrera monoclase y salta directamente al coche con telemetría", async () => {
    const series = raceSeries();
    calendarRef.current = loadedCalendar([series]);
    starts.push(startOf(series));
    mount(null, wizardCatalogClient([USABLE_SESSION_COMBINATION]));

    const calendar = await screen.findByTestId("orbit-strategy-calendar");
    expect(calendar.textContent).toContain("Spa (WEC)");
    expect(calendar.textContent).toContain("LMP2 (full fuel tank)");
    expect(calendar.textContent).toContain("120 min");
    expect(calendar.textContent).toContain("12 neumáticos");
    expect(calendar.textContent).toContain("VE 75 %");
    expect(calendar.textContent).toContain("Setup fijo");

    fireEvent.click(within(calendar).getByTestId(`orbit-strategy-calendar-race-${series.id}`));
    const cars = await screen.findByTestId("orbit-strategy-calendar-cars");
    expect(screen.queryByTestId("orbit-strategy-calendar-classes")).toBeNull();
    expect(cars.textContent).toContain(USABLE_SESSION_COMBINATION.carName);
    fireEvent.click(within(cars).getByTestId(`orbit-strategy-calendar-car-${USABLE_SESSION_COMBINATION.combinationId}`));

    await screen.findByTestId("orbit-strategy-overview");
    fireEvent.click(screen.getByRole("button", { name: "Datos" }));
    const fuel = await screen.findByTestId("orbit-planning-input-fuel_per_lap_liters");
    expect(within(fuel).getByLabelText(/Derivado: Calculado con 27 muestras/)).toBeTruthy();
  });

  it("cuando la sede tiene varios trazados pide elegir uno y muestra sus sesiones", async () => {
    const series = raceSeries();
    calendarRef.current = loadedCalendar([series]);
    starts.push(startOf(series));
    mount(null, wizardCatalogClient([
      USABLE_SESSION_COMBINATION,
      SPA_ENDURANCE_SESSION_COMBINATION,
    ]));

    fireEvent.click(within(await screen.findByTestId("orbit-strategy-calendar"))
      .getByTestId(`orbit-strategy-calendar-race-${series.id}`));

    const layouts = await screen.findByTestId("orbit-strategy-calendar-layouts");
    expect(layouts.textContent).toContain("Circuit de Spa-Francorchamps");
    expect(layouts.textContent).toContain("5 sesiones");
    expect(layouts.textContent).toContain("Circuit de Spa-Francorchamps Endurance");
    expect(layouts.textContent).toContain("2 sesiones");
    expect(screen.queryByTestId("orbit-strategy-calendar-cars")).toBeNull();

    fireEvent.click(within(layouts).getByTestId(
      `orbit-strategy-calendar-layout-${SPA_ENDURANCE_SESSION_COMBINATION.trackLayout}`,
    ));
    const cars = await screen.findByTestId("orbit-strategy-calendar-cars");
    expect(cars.textContent).toContain(SPA_ENDURANCE_SESSION_COMBINATION.carName);
    expect(cars.textContent).not.toContain(USABLE_SESSION_COMBINATION.carName);
  });

  it("en una carrera multiclase pide primero clase y después ofrece solo sus coches con datos", async () => {
    const series = raceSeries({
      vehicleClass: "LMP2 / LMGT3",
      classes: [
        { name: "LMP2", qualifier: "full fuel tank", telemetryClassName: "LMP2_ELMS" },
        { name: "LMGT3", qualifier: "75% VE", telemetryClassName: "GT3" },
      ],
    });
    calendarRef.current = loadedCalendar([series]);
    starts.push(startOf(series));
    mount(null, wizardCatalogClient([USABLE_SESSION_COMBINATION, LMGT3_SESSION_COMBINATION]));

    fireEvent.click(within(await screen.findByTestId("orbit-strategy-calendar"))
      .getByTestId(`orbit-strategy-calendar-race-${series.id}`));
    const classes = await screen.findByTestId("orbit-strategy-calendar-classes");
    expect(screen.queryByTestId("orbit-strategy-calendar-cars")).toBeNull();
    fireEvent.click(within(classes).getByTestId("orbit-strategy-calendar-class-LMGT3"));

    const cars = await screen.findByTestId("orbit-strategy-calendar-cars");
    expect(cars.textContent).toContain(LMGT3_SESSION_COMBINATION.carName);
    expect(cars.textContent).not.toContain(USABLE_SESSION_COMBINATION.carName);
  });

  it("explica que no hay sesiones grabadas para el circuito y la clase y ofrece la vía manual", async () => {
    const series = raceSeries({ track: "Fuji (WEC)", telemetryTrackName: "Fuji Speedway" });
    calendarRef.current = loadedCalendar([series]);
    starts.push(startOf(series));
    mount(null, wizardCatalogClient([USABLE_SESSION_COMBINATION]));

    fireEvent.click(within(await screen.findByTestId("orbit-strategy-calendar"))
      .getByTestId(`orbit-strategy-calendar-race-${series.id}`));

    const cars = await screen.findByTestId("orbit-strategy-calendar-cars");
    expect(cars.textContent).toContain("No tienes sesiones grabadas en este circuito con esta clase");
    expect(within(cars).getByTestId("orbit-strategy-calendar-manual")).toBeTruthy();
    expect(within(cars).queryByTestId(/orbit-strategy-calendar-car-/)).toBeNull();
  });

  it("nombra la sede o la clase del calendario que no tienen correspondencia declarada", async () => {
    const unknownVenue = raceSeries({
      id: "unknown-venue",
      track: "Nueva sede (WEC)",
      telemetryTrackName: undefined,
    });
    calendarRef.current = loadedCalendar([unknownVenue]);
    starts.push(startOf(unknownVenue));
    const view = mount(null, wizardCatalogClient([USABLE_SESSION_COMBINATION]));

    fireEvent.click(within(await screen.findByTestId("orbit-strategy-calendar"))
      .getByTestId("orbit-strategy-calendar-race-unknown-venue"));
    expect((await screen.findByTestId("orbit-strategy-calendar-identity-error")).textContent)
      .toContain("El calendario llama a este circuito «Nueva sede (WEC)» y no hay correspondencia declarada");

    view.unmount();
    cleanup();
    document.body.replaceChildren();
    const unknownClass = raceSeries({
      id: "unknown-class",
      classes: [{ name: "LMH" }],
    });
    calendarRef.current = loadedCalendar([unknownClass]);
    starts.length = 0;
    starts.push(startOf(unknownClass));
    mount(null, wizardCatalogClient([USABLE_SESSION_COMBINATION]));

    fireEvent.click(within(await screen.findByTestId("orbit-strategy-calendar"))
      .getByTestId("orbit-strategy-calendar-race-unknown-class"));
    expect((await screen.findByTestId("orbit-strategy-calendar-identity-error")).textContent)
      .toContain("El calendario llama a esta clase «LMH» y no hay correspondencia declarada");
  });

  it("explica en el bloque inferior que el calendario no está disponible", async () => {
    calendarRef.current = null;
    mount(null, wizardCatalogClient([USABLE_SESSION_COMBINATION]));

    expect((await screen.findByTestId("orbit-strategy-calendar")).textContent).toContain(
      "El calendario de Le Mans Ultimate no está disponible",
    );
  });

  it("la vía automática disponible abre las carreras y no una lista abstracta de combinaciones", async () => {
    const series = raceSeries();
    calendarRef.current = loadedCalendar([series]);
    starts.push(startOf(series));
    mount(null, wizardCatalogClient([USABLE_SESSION_COMBINATION]));
    fireEvent.click(await screen.findByTestId("orbit-strategy-new-strategy"));

    const wizard = await screen.findByTestId("orbit-strategy-wizard");
    expect(wizard.textContent).toContain("paso 1 de 3");
    // Todavía no se puede elegir punto de partida: falta contestar.
    expect(screen.queryByTestId("orbit-strategy-paths")).toBeNull();

    const auto = screen.getByTestId("orbit-strategy-wizard-auto-action");
    await waitFor(() => expect(auto.hasAttribute("disabled")).toBe(false));
    expect(screen.getByTestId("orbit-strategy-wizard-auto-reason").textContent).toContain(
      "1 combinación",
    );

    fireEvent.click(auto);
    expect(await screen.findByTestId("orbit-strategy-calendar")).toBeTruthy();
    expect(screen.queryByTestId("orbit-strategy-session-picker")).toBeNull();
  });

  it("deshabilita la automática porque todavía no hay sesiones importadas", async () => {
    mount(null, wizardCatalogClient("no_sessions"));
    fireEvent.click(await screen.findByTestId("orbit-strategy-new-strategy"));

    const auto = await screen.findByTestId("orbit-strategy-wizard-auto-action");
    await waitFor(() => expect(auto.hasAttribute("disabled")).toBe(true));
    expect(screen.getByTestId("orbit-strategy-wizard-auto-reason").textContent).toContain(
      "No hay sesiones importadas",
    );
  });

  it("deshabilita la automática porque el catálogo de sesiones no está disponible", async () => {
    mount(null, wizardCatalogClient("error"));
    fireEvent.click(await screen.findByTestId("orbit-strategy-new-strategy"));

    const auto = await screen.findByTestId("orbit-strategy-wizard-auto-action");
    await waitFor(() => expect(auto.hasAttribute("disabled")).toBe(true));
    expect(screen.getByTestId("orbit-strategy-wizard-auto-reason").textContent).toContain(
      "El catálogo de sesiones no está disponible",
    );
  });

  it("deshabilita la automática cuando ninguna combinación tiene vueltas clasificadas por clima", async () => {
    mount(null, wizardCatalogClient([{ ...USABLE_SESSION_COMBINATION, climateBuckets: [] }]));
    fireEvent.click(await screen.findByTestId("orbit-strategy-new-strategy"));

    const auto = await screen.findByTestId("orbit-strategy-wizard-auto-action");
    await waitFor(() => expect(auto.hasAttribute("disabled")).toBe(true));
    expect(screen.getByTestId("orbit-strategy-wizard-auto-reason").textContent).toContain(
      "Ninguna combinación tiene vueltas clasificadas por clima",
    );
  });

  it("«Solo» crea un evento de un piloto y quita la disponibilidad del tablero", async () => {
    mount(null);
    await openWizard("solo");
    fireEvent.click(screen.getByTestId("orbit-strategy-path-own"));

    const form = await screen.findByTestId("orbit-strategy-form");
    // Con un solo piloto no se pueden añadir compañeros, y se dice por qué.
    const add = within(form).getByTestId("orbit-strategy-form-add-driver");
    expect(add.hasAttribute("disabled")).toBe(true);
    expect(add.getAttribute("data-tip")).toContain("solitario");

    fireEvent.change(within(form).getByLabelText("Nombre del evento"), {
      target: { value: "Enduro en solitario" },
    });
    fireEvent.click(within(form).getByTestId("orbit-strategy-form-submit"));

    await screen.findByTestId("orbit-strategy-overview");
    expect(screen.queryByRole("tab", { name: "Disponibilidad de pilotos" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Estrategias" })).toBeTruthy();
  });

  it("«Crear mi estrategia» crea el evento propio y entra en el Resumen", async () => {
    mount(null);
    await openWizard();
    fireEvent.click(screen.getByTestId("orbit-strategy-path-own"));

    const form = await screen.findByTestId("orbit-strategy-form");
    fireEvent.change(within(form).getByLabelText("Nombre del evento"), {
      target: { value: "Enduro de casa" },
    });
    fireEvent.change(within(form).getByLabelText("Circuito"), { target: { value: "Motorland" } });
    fireEvent.change(within(form).getByLabelText("Duración en minutos"), {
      target: { value: "120" },
    });
    fireEvent.click(within(form).getByTestId("orbit-strategy-form-add-driver"));
    fireEvent.change(within(form).getByLabelText("Nombre del piloto 2"), {
      target: { value: "Sol Martín" },
    });
    fireEvent.click(within(form).getByTestId("orbit-strategy-form-submit"));

    await screen.findByTestId("orbit-strategy-overview");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Enduro de casa");
    expect(screen.getByTestId("orbit-strategy-name").textContent).toBe("Estrategia #1");
    // Dos pilotos ⇒ al menos dos stints en el reparto de partida.
    expect(screen.getAllByTestId(/^orbit-stint-\d+$/).length).toBeGreaterThanOrEqual(2);
    // Y el evento queda listado en la columna contextual.
    expect(
      within(screen.getByTestId("orbit-strategy-events")).getByText("Enduro de casa"),
    ).toBeTruthy();
  });

  it("«Desde un evento» toma la salida, la duración y la clase de la serie", async () => {
    starts.push(SPA_START);
    mount(null);

    await openWizard();
    fireEvent.click(screen.getByTestId("orbit-strategy-path-series"));
    const list = await screen.findByTestId("orbit-strategy-series");
    expect(list.textContent).toContain("GT3");
    expect(list.textContent).toContain("45 min");
    fireEvent.click(within(list).getByText("GT3 Sprint Series"));

    await screen.findByTestId("orbit-strategy-overview");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("GT3 Sprint Series");
    expect(screen.getAllByText("GT3").length).toBeGreaterThan(0);
    expect(screen.getByText(/45 min/)).toBeTruthy();
  });

  it("sin especiales ni semanales la lista recomendada lo dice y no inventa filas", async () => {
    starts.push(SPA_START); // `advanced`: no es semanal, no cuenta.
    mount(null);
    await openWizard();

    const block = await screen.findByTestId("orbit-strategy-recommended");
    expect(block.textContent).toContain("Del calendario");
    expect(block.textContent).toContain("Sin eventos en el calendario");
    expect(screen.queryByTestId("orbit-strategy-recommended-list")).toBeNull();
  });

  it("con especiales en el calendario los recomienda y «Planificar» crea el evento", async () => {
    calendarRef.current = {
      events: [
        {
          id: "spa-24h",
          title: "24 Horas de Spa",
          sim: "LMU",
          track: "Spa-Francorchamps",
          series: "Special Events",
          sessionLabel: "",
          startTime: "2030-07-27T14:00:00Z",
          durationMin: 1440,
          registrationUrl: "",
          source: "test",
          notes: "",
        },
      ],
    };
    starts.push(WEEKLY_START); // Hay semanal, pero el especial manda.
    mount(null);
    await openWizard();

    const list = await screen.findByTestId("orbit-strategy-recommended-list");
    expect(list.textContent).toContain("24 Horas de Spa");
    expect(list.textContent).toContain("Spa-Francorchamps");
    expect(list.textContent).not.toContain("LMU Weekly Endurance");

    fireEvent.click(screen.getByTestId("orbit-strategy-plan-Special Events"));

    await screen.findByTestId("orbit-strategy-overview");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("24 Horas de Spa");
  });

  it("sin especiales recomienda las semanales con su próxima salida", async () => {
    calendarRef.current = { events: [] };
    starts.push(WEEKLY_START);
    mount(null);
    await openWizard();

    const list = await screen.findByTestId("orbit-strategy-recommended-list");
    expect(list.textContent).toContain("LMU Weekly Endurance");
    expect(list.textContent).toContain("LMP2");
    expect(list.textContent).toContain("90 min");

    fireEvent.click(screen.getByTestId("orbit-strategy-plan-weekly-endurance"));

    await screen.findByTestId("orbit-strategy-overview");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("LMU Weekly Endurance");
    expect(screen.getAllByText("LMP2").length).toBeGreaterThan(0);
  });

  it("el evento se guarda y vuelve al recargar la pantalla", async () => {
    mount(null);
    await openWizard();
    fireEvent.click(screen.getByTestId("orbit-strategy-path-own"));
    fireEvent.change(screen.getByLabelText("Nombre del evento"), {
      target: { value: "Enduro de casa" },
    });
    fireEvent.click(screen.getByTestId("orbit-strategy-form-submit"));
    await screen.findByTestId("orbit-strategy-overview");

    cleanup();
    document.body.replaceChildren();
    mount(null);

    await screen.findByTestId("orbit-strategy-overview");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Enduro de casa");
  });
});

describe("StrategyOrbitPage · varios eventos", () => {
  it("la columna lista todos los eventos y el clic cambia el panel", async () => {
    await mounted();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("4 Horas de Imola");

    // Un segundo evento, propio.
    fireEvent.click(screen.getByTestId("orbit-strategy-new-event"));
    await openWizard();
    fireEvent.click(screen.getByTestId("orbit-strategy-path-own"));
    fireEvent.change(screen.getByLabelText("Nombre del evento"), {
      target: { value: "Enduro de casa" },
    });
    fireEvent.click(screen.getByTestId("orbit-strategy-form-submit"));
    await screen.findByTestId("orbit-strategy-overview");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Enduro de casa");

    const column = screen.getByTestId("orbit-strategy-events");
    expect(within(column).getAllByRole("button")).toHaveLength(2);

    fireEvent.click(within(column).getByText("4 Horas de Imola"));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("4 Horas de Imola"),
    );
    // Las estrategias que se ven son las del evento activo.
    expect(screen.getByTestId("orbit-strategy-name").textContent).toBe("Estrategia #1");
  });

  it("⚙ › Información del evento abre el formulario en edición", async () => {
    await mounted();

    fireEvent.click(screen.getByTestId("orbit-strategy-settings"));
    fireEvent.click(await screen.findByText("Información del evento"));

    const form = await screen.findByTestId("orbit-strategy-form");
    expect((within(form).getByLabelText("Nombre del evento") as HTMLInputElement).value).toBe(
      "4 Horas de Imola",
    );
    fireEvent.change(within(form).getByLabelText("Depósito"), { target: { value: "60" } });
    fireEvent.click(within(form).getByTestId("orbit-strategy-form-submit"));

    await waitFor(() => expect(screen.queryByTestId("orbit-strategy-form")).toBeNull());
    expect(screen.getByText("60 L")).toBeTruthy();
  });
});

describe("StrategyOrbitPage · pilotos del evento", () => {
  it("«Editar» abre los ritmos del piloto y el plan se recalcula", async () => {
    await mounted();

    const button = screen.getByTestId("orbit-driver-edit-isaac") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("title")).toBeNull();

    const laps = () =>
      screen
        .getAllByTestId(/^orbit-stint-\d+$/)
        .map((card) => Number(card.getAttribute("data-laps")))
        .reduce((sum, value) => sum + value, 0);
    const before = laps();

    fireEvent.click(button);
    const editor = await screen.findByTestId("orbit-driver-editor-isaac");
    fireEvent.change(within(editor).getByLabelText("Ritmo Seco"), { target: { value: "120" } });

    // Un ritmo más lento ⇒ menos vueltas en el mismo tiempo de carrera.
    await waitFor(() => expect(laps()).toBeLessThan(before));
  });
});

describe("StrategyOrbitPage · menú de entrada (ISA-377)", () => {
  /** Crea un evento propio con el nombre dado y vuelve al menú. */
  async function createAndLeave(name: string) {
    await openWizard();
    fireEvent.click(screen.getByTestId("orbit-strategy-path-own"));
    fireEvent.change(await screen.findByLabelText("Nombre del evento"), {
      target: { value: name },
    });
    fireEvent.click(screen.getByTestId("orbit-strategy-form-submit"));
    await screen.findByTestId("orbit-strategy-overview");
    fireEvent.click(screen.getByTestId("orbit-strategy-back"));
    return screen.findByTestId("orbit-strategy-home");
  }

  it("con un evento abierto la pestaña entra directa al editor, con vuelta al menú", async () => {
    await mounted();
    // Nada de peaje: el plan que estaba abierto es lo primero que se ve.
    expect(screen.getByTestId("orbit-strategy-overview")).toBeTruthy();
    expect(screen.queryByTestId("orbit-strategy-home")).toBeNull();

    fireEvent.click(screen.getByTestId("orbit-strategy-back"));
    const home = await screen.findByTestId("orbit-strategy-home");
    expect(within(home).getByTestId("orbit-strategy-continue").textContent).toContain(
      "4 Horas de Imola",
    );
  });

  it("«Continuar» ofrece el último abierto y devuelve a su editor", async () => {
    mount(null);
    await createAndLeave("Enduro de casa");
    await createAndLeave("Sprint del jueves");

    const card = screen.getByTestId("orbit-strategy-continue");
    // El último abierto es el segundo, no el primero ni el de arriba de la lista.
    expect(card.textContent).toContain("Sprint del jueves");
    expect(card.textContent).toContain("Última edición");

    fireEvent.click(card);
    await screen.findByTestId("orbit-strategy-overview");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Sprint del jueves");
  });

  it("la lista guardada duplica sin tocar el original", async () => {
    mount(null);
    await createAndLeave("Enduro de casa");

    // La lista de guardadas vive en su propia superficie, no en la de entrada.
    const saved = screen.getByTestId("orbit-strategy-saved");
    const rows = () => within(saved).getAllByTestId(/^orbit-strategy-open-/);
    expect(rows()).toHaveLength(1);
    fireEvent.click(within(saved).getByLabelText("Duplicar Enduro de casa"));

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(saved.textContent).toContain("Enduro de casa (copia)");
  });

  it("eliminar pregunta con el diálogo del kit y respeta el «Cancelar»", async () => {
    mount(null);
    await createAndLeave("Enduro de casa");
    fireEvent.click(screen.getByLabelText("Eliminar Enduro de casa"));

    const dialog = await screen.findByTestId("orbit-strategy-delete-dialog");
    // Es un diálogo real de la app, no un `confirm` del sistema.
    expect(within(dialog).getByRole("alertdialog")).toBeTruthy();
    expect(dialog.textContent).toContain("Enduro de casa");

    fireEvent.click(within(dialog).getByTestId("orbit-confirm-cancel"));
    await waitFor(() => expect(screen.queryByTestId("orbit-strategy-delete-dialog")).toBeNull());
    expect(screen.getByTestId("orbit-strategy-saved").textContent).toContain("Enduro de casa");

    fireEvent.click(screen.getByLabelText("Eliminar Enduro de casa"));
    fireEvent.click(
      within(await screen.findByTestId("orbit-strategy-delete-dialog")).getByTestId(
        "orbit-confirm-accept",
      ),
    );

    await waitFor(() =>
      expect(screen.getByTestId("orbit-strategy-saved").textContent).toContain(
        "Aún no hay nada guardado",
      ),
    );
  });

  it("la última apertura sobrevive al recargar la pantalla", async () => {
    mount(null);
    await createAndLeave("Enduro de casa");

    cleanup();
    document.body.replaceChildren();
    mount(null);

    // Sin evento activo se entra al menú, y «Continuar» recuerda cuál era.
    const home = await screen.findByTestId("orbit-strategy-home");
    expect(within(home).getByTestId("orbit-strategy-continue").textContent).toContain(
      "Enduro de casa",
    );
  });
});
