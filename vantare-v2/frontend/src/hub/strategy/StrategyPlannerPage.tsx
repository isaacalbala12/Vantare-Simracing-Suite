import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import "./strategy-planner.css";

type PlannerScreen = "gallery" | "entry" | "review" | "workspace";
type GalleryState = "ready" | "loading" | "empty" | "error";
type WorkspacePanel = "plans" | "stints" | "inventory";

type StrategyPlannerPageProps = {
  demo?: boolean;
  initialScreen?: PlannerScreen;
  galleryState?: GalleryState;
};

const PANELS: Array<{ id: WorkspacePanel; label: string }> = [
  { id: "plans", label: "Estrategias" },
  { id: "stints", label: "Stints" },
  { id: "inventory", label: "Inventario" },
];

const STINTS = [
  { id: 1, laps: "v.1–17 · 17v", compound: "MEDIUM", fuel: "82 L", pace: "2:18.4", wear: [78, 78, 77, 77] },
  { id: 2, laps: "v.18–39 · 22v", compound: "HARD", fuel: "96 L", pace: "2:19.1", wear: [92, 92, 91, 91] },
  { id: 3, laps: "v.40–58 · 19v", compound: "HARD", fuel: "85 L", pace: "2:19.4", wear: [88, 88, 87, 87] },
];

const TYRES = [
  { id: "M-01", compound: "MEDIUM", status: "Montado", life: 78 },
  { id: "H-02", compound: "HARD", status: "Libre", life: 100 },
  { id: "H-03", compound: "HARD", status: "Libre", life: 100 },
  { id: "S-04", compound: "SOFT", status: "Libre", life: 100 },
  { id: "S-05", compound: "SOFT", status: "Sesión anterior", life: 72, prior: true },
  { id: "M-06", compound: "MEDIUM", status: "Sesión anterior", life: 84, prior: true },
  { id: "H-07", compound: "HARD", status: "Sesión anterior", life: 90, prior: true },
  { id: "M-08", compound: "MEDIUM", status: "Sesión anterior", life: 81, prior: true },
];

export function StrategyPlannerPage({
  demo = false,
  initialScreen = "gallery",
  galleryState = demo ? "ready" : "empty",
}: StrategyPlannerPageProps) {
  const [screen, setScreen] = useState<PlannerScreen>(initialScreen);
  const [activePanel, setActivePanel] = useState<WorkspacePanel>("stints");
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [entryMode, setEntryMode] = useState<"manual" | "telemetry">("manual");
  const [planName, setPlanName] = useState("6h Spa · Hypercar");
  const backgroundRef = useRef<HTMLDivElement>(null);
  const comparisonOpenerRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

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
          onOpen={() => setScreen("workspace")}
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
          onContinue={() => setScreen("workspace")}
        />
      )}

      {screen === "workspace" && (
        <Workspace
          titleId={titleId}
          planName={planName}
          activePanel={activePanel}
          onSelectPanel={selectPanel}
          onPanelKey={handlePanelKey}
          onBack={() => setScreen("gallery")}
          onCompare={openComparison}
          onEdit={() => setScreen("entry")}
          onSave={() => {
            setSaveMessage(demo
              ? "Plan guardado en esta sesión de demostración. No se ha escrito ningún dato persistente."
              : "Borrador preparado en esta sesión. La persistencia productiva se conectará en su corte propietario.");
          }}
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

function Workspace({ titleId, planName, activePanel, onSelectPanel, onPanelKey, onBack, onCompare, onEdit, onSave }: {
  titleId: string; planName: string; activePanel: WorkspacePanel;
  onSelectPanel: (panel: WorkspacePanel) => void;
  onPanelKey: (event: KeyboardEvent<HTMLButtonElement>, panel: WorkspacePanel) => void;
  onBack: () => void; onCompare: (opener: HTMLButtonElement) => void; onEdit: () => void; onSave: () => void;
}) {
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
            <StrategyOption label="A" title="Conservadora" delta="−0.8s" active compounds={["M", "H", "H", "S"]} summary="Fuel-save ligero. Margen amplio en cada stint y carga controlada." />
            <StrategyOption label="B" title="Agresiva" delta="+2.4s" compounds={["S", "M", "S", "S"]} summary="Tres sets de Soft y ahorro intensivo en los stints centrales." />
            <StrategyOption label="C" title="Segura" delta="+5.1s" compounds={["H", "H", "H", "M"]} summary="Sin fuel-save. Máxima consistencia con margen de combustible." />
          </section>
          <FuelSavePanel />
        </aside>

        <main aria-label="Stints" data-compact-active={activePanel === "stints"} data-testid="strategy-column-stints" className="strategy-column strategy-column--stints strategy-panel">
          <div className="strategy-plan-heading"><PanelHeading title="Plan de carrera" meta="4 stints · 78 vueltas · 3 paradas · 6h 04m" /><div><button type="button" onClick={(event) => onCompare(event.currentTarget)}>Comparar</button><button type="button" disabled title="La edición de stints se habilitará en el siguiente corte">＋ Stint</button></div></div>
          <div className="strategy-legend"><span><i className="is-green" /> Desgaste cae</span><span><i /> Ritmo previsto</span></div>
          <div className="strategy-stint-columns" aria-hidden="true"><span>STINT</span><span>FRONT LEFT</span><span>FRONT RIGHT</span><span>REAR LEFT</span><span>REAR RIGHT</span></div>
          {STINTS.map((stint, index) => <StintCard key={stint.id} stint={stint} last={index === STINTS.length - 1} />)}
        </main>

        <aside aria-label="Inventario" data-compact-active={activePanel === "inventory"} data-testid="strategy-column-inventory" className="strategy-column strategy-column--inventory">
          <section className="strategy-panel"><PanelHeading title="Inventario" meta="4 / 8 neumáticos" />{TYRES.map((tyre, index) => <div key={tyre.id}>{index === 4 && <div className="strategy-inventory-divider"><span>SESIÓN ANTERIOR</span><small>4 usados</small></div>}<TyreRow {...tyre} /></div>)}<p className="strategy-inventory-total">Disponibles: <b>1 S · 1 M · 2 H</b></p></section>
          <section className="strategy-panel strategy-manual-summary"><PanelHeading title="Entrada manual" meta="Resumen" /><dl><div><dt>Duración</dt><dd>6 h</dd></div><div><dt>Vueltas</dt><dd>78</dd></div><div><dt>Fuel</dt><dd>4,8 L/v</dd></div><div><dt>Neumáticos</dt><dd>8</dd></div></dl><button type="button" onClick={onEdit}>Editar datos</button></section>
        </aside>
      </div>

      <footer className="strategy-action-bar"><p><span aria-hidden="true">●</span> Cambios de esta sesión</p><div><button className="strategy-button strategy-button--secondary" type="button" onClick={(event) => onCompare(event.currentTarget)}>Comparar planes</button><button className="strategy-button strategy-button--primary" type="button" onClick={onSave}>Guardar plan</button></div></footer>
    </div>
  );
}

function FlowHeader({ step, titleId, title, description }: { step: number; titleId: string; title: string; description: string }) {
  return <header className="strategy-flow-header"><span>0{step}</span><div><p className="strategy-eyebrow">Strategy Planner</p><h1 id={titleId}>{title}</h1><p>{description}</p></div></header>;
}

function FlowActions({ onBack, nextLabel, onNext }: { onBack: () => void; nextLabel: string; onNext: () => void }) {
  return <div className="strategy-flow-actions"><button className="strategy-button strategy-button--secondary" type="button" onClick={onBack}>Atrás</button><button className="strategy-button strategy-button--primary" type="button" onClick={onNext}>{nextLabel} →</button></div>;
}

function PanelHeading({ title, meta }: { title: string; meta: string }) {
  return <header className="strategy-panel-heading"><h2>{title}</h2><span>{meta}</span></header>;
}

function StrategyOption({ label, title, delta, active = false, compounds, summary }: { label: string; title: string; delta: string; active?: boolean; compounds: string[]; summary: string }) {
  return <article className={`strategy-option ${active ? "is-active" : ""}`}><header><div><span>{label}</span><h3>{title}</h3>{active && <b>ACTIVA</b>}</div><strong>{delta}</strong></header><div className="strategy-compounds">{compounds.map((compound, index) => <span key={`${compound}-${index}`} className={`is-${compound.toLowerCase()}`}>● {compound}</span>)}</div><dl><div><dt>Tiempo</dt><dd>6h 04m</dd></div><div><dt>Pits</dt><dd>3</dd></div><div><dt>Sets</dt><dd>2M · 2H</dd></div><div><dt>Ahorro</dt><dd>+1.0 v</dd></div></dl><p>{summary}</p></article>;
}

function FuelSavePanel() {
  return <section className="strategy-panel strategy-fuel"><PanelHeading title="Ahorro de combustible" meta="Objetivo" /><p>Vueltas a ahorrar por stint para evitar un repostaje final.</p><div><article><span>ESTADO</span><b>4 / 3</b><small>stints / pits</small></article><article className="is-red"><span>AHORRO / STINT</span><b>+2.0 v</b><small>ejemplo</small></article><article className="is-green"><span>IMPACTO</span><b>−18.4s</b><small>estimado</small></article></div><div className="strategy-fuel-comparison"><span>COMPARATIVA DE PLAN</span><div><i>17v</i><i>22v</i><i>19v</i><i>20v</i></div></div></section>;
}

function StintCard({ stint, last }: { stint: (typeof STINTS)[number]; last: boolean }) {
  return <div className="strategy-stint-wrap"><article className="strategy-stint"><header><div><h3>Stint {stint.id}</h3><span>{stint.laps}</span></div><span className={`strategy-compound is-${stint.compound.toLowerCase()}`}>● {stint.compound}</span></header><div className="strategy-tyre-grid">{["FL", "FR", "RL", "RR"].map((corner, index) => <div key={corner}><span>{corner}</span><b>{stint.wear[index]}%</b><i><em style={{ width: `${stint.wear[index]}%` }} /></i></div>)}</div><footer><span>Fuel <b>{stint.fuel}</b></span><span>Stint <b>{stint.laps.split(" · ")[1]}</b></span><span>Ritmo <b>{stint.pace}</b></span><span>Deg. pico <b>demo</b></span><span className="strategy-fuel-save-tag">FUEL-SAVE {stint.id === 1 ? "OFF" : "ON"}</span><div className="strategy-spark" aria-label="Tendencia visual de ejemplo"><i /><i /></div></footer></article>{!last && <div className="strategy-pit-separator"><span>● PIT STOP · 22.4s · FUEL + TYRES</span></div>}</div>;
}

function TyreRow({ id, compound, status, life, prior = false }: { id: string; compound: string; status: string; life: number; prior?: boolean }) {
  return <article className={`strategy-tyre-row ${status === "Montado" ? "is-mounted" : ""} ${prior ? "is-prior" : ""}`}><span className={`strategy-compound is-${compound.toLowerCase()}`}>● {compound}</span><div><b>{id}</b><small>{status}</small></div><strong>{life}%</strong></article>;
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

  return <div className="strategy-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section ref={dialogRef} className="strategy-dialog" role="dialog" aria-modal="true" aria-label="Comparar estrategias"><header><div><p className="strategy-eyebrow">Comparación</p><h2>Comparar estrategias</h2></div><button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Cerrar comparación">×</button></header><div className="strategy-comparison-grid"><span>Plan</span><span>Tiempo</span><span>Riesgo</span><span>Paradas</span><b>Conservadora</b><strong>6h 04m 12s</strong><em>Bajo</em><span>3</span><b>Agresiva</b><strong>+2.4s</strong><em>Medio</em><span>3</span><b>Segura</b><strong>+5.1s</strong><em>Bajo</em><span>3</span></div><p className="strategy-dialog__note">Comparación visual con datos de ejemplo; el optimizador avanzado no forma parte de STR-07.</p></section></div>;
}
