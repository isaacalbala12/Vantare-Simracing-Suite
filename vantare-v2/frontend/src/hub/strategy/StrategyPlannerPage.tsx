import { Fragment, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type DragEvent, type KeyboardEvent } from "react";
import {
  appendStint,
  assignTyre,
  clearTyreAssignment,
  conditionMidpoint,
  cornerLabel,
  deleteStint,
  formatCondition,
  isConditionExact,
  duplicateStint,
  insertStint,
  moveStint,
  parseStrategyEditorDocument,
  stintLapRange,
  StrategyEditorError,
  STRATEGY_CORNERS,
  tyreUseCount,
  type StrategyCorner,
  type StrategyEditorDocument,
  type StrategyStint,
  type StrategyTyre,
} from "../../strategy/strategy-editor";
import {
  createWailsStrategyEditorRuntime,
  openOrCreateStrategyEditor,
  type StrategyEditorRuntime,
} from "../../strategy/strategy-editor-store";
import type { StrategyApplicationClient } from "../../strategy/strategy-application-client";
import type { StrategyStore } from "../../strategy/strategy-store";
import {
  describePlan,
  filterPlans,
  loadStrategyLibrary,
  sortPlans,
  type StrategyLibraryEntry,
  type StrategyLibrarySort,
} from "../../strategy/strategy-library";
import {
  commitStrategyImport,
  describeImportEntry,
  exportStrategyPackage,
  previewStrategyImport,
  summariseImport,
} from "../../strategy/strategy-transfer";
import type { StrategyImportPreviewV1 } from "../../strategy/strategy-application-client";
import { canonicalStrategyTimestamp } from "../../strategy/strategy-contract-v1";
import {
  clearLapCorrection,
  clearQuickCorrection,
  correctLapValue,
  correctQuickValue,
  StrategyManualInputError,
  type StrategyLapField,
  type StrategyQuickField,
} from "../../strategy/strategy-manual-input";
import {
  createWailsStrategyManualClient,
  type StrategyManualClient,
  type StrategyManualResult,
} from "../../strategy/strategy-manual-client";
import {
  createWailsStrategySolverClient,
  type StrategySolverClient,
  type StrategyVariant,
} from "../../strategy/strategy-solver-client";
import {
  createWailsStrategyTyreClient,
  type StrategyPlanViolation,
  type StrategyTyreClient,
} from "../../strategy/strategy-tyre-client";
import { StrategyManualInputPanel } from "./StrategyManualInputPanel";
import "./strategy-planner.css";

type PlannerScreen = "gallery" | "entry" | "review" | "workspace";
type GalleryState = "ready" | "loading" | "empty" | "error";
type WorkspacePanel = "plans" | "stints" | "inventory";

/**
 * Where an export or import currently is. Reading, previewing and importing
 * are distinct states because they mean different things to the person
 * watching: only the last one can have changed anything.
 */
type TransferState =
  | { stage: "idle" }
  | { stage: "exporting"; planId: string }
  | { stage: "reading"; fileName: string }
  | { stage: "previewed"; fileName: string; bytes: Uint8Array; preview: StrategyImportPreviewV1 }
  | { stage: "importing"; fileName: string }
  | { stage: "error"; error: string };

/**
 * The build stamps this; "dev" is what an unstamped build honestly is, and it
 * travels in the package provenance rather than a version we invented.
 */
const DEFAULT_APP_VERSION =
  (import.meta.env?.VITE_APP_VERSION as string | undefined) ?? "dev";

/** Hands bytes to the user as a file. Replaced in tests, which have no DOM download. */
function downloadPackage(fileName: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

type StrategyPlannerPageProps = {
  demo?: boolean;
  initialScreen?: PlannerScreen;
  /** Forces a gallery state in tests; the real library drives it otherwise. */
  galleryState?: GalleryState;
  strategyStore?: StrategyStore<StrategyEditorDocument>;
  runtimeFactory?: () => StrategyEditorRuntime;
  manualClient?: StrategyManualClient;
  /** Reads "My plans" through the application service. */
  libraryClient?: StrategyApplicationClient<StrategyEditorDocument>;
  /**
   * Stamped into the provenance of every exported package. It defaults to the
   * build-time value; "dev" means the build did not stamp one, which is the
   * honest answer rather than a version we made up.
   */
  appVersion?: string;
  /** Hands exported bytes to the user. Overridable so tests never touch the DOM download path. */
  onSavePackage?: (fileName: string, bytes: Uint8Array) => void;
  /** Validates the planned tyre set against the physical domain in Go. */
  tyreClient?: StrategyTyreClient;
  /** Compares race strategies. Injected in tests, real bridge in the app. */
  solverClient?: StrategySolverClient;
  /** Pre-supplied variants, for tests and previews. */
  candidates?: readonly StrategyVariant[];
};

const PANELS: Array<{ id: WorkspacePanel; label: string }> = [
  { id: "plans", label: "Estrategias" },
  { id: "stints", label: "Stints" },
  { id: "inventory", label: "Inventario" },
];

/** Race context captured on the entry screen. */
type RaceEntry = {
  durationHours: string;
  plannedLaps: string;
  tankLiters: string;
  consumptionPerLap: string;
  tyreCount: string;
};

const DEFAULT_RACE_ENTRY: RaceEntry = {
  durationHours: "",
  plannedLaps: "",
  tankLiters: "",
  consumptionPerLap: "",
  tyreCount: "",
};

const RACE_ENTRY_FIELDS: Array<{ key: keyof RaceEntry; label: string; unit: string; step?: string }> = [
  { key: "durationHours", label: "Duración", unit: "horas" },
  { key: "plannedLaps", label: "Vueltas previstas", unit: "vueltas" },
  { key: "tankLiters", label: "Capacidad de tanque", unit: "litros" },
  { key: "consumptionPerLap", label: "Consumo medio", unit: "L/vuelta", step: "0.1" },
  { key: "tyreCount", label: "Neumáticos máximos", unit: "individuales" },
];

export function StrategyPlannerPage({
  demo = false,
  initialScreen = "gallery",
  galleryState,
  strategyStore,
  runtimeFactory = createWailsStrategyEditorRuntime,
  manualClient,
  libraryClient,
  appVersion = DEFAULT_APP_VERSION,
  onSavePackage = downloadPackage,
  tyreClient,
  solverClient,
  candidates,
}: StrategyPlannerPageProps) {
  const [ownedRuntime] = useState<StrategyEditorRuntime | null>(() => (
    strategyStore ? null : runtimeFactory()
  ));
  const ownedRuntimeMountedRef = useRef(false);
  const [ownedManualClient] = useState<StrategyManualClient | null>(() => (
    manualClient ? null : createWailsStrategyManualClient()
  ));
  const calculationClient = manualClient ?? ownedManualClient;
  if (!calculationClient) throw new Error("Strategy manual calculation client is required");
  const ownedManualClientMountedRef = useRef(false);
  const [ownedTyreClient] = useState<StrategyTyreClient | null>(() => (
    tyreClient ? null : createWailsStrategyTyreClient()
  ));
  const inventoryClient = tyreClient ?? ownedTyreClient;
  if (!inventoryClient) throw new Error("Strategy tyre client is required");
  const ownedTyreClientMountedRef = useRef(false);
  const [ownedSolverClient] = useState<StrategySolverClient | null>(() => (
    solverClient || candidates ? null : createWailsStrategySolverClient()
  ));
  const comparisonClient = solverClient ?? ownedSolverClient;
  const ownedSolverClientMountedRef = useRef(false);
  const loadRef = useRef<{ store: StrategyStore<StrategyEditorDocument>; promise: Promise<void> } | null>(null);
  const store = strategyStore ?? ownedRuntime?.store;
  if (!store) throw new Error("Strategy editor store is required");
  const storeSnapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [screen, setScreen] = useState<PlannerScreen>(initialScreen);
  const [activePanel, setActivePanel] = useState<WorkspacePanel>("stints");
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [entryMode, setEntryMode] = useState<"manual" | "telemetry">("manual");
  const [planName, setPlanName] = useState("");
  const [raceEntry, setRaceEntry] = useState<RaceEntry>(DEFAULT_RACE_ENTRY);
  const [editorLoading, setEditorLoading] = useState(
    initialScreen === "workspace" && !storeSnapshot.draft,
  );
  const [editorError, setEditorError] = useState("");
  const [manualCalculation, setManualCalculation] = useState<{
    draft: NonNullable<typeof storeSnapshot.draft>;
    result?: StrategyManualResult;
    error?: string;
  } | null>(null);
  const [manualMode, setManualMode] = useState<"quick" | "laps">("quick");
  const [library, setLibrary] = useState<{
    state: GalleryState;
    plans: readonly StrategyLibraryEntry[];
    error: string;
  }>({ state: "loading", plans: [], error: "" });
  const [libraryAttempt, setLibraryAttempt] = useState(0);
  /**
   * The repository version the library was read at. An import must commit
   * against the version it previewed, so a change underneath is refused rather
   * than applied blind.
   */
  const [libraryVersion, setLibraryVersion] = useState(0);
  const [transfer, setTransfer] = useState<TransferState>({ stage: "idle" });
  const [solvedVariants, setSolvedVariants] = useState<{
    draft: NonNullable<typeof storeSnapshot.draft>;
    variants: readonly StrategyVariant[];
    error?: string;
  } | null>(null);
  const [planViolations, setPlanViolations] = useState<{
    draft: NonNullable<typeof storeSnapshot.draft>;
    violations: readonly StrategyPlanViolation[];
  } | null>(null);
  const [editorLoadAttempt, setEditorLoadAttempt] = useState(0);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const comparisonOpenerRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    ownedRuntimeMountedRef.current = true;
    return () => {
      ownedRuntimeMountedRef.current = false;
      if (!ownedRuntime) return;
      queueMicrotask(() => {
        if (!ownedRuntimeMountedRef.current) {
          ownedRuntime.dispose();
        }
      });
    };
  }, [ownedRuntime]);

  useEffect(() => {
    ownedManualClientMountedRef.current = true;
    return () => {
      ownedManualClientMountedRef.current = false;
      if (!ownedManualClient) return;
      queueMicrotask(() => {
        if (!ownedManualClientMountedRef.current) ownedManualClient.dispose();
      });
    };
  }, [ownedManualClient]);

  useEffect(() => {
    const client = libraryClient ?? ownedRuntime?.client;
    if (screen !== "gallery" || !client) return;
    let active = true;
    setLibrary((current) => ({ ...current, state: "loading", error: "" }));
    void loadStrategyLibrary(client, `list-${libraryAttempt}-${Date.now()}`).then(
      (result) => {
        if (!active) return;
        setLibraryVersion(result.repositoryVersion);
        setLibrary({
          state: result.plans.length === 0 ? "empty" : "ready",
          plans: result.plans,
          error: "",
        });
      },
      (error: unknown) => {
        if (!active) return;
        setLibrary({
          state: "error",
          plans: [],
          error: error instanceof Error
            ? error.message
            : "No se pudo abrir la galería. Reintenta cuando el repositorio local esté disponible.",
        });
      },
    );
    return () => { active = false; };
  }, [libraryAttempt, libraryClient, ownedRuntime, screen]);

  const transferClient = libraryClient ?? ownedRuntime?.client ?? null;

  /**
   * Exports one plan. The package is handed to the user to save where they
   * chose; nothing is uploaded or shared.
   */
  const exportPlan = useCallback((plan: StrategyLibraryEntry) => {
    if (!transferClient) return;
    setTransfer({ stage: "exporting", planId: plan.planId });
    void exportStrategyPackage(
      transferClient,
      `export-${Date.now()}`,
      {
        plans: [{ planId: plan.planId, variantId: plan.variantId }],
        provenance: {
          application: "vantare",
          applicationVersion: appVersion,
          exportedAt: canonicalStrategyTimestamp(),
        },
      },
    ).then(
      (exported) => {
        onSavePackage(exported.suggestedFileName, exported.bytes);
        setTransfer({ stage: "idle" });
        setSaveMessage(`Plan exportado como ${exported.suggestedFileName}.`);
      },
      (error: unknown) => setTransfer({ stage: "error", error: messageOf(error, "No se pudo exportar el plan.") }),
    );
  }, [appVersion, onSavePackage, transferClient]);

  /**
   * Reads a package the user chose and reports what importing it would do.
   * Nothing is written until the preview is confirmed.
   */
  const previewImport = useCallback((file: File) => {
    if (!transferClient) return;
    setTransfer({ stage: "reading", fileName: file.name });
    void file.arrayBuffer()
      .then((buffer) => {
        const bytes = new Uint8Array(buffer);
        return previewStrategyImport(transferClient, `import-preview-${Date.now()}`, bytes)
          .then((preview) => ({ bytes, preview }));
      })
      .then(
        ({ bytes, preview }) => setTransfer({ stage: "previewed", fileName: file.name, bytes, preview }),
        (error: unknown) => setTransfer({
          stage: "error",
          error: messageOf(error, "El paquete no se pudo leer o no es de confianza."),
        }),
      );
  }, [transferClient]);

  /** Applies a previewed package. It lands whole or not at all. */
  const confirmImport = useCallback(() => {
    if (!transferClient || transfer.stage !== "previewed") return;
    const { bytes, fileName } = transfer;
    setTransfer({ stage: "importing", fileName });
    void commitStrategyImport(transferClient, `import-${Date.now()}`, bytes, libraryVersion).then(
      (outcome) => {
        setTransfer({ stage: "idle" });
        setSaveMessage(`Importado desde ${fileName}: ${summariseImport(outcome.preview)}.`);
        setLibraryAttempt((attempt) => attempt + 1);
      },
      (error: unknown) => setTransfer({
        stage: "error",
        error: messageOf(error, "No se importó nada; tu biblioteca no ha cambiado."),
      }),
    );
  }, [libraryVersion, transfer, transferClient]);

  useEffect(() => {
    ownedSolverClientMountedRef.current = true;
    return () => {
      ownedSolverClientMountedRef.current = false;
      if (!ownedSolverClient) return;
      queueMicrotask(() => {
        if (!ownedSolverClientMountedRef.current) ownedSolverClient.dispose();
      });
    };
  }, [ownedSolverClient]);

  useEffect(() => {
    ownedTyreClientMountedRef.current = true;
    return () => {
      ownedTyreClientMountedRef.current = false;
      if (!ownedTyreClient) return;
      queueMicrotask(() => {
        if (!ownedTyreClientMountedRef.current) ownedTyreClient.dispose();
      });
    };
  }, [ownedTyreClient]);

  useEffect(() => {
    if (screen !== "workspace") return;
    if (store.getSnapshot().draft) return;
    let active = true;
    if (loadRef.current?.store !== store) {
      loadRef.current = { store, promise: openOrCreateStrategyEditor(store) };
    }
    void loadRef.current.promise.then(
      () => {
        if (active) setEditorLoading(false);
      },
      () => {
        if (!active) return;
        if (loadRef.current?.store === store) loadRef.current = null;
        setEditorError("No se pudo abrir el plan local. Reintenta o revisa Diagnóstico si el problema continúa.");
        setEditorLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [editorLoadAttempt, screen, store]);

  const editorDocument = storeSnapshot.draft
    ? tryParseStrategyEditorDocument(storeSnapshot.draft.payload)
    : null;
  const manualCalculationCurrent = manualCalculation?.draft === storeSnapshot.draft;
  const manualResult = manualCalculationCurrent ? manualCalculation?.result ?? null : null;
  const manualError = manualCalculationCurrent ? manualCalculation?.error ?? "" : "";
  const manualLoading = screen === "workspace" && Boolean(editorDocument) && !manualCalculationCurrent;

  useEffect(() => {
    const draft = storeSnapshot.draft;
    if (screen !== "workspace" || !draft) return;
    const document = tryParseStrategyEditorDocument(draft.payload);
    if (!document) return;
    let active = true;
    void calculationClient.calculate(document).then(
      (result) => {
        if (!active) return;
        setManualCalculation({ draft, result });
      },
      () => {
        if (!active) return;
        setManualCalculation({ draft, error: "No se pudo recalcular el plan. Revisa los datos manuales o Diagnóstico." });
      },
    );
    return () => { active = false; };
  }, [calculationClient, screen, storeSnapshot.draft]);

  // The Go domain is the authority: the editor blocks illegal moves as they
  // happen, and this confirms the whole plan against the real inventory.
  const violations = planViolations && planViolations.draft === storeSnapshot.draft
    ? planViolations.violations
    : [];

  useEffect(() => {
    const draft = storeSnapshot.draft;
    if (screen !== "workspace" || !draft) return;
    const document = tryParseStrategyEditorDocument(draft.payload);
    if (!document) return;
    let active = true;
    void inventoryClient.validate(document).then(
      (validation) => {
        if (active) setPlanViolations({ draft, violations: validation.violations });
      },
      () => {
        // A transport failure is not a plan problem: say nothing rather than
        // accusing a plan that may well be legal.
        if (active) setPlanViolations({ draft, violations: [] });
      },
    );
    return () => { active = false; };
  }, [inventoryClient, screen, storeSnapshot.draft]);

  const solvedCurrent = solvedVariants !== null && solvedVariants.draft === storeSnapshot.draft;
  const variants = candidates ?? (solvedCurrent ? solvedVariants.variants : []);
  const solverError = solvedCurrent ? solvedVariants.error ?? "" : "";
  const solverLoading = !candidates && screen === "workspace" && Boolean(editorDocument) && !solvedCurrent;

  useEffect(() => {
    const draft = storeSnapshot.draft;
    if (candidates || !comparisonClient || screen !== "workspace" || !draft) return;
    const document = tryParseStrategyEditorDocument(draft.payload);
    if (!document) return;
    let active = true;
    void comparisonClient.compare(document).then(
      (comparison) => {
        if (active) setSolvedVariants({ draft, variants: comparison.variants });
      },
      (error: unknown) => {
        if (!active) return;
        setSolvedVariants({
          draft,
          variants: [],
          error: error instanceof Error ? error.message : "No se pudo comparar estrategias.",
        });
      },
    );
    return () => { active = false; };
  }, [candidates, comparisonClient, screen, storeSnapshot.draft]);

  const editDocument = useCallback((change: (document: StrategyEditorDocument) => StrategyEditorDocument) => {
    setEditorError("");
    try {
      store.edit((draft) => ({
        ...draft,
        updatedAt: canonicalStrategyTimestamp(),
        payload: change(parseStrategyEditorDocument(draft.payload)),
      }));
      return true;
    } catch (error) {
      setEditorError(error instanceof StrategyEditorError || error instanceof StrategyManualInputError ? error.message : "No se pudo aplicar el cambio.");
      return false;
    }
  }, [store]);

  const enterWorkspace = useCallback(() => {
    setEditorError("");
    if (!store.getSnapshot().draft) setEditorLoading(true);
    setScreen("workspace");
  }, [store]);

  const openPlan = useCallback((plan: StrategyLibraryEntry) => {
    if (!plan.draftId) return;
    setEditorError("");
    setEditorLoading(true);
    setScreen("workspace");
    void store.open(plan.draftId).catch(() => {
      setEditorError(`No se pudo abrir ${plan.name}. Reintenta o revisa Diagnóstico.`);
      setEditorLoading(false);
    });
  }, [store]);

  const retryEditorLoad = useCallback(() => {
    setEditorError("");
    setEditorLoading(true);
    setEditorLoadAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    const background = backgroundRef.current;
    if (!background) return;
    if (comparisonOpen) background.setAttribute("inert", "");
    else background.removeAttribute("inert");
  }, [comparisonOpen]);

  const openComparison = useCallback((opener: HTMLButtonElement) => {
    comparisonOpenerRef.current = opener;
    setComparisonOpen(true);
  }, []);

  const closeComparison = useCallback(() => {
    setComparisonOpen(false);
    requestAnimationFrame(() => comparisonOpenerRef.current?.focus());
  }, []);

  function selectPanel(panel: WorkspacePanel) {
    setActivePanel(panel);
  }

  function handlePanelKey(event: KeyboardEvent<HTMLButtonElement>, panel: WorkspacePanel) {
    const current = PANELS.findIndex((item) => item.id === panel);
    const next = event.key === "ArrowRight"
      ? (current + 1) % PANELS.length
      : event.key === "ArrowLeft"
        ? (current - 1 + PANELS.length) % PANELS.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? PANELS.length - 1
            : -1;
    if (next < 0) return;
    event.preventDefault();
    setActivePanel(PANELS[next].id);
    requestAnimationFrame(() => document.getElementById(`strategy-tab-${PANELS[next].id}`)?.focus());
  }

  return (
    <section
      className="strategy-planner"
      aria-label={comparisonOpen ? "Strategy Planner" : undefined}
      aria-labelledby={comparisonOpen ? undefined : titleId}
      data-screen={screen}
    >
      <div
        ref={backgroundRef}
        className="strategy-planner__background"
        aria-hidden={comparisonOpen ? true : undefined}
      >
      {screen !== "workspace" && (
        <div className="strategy-planner__utility">
          <span className="strategy-planner__demo-dot" aria-hidden="true" />
          <span>{demo ? "Datos de ejemplo · sin telemetría live" : "Workspace local · sin conexión live"}</span>
        </div>
      )}

      {screen === "gallery" && (
        <Gallery
          titleId={titleId}
          state={galleryState ?? library.state}
          plans={library.plans}
          error={library.error}
          onCreate={() => setScreen("entry")}
          onOpen={openPlan}
          onReload={() => setLibraryAttempt((attempt) => attempt + 1)}
          transfer={transfer}
          onExport={exportPlan}
          onPickPackage={previewImport}
          onConfirmImport={confirmImport}
          onCancelTransfer={() => setTransfer({ stage: "idle" })}
        />
      )}

      {screen === "entry" && (
        <EntryScreen
          titleId={titleId}
          mode={entryMode}
          planName={planName}
          entry={raceEntry}
          onEntryChange={(key, value) => setRaceEntry((current) => ({ ...current, [key]: value }))}
          onModeChange={setEntryMode}
          onNameChange={setPlanName}
          onBack={() => setScreen("gallery")}
          onContinue={() => setScreen("review")}
        />
      )}

      {screen === "review" && (
        <ReviewScreen
          titleId={titleId}
          planName={planName}
          entry={raceEntry}
          mode={entryMode}
          onBack={() => setScreen("entry")}
          onContinue={enterWorkspace}
        />
      )}

      {screen === "workspace" && (
        editorLoading ? (
          <div className="strategy-state" role="status">Cargando editor de stints…</div>
        ) : !editorDocument ? (
          <div className="strategy-state strategy-state--error" role="alert">
            <p>{editorError || "El plan guardado no es compatible o está dañado. Reintenta o revisa Diagnóstico."}</p>
            <button type="button" onClick={retryEditorLoad}>Reintentar</button>
          </div>
        ) : <Workspace
          titleId={titleId}
          planName={planName}
          candidates={variants}
          candidatesLoading={solverLoading}
          candidatesError={solverError}
          violations={violations}
          document={editorDocument}
          dirty={storeSnapshot.dirty}
          canUndo={storeSnapshot.canUndo}
          canRedo={storeSnapshot.canRedo}
          busy={storeSnapshot.busy}
          error={editorError}
          manualResult={manualResult}
          manualLoading={manualLoading}
          manualError={manualError}
          manualMode={manualMode}
          activePanel={activePanel}
          onSelectPanel={selectPanel}
          onPanelKey={handlePanelKey}
          onBack={() => setScreen("gallery")}
          onCompare={openComparison}
          onEdit={() => setScreen("entry")}
          onManualModeChange={setManualMode}
          onCorrectQuick={(field, value) => editDocument((current) => correctQuickValue(current, field, value, "Entrada rápida", canonicalStrategyTimestamp()))}
          onClearQuick={(field) => editDocument((current) => clearQuickCorrection(current, field))}
          onCorrectLap={(lap, field, value) => editDocument((current) => correctLapValue(current, lap, field, value, `Corrección manual vuelta ${lap}`, canonicalStrategyTimestamp()))}
          onClearLap={(lap, field) => editDocument((current) => clearLapCorrection(current, lap, field))}
          onAppend={() => editDocument(appendStint)}
          onInsert={(id, after) => editDocument((current) => {
            const index = current.stints.findIndex((item) => item.id === id);
            return insertStint(current, index + (after ? 1 : 0));
          })}
          onDuplicate={(id) => editDocument((current) => duplicateStint(current, id))}
          onDelete={(id) => editDocument((current) => deleteStint(current, id))}
          onMove={(id, target) => editDocument((current) => moveStint(current, id, target))}
          onAssign={(stintId, corner, tyreId) => editDocument((current) => assignTyre(current, stintId, corner, tyreId))}
          onClear={(stintId, corner) => editDocument((current) => clearTyreAssignment(current, stintId, corner))}
          onUndo={() => store.undo()}
          onRedo={() => store.redo()}
          onSave={() => void store.save().then(
            () => setSaveMessage("Plan guardado localmente. Las asignaciones se conservarán al volver a abrir Vantare."),
            () => setEditorError("No se pudo guardar el plan. Reintenta o revisa Diagnóstico."),
          )}
        />
      )}

      {saveMessage && (
        <div className="strategy-toast" role="status">
          <span aria-hidden="true">✓</span>
          <span>{saveMessage}</span>
          <button type="button" onClick={() => setSaveMessage("")} aria-label="Cerrar mensaje">×</button>
        </div>
      )}
      </div>

      {comparisonOpen && (
        <ComparisonDialog strategies={variants} onClose={closeComparison} />
      )}
    </section>
  );
}

function tryParseStrategyEditorDocument(value: unknown): StrategyEditorDocument | null {
  try {
    return parseStrategyEditorDocument(value);
  } catch {
    return null;
  }
}

function Gallery({
  titleId,
  state,
  plans,
  error,
  onCreate,
  onOpen,
  onReload,
  transfer,
  onExport,
  onPickPackage,
  onConfirmImport,
  onCancelTransfer,
}: {
  titleId: string;
  state: GalleryState;
  plans: readonly StrategyLibraryEntry[];
  error: string;
  onCreate: () => void;
  onOpen: (plan: StrategyLibraryEntry) => void;
  onReload: () => void;
  transfer: TransferState;
  onExport: (plan: StrategyLibraryEntry) => void;
  onPickPackage: (file: File) => void;
  onConfirmImport: () => void;
  onCancelTransfer: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<StrategyLibrarySort>("recent");
  const [scope, setScope] = useState<"all" | "unsaved" | "saved">("all");
  const searchId = useId();
  const importId = useId();

  const visible = sortPlans(
    filterPlans(plans, {
      query,
      onlyUnsaved: scope === "unsaved",
      onlySaved: scope === "saved",
    }),
    sort,
  );

  return (
    <div className="strategy-screen strategy-gallery">
      <header className="strategy-page-header">
        <div>
          <p className="strategy-eyebrow">Strategy Planner</p>
          <h1 id={titleId}>Mis planes</h1>
          <p>Tus planes son privados y viven solo en este equipo.</p>
        </div>
        <div className="strategy-page-header__actions">
          <label className="strategy-button strategy-button--secondary" htmlFor={importId}>
            Importar plan
            <input
              id={importId}
              type="file"
              accept=".json,application/json"
              className="strategy-visually-hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Clearing the input lets the same file be chosen twice, which
                // matters when the first attempt was cancelled.
                event.target.value = "";
                if (file) onPickPackage(file);
              }}
            />
          </label>
          <button className="strategy-button strategy-button--primary" type="button" onClick={onCreate}>
            <span aria-hidden="true">＋</span> Crear plan
          </button>
        </div>
      </header>

      {transfer.stage === "reading" && (
        <div className="strategy-state" role="status">Leyendo {transfer.fileName}…</div>
      )}
      {transfer.stage === "importing" && (
        <div className="strategy-state" role="status">Importando {transfer.fileName}…</div>
      )}
      {transfer.stage === "error" && (
        <div className="strategy-state strategy-state--error" role="alert" data-testid="strategy-transfer-error">
          <p>{transfer.error}</p>
          <button className="strategy-button strategy-button--secondary" type="button" onClick={onCancelTransfer}>
            Entendido
          </button>
        </div>
      )}
      {transfer.stage === "previewed" && (
        <ImportPreview
          fileName={transfer.fileName}
          preview={transfer.preview}
          onConfirm={onConfirmImport}
          onCancel={onCancelTransfer}
        />
      )}

      {state === "ready" && plans.length > 0 && (
        <div className="strategy-gallery__tools">
          <label className="strategy-field strategy-field--wide" htmlFor={searchId}>
            Buscar
            <input
              id={searchId}
              type="search"
              value={query}
              placeholder="Nombre o identificador"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="strategy-field">
            Mostrar
            <select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}>
              <option value="all">Todos</option>
              <option value="unsaved">Con cambios abiertos</option>
              <option value="saved">Con revisiones guardadas</option>
            </select>
          </label>
          <label className="strategy-field">
            Ordenar
            <select value={sort} onChange={(event) => setSort(event.target.value as StrategyLibrarySort)}>
              <option value="recent">Más reciente</option>
              <option value="name">Nombre</option>
            </select>
          </label>
        </div>
      )}

      {state === "loading" && <div className="strategy-state" role="status">Cargando planes…</div>}
      {state === "error" && (
        <div className="strategy-state strategy-state--error" role="alert">
          <p>{error || "No se pudo abrir la galería."}</p>
          <button className="strategy-button strategy-button--secondary" type="button" onClick={onReload}>
            Reintentar
          </button>
        </div>
      )}
      {state === "empty" && (
        <div className="strategy-state strategy-state--empty">
          <span className="strategy-state__icon" aria-hidden="true">◇</span>
          <h2>Todavía no tienes planes guardados</h2>
          <p>Crea un plan manual; nada sale de este equipo salvo que lo exportes tú.</p>
          <button className="strategy-button strategy-button--primary" type="button" onClick={onCreate}>Crear el primero</button>
        </div>
      )}
      {state === "ready" && visible.length === 0 && plans.length > 0 && (
        <div className="strategy-state strategy-state--empty" data-testid="strategy-gallery-no-match">
          <h2>Ningún plan coincide</h2>
          <p>Prueba con otro texto o cambia el filtro.</p>
        </div>
      )}
      {state === "ready" && visible.length > 0 && (
        <div className="strategy-gallery__grid" data-testid="strategy-gallery-grid">
          {visible.map((plan) => (
            <article
              className={`strategy-plan-tile ${plan.hasDraft ? "strategy-plan-tile--active" : ""}`}
              key={`${plan.planId}:${plan.variantId}`}
              data-testid={`strategy-plan-${plan.planId}-${plan.variantId}`}
            >
              <div className="strategy-plan-tile__visual" aria-hidden="true"><span /><span /><span /></div>
              <div className="strategy-plan-tile__body">
                <div className="strategy-plan-tile__meta">
                  <span>{plan.planId}</span>
                  {plan.hasDraft && <span>SIN GUARDAR</span>}
                </div>
                <h2>{plan.name}</h2>
                <p>{describePlan(plan)}</p>
                <button
                  className="strategy-button strategy-button--secondary"
                  type="button"
                  onClick={() => onOpen(plan)}
                  disabled={!plan.hasDraft}
                  title={plan.hasDraft ? undefined : "Este plan no tiene un borrador abierto"}
                >Abrir workspace</button>
                <button
                  className="strategy-button strategy-button--ghost"
                  type="button"
                  onClick={() => onExport(plan)}
                  disabled={transfer.stage === "exporting"}
                  data-testid={`strategy-export-${plan.planId}-${plan.variantId}`}
                >
                  {transfer.stage === "exporting" && transfer.planId === plan.planId
                    ? "Exportando…"
                    : "Exportar"}
                </button>
              </div>
            </article>
          ))}
          <button className="strategy-plan-tile strategy-plan-tile--new" type="button" onClick={onCreate}>
            <span aria-hidden="true">＋</span>
            <strong>Nuevo plan</strong>
            <small>Entrada manual</small>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * What an import would do, shown before it does it. Every entry states its own
 * effect, and a package that would collide cannot be confirmed at all.
 */
function ImportPreview({
  fileName,
  preview,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  preview: StrategyImportPreviewV1;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const nothingToDo = preview.entries.every((entry) => entry.disposition === "unchanged");
  return (
    <section className="strategy-import-preview" aria-label="Vista previa de importación" data-testid="strategy-import-preview">
      <header>
        <h2>{fileName}</h2>
        <p data-testid="strategy-import-summary">{summariseImport(preview)}</p>
        <p className="strategy-import-preview__provenance">
          Exportado por {preview.provenance.application} {preview.provenance.applicationVersion} el{" "}
          {preview.provenance.exportedAt.slice(0, 10)}
        </p>
      </header>
      <ul className="strategy-import-preview__entries">
        {preview.entries.map((entry) => (
          <li
            key={`${entry.planId}:${entry.variantId}`}
            data-testid={`strategy-import-entry-${entry.planId}-${entry.variantId}`}
            data-disposition={entry.disposition}
          >
            <strong>{entry.name || entry.planId}</strong>
            <span>{describeImportEntry(entry)}</span>
          </li>
        ))}
      </ul>
      <footer>
        <button className="strategy-button strategy-button--secondary" type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button
          className="strategy-button strategy-button--primary"
          type="button"
          onClick={onConfirm}
          disabled={!preview.importable || nothingToDo}
          title={
            preview.importable
              ? (nothingToDo ? "Ya tienes todo lo que trae este paquete" : undefined)
              : "Este paquete choca con revisiones que ya tienes guardadas"
          }
        >
          Importar
        </button>
      </footer>
    </section>
  );
}

function EntryScreen({
  titleId,
  mode,
  planName,
  entry,
  onModeChange,
  onNameChange,
  onEntryChange,
  onBack,
  onContinue,
}: {
  titleId: string;
  mode: "manual" | "telemetry";
  planName: string;
  entry: RaceEntry;
  onModeChange: (mode: "manual" | "telemetry") => void;
  onNameChange: (name: string) => void;
  onEntryChange: (key: keyof RaceEntry, value: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="strategy-screen strategy-flow-screen">
      <FlowHeader step={1} titleId={titleId} title="Entrada de carrera" description="Define el contexto mínimo antes de revisar el plan." />
      <div className="strategy-flow-card">
        <div className="strategy-mode-switch" role="group" aria-label="Fuente de entrada">
          <button type="button" aria-pressed={mode === "manual"} onClick={() => onModeChange("manual")}>Entrada manual</button>
          <button type="button" aria-pressed={mode === "telemetry"} onClick={() => onModeChange("telemetry")}>Importar telemetría</button>
        </div>
        {mode === "telemetry" ? (
          <div className="strategy-import-box">
            <span aria-hidden="true">⇧</span>
            <h2>Selecciona una sesión de LMU</h2>
            <p>Este corte muestra el flujo. No lee archivos ni presenta datos simulados como telemetría real.</p>
            <button className="strategy-button strategy-button--secondary" type="button" onClick={() => onModeChange("manual")}>Continuar con valores manuales</button>
          </div>
        ) : (
          <form className="strategy-form" onSubmit={(event) => { event.preventDefault(); onContinue(); }}>
            <label className="strategy-field strategy-field--wide">Nombre del plan<input value={planName} onChange={(event) => onNameChange(event.target.value)} required /></label>
            {RACE_ENTRY_FIELDS.map((field) => (
              <label className="strategy-field" key={field.key}>
                {field.label}
                <input
                  type="number"
                  min={field.step ? "0" : "1"}
                  step={field.step}
                  value={entry[field.key]}
                  onChange={(event) => onEntryChange(field.key, event.target.value)}
                />
                <span>{field.unit}</span>
              </label>
            ))}
          </form>
        )}
      </div>
      <FlowActions onBack={onBack} nextLabel="Continuar a revisión" onNext={onContinue} />
    </div>
  );
}

/** Describes only what the user actually entered; blanks stay blank. */
function describeRace(entry: RaceEntry): string {
  const parts: string[] = [];
  if (entry.durationHours.trim()) parts.push(`${entry.durationHours} horas`);
  if (entry.plannedLaps.trim()) parts.push(`${entry.plannedLaps} vueltas previstas`);
  return parts.length > 0 ? parts.join(" · ") : "Sin definir";
}

function describeResources(entry: RaceEntry): string {
  const parts: string[] = [];
  if (entry.tankLiters.trim()) parts.push(`${entry.tankLiters} L`);
  if (entry.consumptionPerLap.trim()) parts.push(`${entry.consumptionPerLap} L/vuelta`);
  if (entry.tyreCount.trim()) parts.push(`${entry.tyreCount} neumáticos individuales`);
  return parts.length > 0 ? parts.join(" · ") : "Sin definir";
}

function ReviewScreen({ titleId, planName, entry, mode, onBack, onContinue }: { titleId: string; planName: string; entry: RaceEntry; mode: string; onBack: () => void; onContinue: () => void }) {
  const rows: Array<[string, string]> = [
    ["Plan", planName || "Sin nombre"],
    ["Fuente", mode === "manual" ? "Entrada manual" : "Telemetría pendiente"],
    ["Carrera", describeRace(entry)],
    ["Recursos", describeResources(entry)],
  ];
  return (
    <div className="strategy-screen strategy-flow-screen">
      <FlowHeader step={2} titleId={titleId} title="Revisar datos" description="Confirma los valores que formarán el workspace." />
      <div className="strategy-flow-card strategy-review">
        <div className="strategy-review__notice"><span aria-hidden="true">i</span><p>Estos valores son los que has introducido. No proceden de una sesión live ni constituyen una estrategia calculada.</p></div>
        <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </div>
      <FlowActions onBack={onBack} nextLabel="Crear workspace" onNext={onContinue} />
    </div>
  );
}

function Workspace({
  titleId, planName, candidates, candidatesLoading, candidatesError, violations,
  document, dirty, canUndo, canRedo, busy, error,
  manualResult, manualLoading, manualError, manualMode,
  activePanel, onSelectPanel, onPanelKey, onBack, onCompare, onEdit,
  onManualModeChange, onCorrectQuick, onClearQuick, onCorrectLap, onClearLap,
  onAppend, onInsert, onDuplicate, onDelete, onMove, onAssign, onClear,
  onUndo, onRedo, onSave,
}: {
  titleId: string; planName: string; candidates: readonly StrategyVariant[];
  candidatesLoading: boolean; candidatesError: string;
  violations: readonly StrategyPlanViolation[];
  document: StrategyEditorDocument;
  dirty: boolean; canUndo: boolean; canRedo: boolean; busy: boolean; error: string;
  manualResult: StrategyManualResult | null; manualLoading: boolean; manualError: string;
  manualMode: "quick" | "laps";
  activePanel: WorkspacePanel;
  onSelectPanel: (panel: WorkspacePanel) => void;
  onPanelKey: (event: KeyboardEvent<HTMLButtonElement>, panel: WorkspacePanel) => void;
  onBack: () => void; onCompare: (opener: HTMLButtonElement) => void; onEdit: () => void;
  onManualModeChange: (mode: "quick" | "laps") => void;
  onCorrectQuick: (field: StrategyQuickField, value: number) => boolean;
  onClearQuick: (field: StrategyQuickField) => boolean;
  onCorrectLap: (lap: number, field: StrategyLapField, value: number) => boolean;
  onClearLap: (lap: number, field: StrategyLapField) => boolean;
  onAppend: () => void; onInsert: (id: string, after: boolean) => void;
  onDuplicate: (id: string) => void; onDelete: (id: string) => void;
  onMove: (id: string, target: number) => void;
  onAssign: (stintId: string, corner: StrategyCorner, tyreId: string) => boolean;
  onClear: (stintId: string, corner: StrategyCorner) => void;
  onUndo: () => void; onRedo: () => void; onSave: () => void;
}) {
  const [draggedTyre, setDraggedTyre] = useState<string | null>(null);
  const [pickedTyre, setPickedTyre] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const totalLaps = document.stints.reduce((total, stint) => total + stint.lapCount, 0);
  const canCompare = candidates.length > 0;

  useEffect(() => {
    function cancelTransfer(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || (!draggedTyre && !pickedTyre)) return;
      event.preventDefault();
      setDraggedTyre(null);
      setPickedTyre(null);
      setAnnouncement("Asignación cancelada. El plan no ha cambiado.");
    }
    globalThis.document.addEventListener("keydown", cancelTransfer);
    return () => globalThis.document.removeEventListener("keydown", cancelTransfer);
  }, [draggedTyre, pickedTyre]);

  function assign(stintId: string, corner: StrategyCorner, tyreId: string) {
    if (!onAssign(stintId, corner, tyreId)) return;
    setDraggedTyre(null);
    setPickedTyre(null);
    setAnnouncement(`${tyreId} asignado a ${cornerLabel(corner)}.`);
  }

  function dropTyre(event: DragEvent<HTMLButtonElement>, stintId: string, corner: StrategyCorner) {
    event.preventDefault();
    const tyreId = event.dataTransfer.getData("application/x-vantare-tyre") || draggedTyre;
    if (tyreId) assign(stintId, corner, tyreId);
  }

  return (
    <div className="strategy-screen strategy-workspace">
      <header className="strategy-workspace__header">
        <div>
          <div className="strategy-workspace__eyebrow-row">
            <button className="strategy-back-link" type="button" onClick={onBack} aria-label="Volver a Mis planes" />
            <p className="strategy-eyebrow">Strategy Planner</p>
          </div>
          <h1 id={titleId}>Plan offline</h1>
        </div>
        {/* Only figures derived from the open document: no session clock, no
            plan count and no weather until something actually reports them. */}
        <div className="strategy-workspace__context">
          <b>{planName}</b>
          <i />
          <small>STINTS <b>{document.stints.length}</b></small>
          <i />
          <small>VUELTAS <b>{totalLaps}</b></small>
        </div>
      </header>

      <ol className="strategy-stepper" aria-label="Progreso del plan">
        <li className="is-done"><span><b>01</b> Entrada</span></li><li className="is-done"><span><b>02</b> Revisión</span></li><li className="is-current"><span><b>03</b> Plan de carrera</span></li><li><span><b>04</b> Guardar</span></li>
      </ol>

      <div className="strategy-panel-tabs" role="group" aria-label="Panel visible del workspace">
        {PANELS.map((panel) => (
          <button
            id={`strategy-tab-${panel.id}`}
            key={panel.id}
            type="button"
            aria-pressed={activePanel === panel.id}
            tabIndex={activePanel === panel.id ? 0 : -1}
            onClick={() => onSelectPanel(panel.id)}
            onKeyDown={(event) => onPanelKey(event, panel.id)}
          >{panel.label}</button>
        ))}
      </div>

      <div className="strategy-workspace__grid">
        <aside aria-label="Estrategias" data-compact-active={activePanel === "plans"} data-testid="strategy-column-plans" className="strategy-column strategy-column--plans">
          <section className="strategy-panel">
            <PanelHeading
              title="Estrategias"
              meta={candidatesLoading ? "Resolviendo" : candidates.length > 0 ? `${candidates.length} planes` : "Sin calcular"}
            />
            {candidatesError && (
              <p className="strategy-panel__empty" role="status" data-testid="strategy-candidates-error">
                {candidatesError}
              </p>
            )}
            {!candidatesError && candidates.length > 0 && candidates.map((variant) => (
              <StrategyOption key={variant.kind} variant={variant} />
            ))}
            {!candidatesError && candidates.length === 0 && (
              <p className="strategy-panel__empty" data-testid="strategy-candidates-empty">
                {candidatesLoading
                  ? "Resolviendo estrategias…"
                  : "Sin estrategias: indica la caída de ritmo y el consumo en la entrada manual."}
              </p>
            )}
          </section>
          <FuelSavePanel result={manualResult} loading={manualLoading} error={manualError} document={document} />
        </aside>

        <main aria-label="Stints" data-compact-active={activePanel === "stints"} data-testid="strategy-column-stints" className="strategy-column strategy-column--stints strategy-panel">
          <div className="strategy-plan-heading">
            <PanelHeading
              title="Plan de carrera"
              meta={`${document.stints.length} stints · ${totalLaps} vueltas · ${Math.max(0, document.stints.length - 1)} paradas`}
            />
            <div>
              <button
                type="button"
                onClick={(event) => onCompare(event.currentTarget)}
                disabled={!canCompare}
                title={canCompare ? undefined : "Sin estrategias calculadas que comparar"}
              >Comparar</button>
              <button type="button" onClick={onAppend}>＋ Stint</button>
            </div>
          </div>
          <div className="strategy-legend"><span><i className="is-green" /> Desgaste cae</span><span><i /> Ritmo previsto</span></div>
          <div className="strategy-stint-columns" aria-hidden="true"><span>STINT</span><span>FRONT LEFT</span><span>FRONT RIGHT</span><span>REAR LEFT</span><span>REAR RIGHT</span></div>
          {error && <div className="strategy-editor-error" role="alert">{error}</div>}
          {violations.length > 0 && (
            <div className="strategy-plan-violations" role="alert" data-testid="strategy-plan-violations">
              <b>El inventario físico rechaza {violations.length === 1 ? "una asignación" : `${violations.length} asignaciones`}</b>
              <ul>
                {violations.map((violation) => (
                  <li key={`${violation.stintId ?? ""}-${violation.corner ?? ""}-${violation.tyreId ?? ""}`}>
                    {violation.tyreId ? <b>{violation.tyreId}</b> : null}
                    {violation.corner ? ` · ${cornerLabel(violation.corner)}` : ""}
                    {violation.stintId ? ` · ${violation.stintId}` : ""}
                    {` — ${violation.message}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {document.stints.map((stint, index) => (
            <StintCard
              key={stint.id}
              document={document}
              result={manualResult?.stints[index]}
              pitLossPerStopSeconds={manualResult?.pitLossPerStopSeconds}
              stint={stint}
              index={index}
              last={index === document.stints.length - 1}
              pickedTyre={pickedTyre}
              onDrop={dropTyre}
              onAssign={(corner) => pickedTyre && assign(stint.id, corner, pickedTyre)}
              onClear={(corner) => onClear(stint.id, corner)}
              onInsert={(after) => onInsert(stint.id, after)}
              onDuplicate={() => onDuplicate(stint.id)}
              onDelete={() => onDelete(stint.id)}
              onMove={(target) => onMove(stint.id, target)}
            />
          ))}
        </main>

        <aside aria-label="Inventario" data-compact-active={activePanel === "inventory"} data-testid="strategy-column-inventory" className="strategy-column strategy-column--inventory">
          <section className="strategy-panel">
            <PanelHeading title="Inventario" meta={`${document.tyres.filter((tyre) => tyreUseCount(document, tyre.id) > 0).length} / ${document.tyres.length} neumáticos`} />
            <p className="strategy-inventory-help">Arrastra un neumático a FL/FR/RL/RR o selecciónalo y activa la esquina con teclado. Escape cancela.</p>
            {document.tyres.map((tyre) => (
              <TyreRow
                key={tyre.id}
                tyre={tyre}
                uses={tyreUseCount(document, tyre.id)}
                selected={pickedTyre === tyre.id}
                onPick={() => {
                  setPickedTyre((current) => current === tyre.id ? null : tyre.id);
                  setAnnouncement(pickedTyre === tyre.id ? "Selección cancelada." : `${tyre.id} seleccionado. Elige una esquina.`);
                }}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData("application/x-vantare-tyre", tyre.id);
                  setDraggedTyre(tyre.id);
                  setAnnouncement(`${tyre.id} listo para asignar.`);
                }}
                onDragEnd={() => setDraggedTyre(null)}
              />
            ))}
            <p className="strategy-inventory-total">Identidades físicas: <b>{document.tyres.length}</b></p>
          </section>
          <StrategyManualInputPanel
            document={document}
            mode={manualMode}
            onModeChange={onManualModeChange}
            onCorrectQuick={onCorrectQuick}
            onClearQuick={onClearQuick}
            onCorrectLap={onCorrectLap}
            onClearLap={onClearLap}
          />
          <button className="strategy-manual-inputs__flow-link" type="button" onClick={onEdit}>Editar datos</button>
        </aside>
      </div>

      <p className="strategy-sr-only" aria-live="polite">{announcement}</p>
      <footer className="strategy-action-bar">
        <p><span aria-hidden="true">●</span> {dirty ? "Cambios sin guardar" : "Plan guardado"}</p>
        <div>
          <button type="button" disabled={!canUndo || busy} onClick={onUndo}>Deshacer</button>
          <button type="button" disabled={!canRedo || busy} onClick={onRedo}>Rehacer</button>
          <button
            className="strategy-button strategy-button--secondary"
            type="button"
            onClick={(event) => onCompare(event.currentTarget)}
            disabled={!canCompare}
            title={canCompare ? undefined : "Sin estrategias calculadas que comparar"}
          >Comparar planes</button>
          <button className="strategy-button strategy-button--primary" type="button" onClick={onSave} disabled={!dirty || busy}>Guardar plan</button>
        </div>
      </footer>
    </div>
  );
}

function FlowHeader({ step, titleId, title, description }: { step: number; titleId: string; title: string; description: string }) {
  return (
    <header className="strategy-flow-header">
      <span>0{step}</span>
      <div>
        <p className="strategy-eyebrow">Strategy Planner</p>
        <h1 id={titleId}>{title}</h1>
        <p>{description}</p>
      </div>
    </header>
  );
}

function FlowActions({ onBack, nextLabel, onNext }: { onBack: () => void; nextLabel: string; onNext: () => void }) {
  return (
    <div className="strategy-flow-actions">
      <button className="strategy-button strategy-button--secondary" type="button" onClick={onBack}>
        Atrás
      </button>
      <button className="strategy-button strategy-button--primary" type="button" onClick={onNext}>
        {nextLabel} →
      </button>
    </div>
  );
}

function PanelHeading({ title, meta }: { title: string; meta: string }) {
  return (
    <header className="strategy-panel-heading">
      <h2>{title}</h2>
      <span>{meta}</span>
    </header>
  );
}

const VARIANT_LABELS: Record<StrategyVariant["kind"], { letter: string; title: string }> = {
  fast: { letter: "R", title: "Rápida" },
  robust: { letter: "F", title: "Robusta" },
  conservative: { letter: "C", title: "Conservadora" },
};

const RISK_LABELS: Record<StrategyVariant["risk"], string> = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
};

function StrategyOption({ variant }: { variant: StrategyVariant }) {
  const label = VARIANT_LABELS[variant.kind];
  const spread = variant.total.pessimisticSeconds - variant.total.optimisticSeconds;

  return (
    <article
      className={`strategy-option ${variant.dominated ? "is-dominated" : ""}`}
      data-testid={`strategy-option-${variant.kind}`}
      data-risk={variant.risk}
    >
      <header>
        <div>
          <span>{label.letter}</span>
          <h3>{label.title}</h3>
          {variant.dominated && <b data-testid={`strategy-dominated-${variant.kind}`}>DESCARTADA</b>}
        </div>
        <strong>
          {variant.deltaToFastestSeconds === 0 ? "—" : `+${formatNumber(variant.deltaToFastestSeconds, 1)}s`}
        </strong>
      </header>
      <dl>
        {/* A range, never a single figure: the inputs are estimates. */}
        <div>
          <dt>Tiempo</dt>
          <dd data-testid={`strategy-total-${variant.kind}`}>
            {formatDuration(variant.total.optimisticSeconds)} – {formatDuration(variant.total.pessimisticSeconds)}
          </dd>
        </div>
        <div><dt>Pits</dt><dd>{variant.stops}</dd></div>
        <div><dt>Riesgo</dt><dd>{RISK_LABELS[variant.risk]}</dd></div>
        <div><dt>Margen</dt><dd>{variant.marginLaps} v</dd></div>
      </dl>
      <p>{variant.reasons[0]?.message ?? ""}</p>
      {spread > 0 && (
        <small className="strategy-option__spread">
          Horquilla de {formatNumber(spread, 0)}s según cuánto caiga el ritmo
        </small>
      )}
    </article>
  );
}

/** Formats a race total in hours, minutes and seconds; not a lap time. */
function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(rest).padStart(2, "0")}s`;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function FuelSavePanel({ result, loading, error, document }: {
  result: StrategyManualResult | null;
  loading: boolean;
  error: string;
  document: StrategyEditorDocument;
}) {
  const fuel = result?.fuel.saving;
  const energy = result?.virtualEnergy.saving;
  return (
    <section className="strategy-panel strategy-fuel">
      <PanelHeading title="Ahorro de recursos" meta={loading ? "Calculando" : "Objetivo"} />
      <p>Reducción necesaria por vuelta y stint para eliminar una parada. Fuel y Virtual Energy se calculan por separado.</p>
      {error && <p className="strategy-fuel__error" role="status">{error}</p>}
      <div>
        <article><span>PARADAS</span><b>{result?.pitStopCount ?? "—"}</b><small>{document.stints.length} stints</small></article>
        <article className="is-red">
          <span>FUEL / VUELTA</span>
          <b data-testid="strategy-fuel-save-per-lap">{fuel ? `${formatNumber(fuel.perLap, 2)} L/v` : "—"}</b>
          <small>{fuel?.feasible ? `${formatNumber(fuel.amount, 1)} L totales` : "sin ahorro disponible"}</small>
        </article>
        <article><span>IMPACTO EN RITMO</span><b>Pendiente</b><small>requiere el modelo de ritmo</small></article>
      </div>
      <div className="strategy-fuel__energy">
        <span>VIRTUAL ENERGY / VUELTA</span>
        <b data-testid="strategy-ve-save-per-lap">{energy ? `${formatNumber(energy.perLap, 2)} %/v` : "—"}</b>
        <small>{energy?.feasible ? `${formatNumber(energy.amount, 1)} % total` : "sin ahorro disponible"}</small>
      </div>
      {result && <dl className="strategy-fuel__pit-summary">
        <div><dt>Pérdida por parada</dt><dd>{formatNumber(result.pitLossPerStopSeconds, 1)} s</dd></div>
        <div><dt>Pérdida total en boxes</dt><dd data-testid="strategy-total-pit-loss">{formatNumber(result.totalPitLossSeconds, 1)} s</dd></div>
        <div><dt>Extras</dt><dd>{formatNumber(result.repairSeconds + result.penaltySeconds, 1)} s</dd></div>
        <div><dt>Total plan</dt><dd data-testid="strategy-total-pit-time">{formatNumber(result.totalPitSeconds, 1)} s</dd></div>
      </dl>}
      <div className="strategy-fuel-comparison">
        <span>COMPARATIVA DE PLAN</span>
        <div>{document.stints.map((stint) => <i key={stint.id}>{stint.lapCount}v</i>)}</div>
      </div>
    </section>
  );
}

function StintCard({
  document, stint, result, pitLossPerStopSeconds, index, last, pickedTyre, onDrop, onAssign, onClear,
  onInsert, onDuplicate, onDelete, onMove,
}: {
  document: StrategyEditorDocument; stint: StrategyStint; result?: StrategyManualResult["stints"][number];
  pitLossPerStopSeconds?: number; index: number; last: boolean;
  pickedTyre: string | null;
  onDrop: (event: DragEvent<HTMLButtonElement>, stintId: string, corner: StrategyCorner) => void;
  onAssign: (corner: StrategyCorner) => void; onClear: (corner: StrategyCorner) => void;
  onInsert: (after: boolean) => void; onDuplicate: () => void; onDelete: () => void;
  onMove: (target: number) => void;
}) {
  const range = stintLapRange(document, index);
  return (
    <div className="strategy-stint-wrap">
      <article className="strategy-stint" data-laps={stint.lapCount} data-testid={`strategy-stint-${stint.id}`}>
        <header>
          <div><h3>Stint {index + 1}</h3><span>v.{range.start}–{range.end} · {stint.lapCount}v</span></div>
          <div className="strategy-stint-actions" aria-label={`Acciones del stint ${index + 1}`}>
            <button type="button" onClick={() => onMove(index - 1)} disabled={index === 0} aria-label={`Mover stint ${index + 1} arriba`}>↑</button>
            <button type="button" onClick={() => onMove(index + 1)} disabled={last} aria-label={`Mover stint ${index + 1} abajo`}>↓</button>
            <button type="button" onClick={() => onInsert(false)} aria-label={`Insertar antes del stint ${index + 1}`}>＋↑</button>
            <button type="button" onClick={() => onInsert(true)} aria-label={`Insertar después del stint ${index + 1}`}>＋↓</button>
            <button type="button" onClick={onDuplicate} aria-label={`Duplicar stint ${index + 1}`}>⧉</button>
            <button type="button" onClick={onDelete} aria-label={`Eliminar stint ${index + 1}`}>×</button>
          </div>
        </header>
        <div className="strategy-tyre-grid">
          {STRATEGY_CORNERS.map((corner) => {
            const tyreId = stint.assignments[corner];
            const tyre = document.tyres.find((item) => item.id === tyreId);
            return (
              <div key={corner} className={`strategy-tyre-slot ${pickedTyre ? "is-ready" : ""}`}>
                <button
                  type="button"
                  data-testid={`strategy-slot-${stint.id}-${corner}`}
                  onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
                  onDrop={(event) => onDrop(event, stint.id, corner)}
                  onClick={() => onAssign(corner)}
                  aria-label={`${cornerLabel(corner)} del stint ${index + 1}: ${tyreId ?? "sin neumático"}${pickedTyre ? `. Asignar ${pickedTyre}` : ""}`}
                >
                  <span>{cornerLabel(corner)}</span>
                  <b>{tyreId ?? "—"}</b>
                  <small>{tyre ? `${formatCondition(tyre.condition)} · ${tyre.compound}` : "Vacío"}</small>
                  {/* The bar uses the midpoint; the text above carries the real range. */}
                  <i><em style={{ width: `${tyre ? conditionMidpoint(tyre.condition) : 0}%` }} /></i>
                </button>
                {tyreId && <button type="button" className="strategy-slot-clear" onClick={() => onClear(corner)} aria-label={`Quitar ${tyreId} de ${cornerLabel(corner)} del stint ${index + 1}`}>×</button>}
              </div>
            );
          })}
        </div>
        <footer>
          <span>Fuel <b>{result ? `${formatNumber(result.fuelNeed, 1)} L` : `${stint.fuelLitres} L`}</b></span>
          <span>VE <b>{result ? `${formatNumber(result.virtualEnergyNeed, 1)} %` : "—"}</b></span>
          <span>Stint <b>{stint.lapCount}v</b></span>
          <span>Ritmo <b>{result ? formatLapTime(result.averageLapSeconds) : stint.pace}</b></span>
          <span>Desgaste <b>{result ? `${formatNumber(result.tyreWearPercent, 1)} %` : "—"}</b></span>
          <span className="strategy-fuel-save-tag">FUEL-SAVE {result && result.fuelSavingAmount > 0 ? `${formatNumber(result.fuelSavingAmount, 1)} L` : "OFF"}</span>
          <div className="strategy-spark" aria-label="Tendencia visual de ejemplo"><i /><i /></div>
        </footer>
      </article>
      {!last && <div className="strategy-pit-separator"><span>● PIT STOP · {formatNumber(pitLossPerStopSeconds ?? 22.4, 1)}s · FUEL + TYRES</span></div>}
    </div>
  );
}

function formatNumber(value: number, digits: number) {
  return value.toFixed(digits);
}

function formatLapTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(1).padStart(4, "0")}`;
}

function TyreRow({ tyre, uses, selected, onPick, onDragStart, onDragEnd }: {
  tyre: StrategyTyre; uses: number; selected: boolean; onPick: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void; onDragEnd: () => void;
}) {
  return (
    <button
      className={`strategy-tyre-row ${uses > 0 ? "is-mounted" : ""} ${selected ? "is-selected" : ""}`}
      type="button"
      draggable
      data-testid={`strategy-tyre-${tyre.id}`}
      aria-pressed={selected}
      onClick={onPick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className={`strategy-compound is-${tyre.compound}`}>● {tyre.compound.toUpperCase()}</span>
      <div><b>{tyre.id}</b><small>{uses} stint{uses === 1 ? "" : "s"}{tyre.lockedCorner ? ` · ${cornerLabel(tyre.lockedCorner)}` : " · libre"}</small></div>
      <strong
        data-exact={isConditionExact(tyre.condition) ? "true" : undefined}
        title={`${tyre.condition.confidence.level} · ${tyre.condition.provenance.kind}`}
      >{formatCondition(tyre.condition)}</strong>
    </button>
  );
}

function ComparisonDialog({ strategies, onClose }: {
  strategies: readonly StrategyVariant[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="strategy-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section ref={dialogRef} className="strategy-dialog" role="dialog" aria-modal="true" aria-label="Comparar estrategias">
        <header>
          <div><p className="strategy-eyebrow">Comparación</p><h2>Comparar estrategias</h2></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Cerrar comparación">×</button>
        </header>
        {strategies.length > 0 ? (
          <div className="strategy-comparison-grid" data-columns="5">
            <span>Plan</span><span>Tiempo</span><span>Diferencia</span><span>Riesgo</span><span>Paradas</span>
            {strategies.map((variant) => (
              <Fragment key={variant.kind}>
                <b>
                  {VARIANT_LABELS[variant.kind].title}
                  {variant.dominated && <em className="strategy-comparison-grid__flag"> descartada</em>}
                </b>
                <strong>
                  {formatDuration(variant.total.optimisticSeconds)} – {formatDuration(variant.total.pessimisticSeconds)}
                </strong>
                <span>
                  {variant.deltaToFastestSeconds === 0 ? "—" : `+${formatNumber(variant.deltaToFastestSeconds, 1)}s`}
                </span>
                <em>{RISK_LABELS[variant.risk]}</em>
                <span>{variant.stops}</span>
              </Fragment>
            ))}
          </div>
        ) : (
          <p className="strategy-dialog__note" data-testid="strategy-comparison-empty">
            No hay estrategias calculadas que comparar.
          </p>
        )}
        <p className="strategy-dialog__note">
          Los tiempos son horquillas, no cifras: dependen de cuánto caiga el ritmo y de que el consumo
          se cumpla. Una estrategia descartada es la que otra iguala o mejora en tiempo y en margen.
        </p>
      </section>
    </div>
  );
}
