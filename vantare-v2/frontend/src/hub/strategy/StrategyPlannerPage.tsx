import { Fragment, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type DragEvent, type KeyboardEvent } from "react";
import {
  appendStint,
  assignTyre,
  clearTyreAssignment,
  cornerLabel,
  deleteStint,
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
import type { StrategyStore } from "../../strategy/strategy-store";
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
import { StrategyManualInputPanel } from "./StrategyManualInputPanel";
import "./strategy-planner.css";

type PlannerScreen = "gallery" | "entry" | "review" | "workspace";
type GalleryState = "ready" | "loading" | "empty" | "error";
type WorkspacePanel = "plans" | "stints" | "inventory";

type StrategyPlannerPageProps = {
  demo?: boolean;
  initialScreen?: PlannerScreen;
  galleryState?: GalleryState;
  strategyStore?: StrategyStore<StrategyEditorDocument>;
  runtimeFactory?: () => StrategyEditorRuntime;
  manualClient?: StrategyManualClient;
};

const PANELS: Array<{ id: WorkspacePanel; label: string }> = [
  { id: "plans", label: "Estrategias" },
  { id: "stints", label: "Stints" },
  { id: "inventory", label: "Inventario" },
];

const STRATEGIES = [
  {
    label: "A",
    title: "Conservadora",
    delta: "−0.8s",
    time: "6h 04m 12.0s",
    risk: "Bajo",
    pits: 3,
    compounds: ["M", "H", "H", "S"],
    fuelSave: "+1.0 v/stint",
    summary: "Fuel-save ligero. Un stint Medium, dos Hard y uno Soft con carga controlada.",
    active: true,
  },
  {
    label: "B",
    title: "Agresiva",
    delta: "+2.4s",
    time: "6h 04m 15.2s",
    risk: "Medio",
    pits: 3,
    compounds: ["S", "M", "S", "S"],
    fuelSave: "+3.0 v/stint",
    summary: "Tres stints Soft, uno Medium y ahorro intensivo en los stints centrales.",
    active: false,
  },
  {
    label: "C",
    title: "Segura",
    delta: "+5.1s",
    time: "6h 04m 17.9s",
    risk: "Bajo",
    pits: 3,
    compounds: ["H", "H", "H", "M"],
    fuelSave: "0 v/stint",
    summary: "Tres stints Hard y uno Medium, sin fuel-save y con margen de combustible.",
    active: false,
  },
] as const;

export function StrategyPlannerPage({
  demo = false,
  initialScreen = "gallery",
  galleryState = demo ? "ready" : "empty",
  strategyStore,
  runtimeFactory = createWailsStrategyEditorRuntime,
  manualClient,
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
  const loadRef = useRef<{ store: StrategyStore<StrategyEditorDocument>; promise: Promise<void> } | null>(null);
  const store = strategyStore ?? ownedRuntime?.store;
  if (!store) throw new Error("Strategy editor store is required");
  const storeSnapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [screen, setScreen] = useState<PlannerScreen>(initialScreen);
  const [activePanel, setActivePanel] = useState<WorkspacePanel>("stints");
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [entryMode, setEntryMode] = useState<"manual" | "telemetry">("manual");
  const [planName, setPlanName] = useState("6h Spa · Hypercar");
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
          state={galleryState}
          demo={demo}
          onCreate={() => setScreen("entry")}
          onOpen={enterWorkspace}
          onReview={() => setScreen("review")}
        />
      )}

      {screen === "entry" && (
        <EntryScreen
          titleId={titleId}
          mode={entryMode}
          planName={planName}
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
        <ComparisonDialog onClose={closeComparison} />
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
  demo,
  onCreate,
  onOpen,
  onReview,
}: {
  titleId: string;
  state: GalleryState;
  demo: boolean;
  onCreate: () => void;
  onOpen: () => void;
  onReview: () => void;
}) {
  return (
    <div className="strategy-screen strategy-gallery">
      <header className="strategy-page-header">
        <div>
          <p className="strategy-eyebrow">Strategy Planner</p>
          <h1 id={titleId}>Mis planes</h1>
          <p>Organiza planes privados por circuito y vuelve al último workspace.</p>
        </div>
        <button className="strategy-button strategy-button--primary" type="button" onClick={onCreate}>
          <span aria-hidden="true">＋</span> Crear plan
        </button>
      </header>

      {state === "loading" && <div className="strategy-state" role="status">Cargando planes…</div>}
      {state === "error" && <div className="strategy-state strategy-state--error" role="alert">No se pudo abrir la galería. Reintenta cuando el repositorio local esté disponible.</div>}
      {state === "empty" && (
        <div className="strategy-state strategy-state--empty">
          <span className="strategy-state__icon" aria-hidden="true">◇</span>
          <h2>Todavía no tienes planes guardados</h2>
          <p>Crea un plan manual o revisa una sesión de telemetría cuando esa conexión esté disponible.</p>
          <button className="strategy-button strategy-button--primary" type="button" onClick={onCreate}>Crear el primero</button>
        </div>
      )}
      {state === "ready" && demo && (
        <div className="strategy-gallery__grid">
          <article className="strategy-plan-tile strategy-plan-tile--active">
            <div className="strategy-plan-tile__visual" aria-hidden="true">
              <span /><span /><span />
            </div>
            <div className="strategy-plan-tile__body">
              <div className="strategy-plan-tile__meta"><span>SPA-FRANCORCHAMPS</span><span>DEMO</span></div>
              <h2>6h Spa · Hypercar</h2>
              <p>4 stints · 3 paradas · seco</p>
              <button className="strategy-button strategy-button--secondary" type="button" onClick={onOpen}>Abrir workspace</button>
            </div>
          </article>
          <article className="strategy-plan-tile">
            <div className="strategy-plan-tile__visual strategy-plan-tile__visual--muted" aria-hidden="true"><span /><span /></div>
            <div className="strategy-plan-tile__body">
              <div className="strategy-plan-tile__meta"><span>LE MANS</span><span>BORRADOR</span></div>
              <h2>24h Le Mans · LMGT3</h2>
              <p>Entrada incompleta · sin cálculo</p>
              <button className="strategy-button strategy-button--secondary" type="button" onClick={onReview}>Revisar borrador</button>
            </div>
          </article>
          <button className="strategy-plan-tile strategy-plan-tile--new" type="button" onClick={onCreate}>
            <span aria-hidden="true">＋</span>
            <strong>Nuevo plan</strong>
            <small>Entrada manual o telemetría</small>
          </button>
        </div>
      )}
    </div>
  );
}

function EntryScreen({
  titleId,
  mode,
  planName,
  onModeChange,
  onNameChange,
  onBack,
  onContinue,
}: {
  titleId: string;
  mode: "manual" | "telemetry";
  planName: string;
  onModeChange: (mode: "manual" | "telemetry") => void;
  onNameChange: (name: string) => void;
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
            <label className="strategy-field">Duración<input type="number" defaultValue="6" min="1" /><span>horas</span></label>
            <label className="strategy-field">Vueltas previstas<input type="number" defaultValue="78" min="1" /><span>vueltas</span></label>
            <label className="strategy-field">Capacidad de tanque<input type="number" defaultValue="100" min="1" /><span>litros</span></label>
            <label className="strategy-field">Consumo medio<input type="number" defaultValue="4.8" min="0" step="0.1" /><span>L/vuelta</span></label>
            <label className="strategy-field">Neumáticos máximos<input type="number" defaultValue="8" min="1" /><span>individuales</span></label>
          </form>
        )}
      </div>
      <FlowActions onBack={onBack} nextLabel="Continuar a revisión" onNext={onContinue} />
    </div>
  );
}

function ReviewScreen({ titleId, planName, mode, onBack, onContinue }: { titleId: string; planName: string; mode: string; onBack: () => void; onContinue: () => void }) {
  const rows = [
    ["Plan", planName], ["Fuente", mode === "manual" ? "Entrada manual" : "Telemetría pendiente"],
    ["Carrera", "6 horas · 78 vueltas previstas"], ["Recursos", "100 L · 4,8 L/vuelta · 8 neumáticos individuales"],
  ];
  return (
    <div className="strategy-screen strategy-flow-screen">
      <FlowHeader step={2} titleId={titleId} title="Revisar datos" description="Confirma los valores que formarán el workspace." />
      <div className="strategy-flow-card strategy-review">
        <div className="strategy-review__notice"><span aria-hidden="true">i</span><p>Estos valores son de demostración. No proceden de una sesión live ni constituyen una estrategia calculada.</p></div>
        <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </div>
      <FlowActions onBack={onBack} nextLabel="Crear workspace" onNext={onContinue} />
    </div>
  );
}

function Workspace({
  titleId, planName, document, dirty, canUndo, canRedo, busy, error,
  manualResult, manualLoading, manualError, manualMode,
  activePanel, onSelectPanel, onPanelKey, onBack, onCompare, onEdit,
  onManualModeChange, onCorrectQuick, onClearQuick, onCorrectLap, onClearLap,
  onAppend, onInsert, onDuplicate, onDelete, onMove, onAssign, onClear,
  onUndo, onRedo, onSave,
}: {
  titleId: string; planName: string; document: StrategyEditorDocument;
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
        <div className="strategy-workspace__context"><span>● DRY</span><b>{planName}</b><i /><small>PRÓX. <b>en 2h 14m</b></small><i /><small>PLANES <b>3</b></small><em>DEMO</em></div>
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
            <PanelHeading title="Estrategias" meta="3 planes · 1 activo" />
            {STRATEGIES.map((strategy) => (
              <StrategyOption key={strategy.label} strategy={strategy} />
            ))}
          </section>
          <FuelSavePanel result={manualResult} loading={manualLoading} error={manualError} document={document} />
        </aside>

        <main aria-label="Stints" data-compact-active={activePanel === "stints"} data-testid="strategy-column-stints" className="strategy-column strategy-column--stints strategy-panel">
          <div className="strategy-plan-heading"><PanelHeading title="Plan de carrera" meta={`${document.stints.length} stints · ${totalLaps} vueltas · ${Math.max(0, document.stints.length - 1)} paradas · 6h 04m`} /><div><button type="button" onClick={(event) => onCompare(event.currentTarget)}>Comparar</button><button type="button" onClick={onAppend}>＋ Stint</button></div></div>
          <div className="strategy-legend"><span><i className="is-green" /> Desgaste cae</span><span><i /> Ritmo previsto</span></div>
          <div className="strategy-stint-columns" aria-hidden="true"><span>STINT</span><span>FRONT LEFT</span><span>FRONT RIGHT</span><span>REAR LEFT</span><span>REAR RIGHT</span></div>
          {error && <div className="strategy-editor-error" role="alert">{error}</div>}
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
          <button className="strategy-button strategy-button--secondary" type="button" onClick={(event) => onCompare(event.currentTarget)}>Comparar planes</button>
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

function StrategyOption({ strategy }: { strategy: (typeof STRATEGIES)[number] }) {
  const compoundUsage = summarizeCompoundUsage(strategy.compounds);

  return (
    <article
      className={`strategy-option ${strategy.active ? "is-active" : ""}`}
      data-testid={`strategy-option-${strategy.label}`}
    >
      <header>
        <div>
          <span>{strategy.label}</span>
          <h3>{strategy.title}</h3>
          {strategy.active && <b>ACTIVA</b>}
        </div>
        <strong>{strategy.delta}</strong>
      </header>
      <div className="strategy-compounds">
        {strategy.compounds.map((compound, index) => (
          <span
            key={`${compound}-${index}`}
            className={`is-${compound.toLowerCase()}`}
            data-compound={compound}
          >
            ● {compound}
          </span>
        ))}
      </div>
      <dl>
        <div><dt>Tiempo</dt><dd>{strategy.time}</dd></div>
        <div><dt>Pits</dt><dd>{strategy.pits}</dd></div>
        <div><dt>Stints</dt><dd data-testid="strategy-option-usage">{compoundUsage}</dd></div>
        <div><dt>Ahorro</dt><dd>{strategy.fuelSave}</dd></div>
      </dl>
      <p>{strategy.summary}</p>
    </article>
  );
}

function summarizeCompoundUsage(compounds: readonly string[]) {
  const counts = new Map<string, number>();
  for (const compound of compounds) counts.set(compound, (counts.get(compound) ?? 0) + 1);
  return Array.from(counts, ([compound, count]) => `${count}${compound}`).join(" · ");
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
                  <small>{tyre ? `${tyre.remainingPercent}% · ${tyre.compound}` : "Vacío"}</small>
                  <i><em style={{ width: `${tyre?.remainingPercent ?? 0}%` }} /></i>
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
      <strong>{tyre.remainingPercent}%</strong>
    </button>
  );
}

function ComparisonDialog({ onClose }: { onClose: () => void }) {
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
        <div className="strategy-comparison-grid">
          <span>Plan</span><span>Tiempo</span><span>Riesgo</span><span>Paradas</span>
          {STRATEGIES.map((strategy) => (
            <Fragment key={strategy.label}>
              <b>{strategy.title}</b>
              <strong>{strategy.time}</strong>
              <em>{strategy.risk}</em>
              <span>{strategy.pits}</span>
            </Fragment>
          ))}
        </div>
        <p className="strategy-dialog__note">
          Comparación visual con datos de ejemplo; el optimizador avanzado no forma parte de STR-07.
        </p>
      </section>
    </div>
  );
}
