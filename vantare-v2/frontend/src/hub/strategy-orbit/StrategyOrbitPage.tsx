import {
  Fragment,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nProvider";
import {
  AvailabilityBoard,
  Button,
  Chip,
  ConfirmDialog,
  CornerSlot,
  Donut,
  Featured,
  Field,
  HorizontalTimeline,
  Input,
  ListRow,
  Menu,
  Monogram,
  Note,
  Seg,
  Select,
  StateChip,
  StatRow,
  StatTile,
  Surface,
  TyreItem,
  UnderlineTabs,
  useToast,
  type AvailRange,
  type DonutSlice,
  type TimelineBlock,
  type TyreView,
} from "../../ui/orbit";
import { formatMessage } from "../orbit/format-message";
import { useHubSuspendBlocker } from "../hub-suspend-guard";
import { useOrbitSlot } from "../orbit/use-orbit-slot";
import { useCalendarStarts } from "../orbit/use-calendar-starts";
import { formatStartTime } from "../orbit/next-starts";
import type { RaceStart } from "../orbit/race-starts";
import type { RaceSeries } from "../../calendar/calendar-types";
import {
  createWailsStrategyEditorRuntime,
  openOrCreateStrategyEditor,
  type StrategyEditorRuntime,
} from "../../strategy/strategy-editor-store";
import type { StrategyTyre } from "../../strategy/strategy-editor";
import { assertPlannable, StrategyTyreError, type StrategyCorner } from "../../strategy/strategy-tyre";
import {
  calculateStrategyOrbit,
  createStrategyOrbitApplicationClient,
  subscribeToStrategyRoster,
  type StrategyRoster,
} from "./strategy-orbit-bridge";
import {
  activeEventOf,
  createCustomEvent,
  createEventFromSeries,
  eventFromRoster,
  eventsByRecency,
  freeEventId,
  initialsOf,
  isStrategyEventsReadOnly,
  lastOpenedEventOf,
  newDriver,
  openEvent,
  patchEvent,
  readLegacyStrategyState,
  readStrategyEvents,
  removeEvent,
  rosterEventId,
  toStrategyEvent,
  upsertEvent,
  writeStrategyEvents,
  DRIVER_COLORS,
  type StrategyEventRecord,
  type StrategyEventsState,
  type StrategyFillMode,
  type StrategyTeamMode,
} from "./strategy-events-store";
import {
  commitOrbitLegacyMigration,
  previewOrbitLegacyMigration,
  rollbackOrbitLegacyMigration,
  type PreparedOrbitLegacyMigration,
} from "./strategy-orbit-migration";
import type {
  StrategyApplicationClient,
  StrategyLegacyMigrationPreviewV1,
  StrategyOrbitCalculationResultV1,
  StrategyPlanningInputFieldV2,
} from "../../strategy/strategy-application-client";
import { StrategyApplicationError } from "../../strategy/strategy-application-client";
import {
  buildRecommendedEvents,
  type RecommendedEvent,
} from "./strategy-recommended";
import { exportStrategyPackage } from "../../strategy/strategy-transfer";
import {
  STRATEGY_ORBIT_REVISION_CONTRACT_V1,
  activateOrbitRevision,
  loadOrbitLifecycle,
  orbitLifecycleIdentity,
  sameRevision,
  saveOrbitRevision,
  type OrbitLifecycleState,
  type StrategyOrbitRevisionPayloadV1,
} from "./strategy-orbit-lifecycle";
import {
  addAvailability,
  AVAILABILITY_FROM,
  AVAILABILITY_TO,
  clockTime,
  distributionView,
  hhmm,
  lapTime,
  orbitCalculationInput,
  parseHhmm,
  stintClock,
  tyreCondition,
  tyreUses,
  type AvailabilitySegment,
  type AvailabilityState,
  type OrbitCorner,
  type StrategyDriver,
  type StrategyVariant,
} from "./strategy-orbit-model";
import {
  loadStrategySessionCatalog,
  persistStrategyPlanningOverride,
  persistStrategySessionSelection,
  refreshStrategyPlanningInputs,
  selectedCombination,
  selectedSessions,
  type StrategySessionCatalogView,
  usableSessionCombinations,
} from "./strategy-session-selection";
import { strategyEcoProvenance, strategyInputProvenance, type StrategyInputProvenanceView } from "./strategy-input-provenance";
import {
  calendarSessionCombinations,
  calendarSessionLayouts,
} from "./strategy-calendar-selection";
import { StrategyWeatherPanel } from "./StrategyWeatherPanel";
import { StrategyValidatedExamplesPanel, type ValidatedExamplesViewState } from "./StrategyValidatedExamplesPanel";
import { StrategyColdStartBanner } from "./StrategyColdStartBanner";
import { StrategyReferencePanel } from "./StrategyReferencePanel";
import { StrategyAnalysisPanel } from "./StrategyAnalysisPanel";
import { loadValidatedExamples } from "./strategy-validated-examples";
import { EMPTY_WEATHER_SCENARIOS, persistStrategyWeatherScenarios, selectedWeatherScenarios } from "./strategy-weather-scenarios";
import "../../styles/orbit-strategy.css";

/** Hueco que la shell reserva para la columna de Estrategia (briefing 07). */
export const STRATEGY_CONTEXT_SLOT_ID = "orbit-strategy-context-slot";

type StrategyTab = "overview" | "analysis" | "strategies" | "availability";
/** Camino elegido en el último paso del asistente (`00-decisiones.md`, D-W4-2). */
type PickerPath = "none" | "series";

type VisibleApplicationFailure = {
  readonly message: string;
  readonly code?: string;
  readonly field?: string;
};

type OrbitLifecycleView = {
  readonly status: "idle" | "loading" | "ready" | "busy" | "error";
  readonly state?: OrbitLifecycleState;
  readonly failure?: VisibleApplicationFailure;
};

function visibleApplicationFailure(error: unknown): VisibleApplicationFailure {
  if (error instanceof StrategyApplicationError) {
    return { message: error.message, code: error.code, field: error.field };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}

function inputReasonLabel(reason: string | undefined, t: (key: string) => string): string {
  if (!reason) return t("strategy.inputs.reason.unavailable");
  const known = new Set([
    "manual_input_required", "missing_fuel_consumption", "missing_virtual_energy_consumption",
    "missing_fuel_consumption_for_climate_bucket", "missing_virtual_energy_consumption_for_climate_bucket",
    "missing_combined_stint_pace_curve", "missing_representative_pace", "missing_tyre_degradation",
    "missing_saving_cost", "combined_only", "no_classified_complete_laps_in_climate_bucket",
    "no_clean_complete_laps_for_representative_pace", "no_completed_laps_for_representative_pace",
    "no_reliable_lap_time_for_representative_pace", "no_stable_climate_bucket_for_representative_pace",
  ]);
  return known.has(reason) ? t(`strategy.inputs.reason.${reason}`) : reason.replaceAll("_", " ");
}

function InputProvenanceChip({ view, t }: { view: StrategyInputProvenanceView; t: (key: string) => string }) {
  const confidence = view.confidence;
  const range = confidence?.rangeLower !== undefined && confidence.rangeUpper !== undefined
    ? `${confidence.rangeLower}–${confidence.rangeUpper}`
    : t("strategy.inputs.noRange");
  const tooltip = view.kind === "derived"
    ? formatMessage(t("strategy.inputs.tooltip.derived"), { n: confidence?.sampleSize ?? 0, range })
    : view.kind === "missing"
      ? formatMessage(t("strategy.inputs.tooltip.missing"), { reason: inputReasonLabel(view.reason, t) })
      : t(`strategy.inputs.tooltip.${view.kind}`);
  return (
    <span
      aria-label={`${t(`strategy.inputs.chip.${view.kind}`)}: ${tooltip}`}
      className={`orbit-input-source orbit-input-source--${view.kind}`}
      data-tip={tooltip}
      data-tip-side="top"
    >
      <Chip caseNormal>{t(`strategy.inputs.chip.${view.kind}`)}</Chip>
    </span>
  );
}

function manualInputView(value: number): StrategyInputProvenanceView {
  return Number.isFinite(value)
    ? { kind: "manual", presence: "valid", value, canRevert: false }
    : { kind: "missing", presence: "missing", reason: "manual_input_required", canRevert: false };
}

function EffectiveInputDisplay({
  as, format, t, view,
}: {
  as: "b" | "em";
  format: (value: number) => string;
  t: (key: string) => string;
  view: StrategyInputProvenanceView;
}) {
  const value = view.value === undefined ? "—" : format(view.value);
  return (
    <>
      {as === "b" ? <b>{value}</b> : <em>{value}</em>}
      <InputProvenanceChip t={t} view={view} />
    </>
  );
}

function PlanningInputRow({
  field, label, unit, view, t, onCommit,
}: {
  field: StrategyPlanningInputFieldV2;
  label: string;
  unit: string;
  view: StrategyInputProvenanceView;
  t: (key: string) => string;
  onCommit: (field: StrategyPlanningInputFieldV2, value?: number) => void;
}) {
  const [draft, setDraft] = useState(view.value === undefined ? "" : String(view.value));
  const persistedValue = view.value === undefined ? "" : String(view.value);
  useHubSuspendBlocker(
    `strategy-planning-input-${field}`,
    "Estrategia tiene un dato de planificación sin aplicar",
    draft !== persistedValue,
  );
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current) setDraft(view.value === undefined ? "" : String(view.value));
    });
    return () => {
      current = false;
    };
  }, [view.value]);
  const commitDraft = () => {
    const value = Number(draft);
    const acceptsZero = field === "degradation_per_lap_seconds"
      || field === "saving_fuel_per_lap"
      || field === "saving_time_cost_per_lap";
    if (draft.trim() !== "" && Number.isFinite(value) && (acceptsZero ? value >= 0 : value > 0) && value !== view.value) {
      onCommit(field, value);
    }
  };
  return (
    <div className="orbit-planning-input" data-testid={`orbit-planning-input-${field}`}>
      <label>
        <span>{label}</span>
        <Input
          aria-label={label}
          inputMode="decimal"
          numeric
          onBlur={commitDraft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          unit={unit}
          value={draft}
        />
      </label>
      <InputProvenanceChip t={t} view={view} />
      {view.canRevert ? (
        <Button onClick={() => onCommit(field, undefined)} size="sm" variant="ghost">
          {t("strategy.inputs.revert")}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Pasos del asistente de creación (ISA-377): de dónde salen los datos, si se
 * corre solo o con equipo, y de qué punto de partida nace el evento.
 */
type WizardStep = "fill" | "team" | "start";

const WIZARD_STEPS: readonly WizardStep[] = ["fill", "team", "start"];

interface WizardState {
  step: WizardStep;
  fill: StrategyFillMode;
  team: StrategyTeamMode;
  /** Dentro del paso `start`: si se está mirando la lista del calendario. */
  path: PickerPath;
}
interface CalendarRaceSelection {
  readonly series: RaceSeries;
  readonly className?: string;
  readonly trackLayout?: string;
}
type SidePanel = "inputs" | "drivers" | "tyres" | "sessions" | "weather";
type DonutMode = "laps" | "time";

/** `FL|FR|RL|RR` → esquina del dominio real (`strategy-tyre`). */
const CORNER_TO_DOMAIN: Record<OrbitCorner, StrategyCorner> = {
  FL: "front_left",
  FR: "front_right",
  RL: "rear_left",
  RR: "rear_right",
};

/** El compuesto `wet` del dominio no tiene chip propio en el kit. */
function chipCompound(tyre: StrategyTyre): TyreView["compound"] {
  return tyre.compound === "wet" ? "soft" : tyre.compound;
}

/** Reparto inicial retirado en F2-f: el inventario sale del documento v2 por evento. */

/** Formulario del evento: todo texto, se valida al enviar. */
interface EventForm {
  name: string;
  track: string;
  cls: string;
  durationMin: string;
  /** `YYYY-MM-DDTHH:mm` del `datetime-local`. */
  startAt: string;
  tankL: string;
  pitLossSec: string;
  team: string;
  drivers: StrategyDriver[];
}

/** Duraciones de un clic (`Seg`); el resto se escribe en el campo de minutos. */
const DURATION_PRESETS = [60, 120, 240, 360] as const;

/** `Date` → valor de un `input[type=datetime-local]` en hora local. */
function toLocalInput(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** Valor de un `datetime-local` → ISO; hoy a esa hora si el texto no vale. */
function fromLocalInput(value: string): string {
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString();
}

function formOf(record: StrategyEventRecord): EventForm {
  return {
    name: record.name,
    track: record.track,
    cls: record.cls,
    durationMin: String(record.durationMin),
    startAt: toLocalInput(new Date(record.startAt)),
    tankL: String(record.tankL),
    pitLossSec: String(record.pitLossSec),
    team: record.team ?? "",
    drivers: record.drivers,
  };
}

/** Número positivo del formulario, o el valor por defecto. */
function positive(raw: string, fallback: number): number {
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Sin dato declarado, un piloto está disponible de punta a punta del eje. */
const FULL_AVAILABILITY: AvailabilitySegment[] = [
  { state: "ok", from: AVAILABILITY_FROM, to: AVAILABILITY_TO },
];

/** Primer id libre de la serie `local-n` (los duplicados y las nuevas). */
function freeId(taken: Readonly<Record<string, unknown>>, prefix: string): string {
  let n = 1;
  while (taken[`${prefix}-${n}`]) n += 1;
  return `${prefix}-${n}`;
}

export interface StrategyOrbitPageProps {
  /** Runtime del editor real; se crea contra Wails si no se inyecta. */
  runtimeFactory?: () => StrategyEditorRuntime;
  /** Evento y pilotos ya resueltos (tests y harness); si no, llega por el puente. */
  roster?: StrategyRoster | null;
  /** Cliente inyectable para tests; producción usa siempre el cliente v2 Wails. */
  applicationClient?: StrategyApplicationClient<unknown>;
}

/**
 * Estrategia de Command Orbit (`15-briefings/07-estrategia.md`, parte A).
 *
 * El inventario de neumáticos y su legalidad son del dominio real
 * (`strategy/strategy-editor.ts`, `strategy-tyre.ts`). Vueltas, stints,
 * rotación, Fuel, ventanas y comparaciones llegan del motor Go por el cliente
 * de aplicación v2; esta página solo conserva interacción y presentación.
 */
export function StrategyOrbitPage({ applicationClient: injectedClient, runtimeFactory, roster: injected }: StrategyOrbitPageProps) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const contextSlot = useOrbitSlot(STRATEGY_CONTEXT_SLOT_ID);
  const calendar = useCalendarStarts();

  const [applicationClient] = useState(() => injectedClient ?? createStrategyOrbitApplicationClient<unknown>());
  const applicationMounted = useRef(false);
  useEffect(() => {
    applicationMounted.current = true;
    return () => {
      applicationMounted.current = false;
      queueMicrotask(() => {
        if (!injectedClient && !applicationMounted.current) applicationClient.dispose();
      });
    };
  }, [applicationClient, injectedClient]);
  const [migration, setMigration] = useState<
    | { status: "idle" }
    | { status: "loading"; message: string }
    | { status: "preview"; prepared: PreparedOrbitLegacyMigration }
    | { status: "success"; result: StrategyLegacyMigrationPreviewV1 }
    | { status: "error"; message: string }
  >({ status: "idle" });

  // ── evento activo ───────────────────────────────────────────────────────
  const [bridged, setBridged] = useState<StrategyRoster | null>(null);
  useEffect(() => {
    if (injected !== undefined) return;
    return subscribeToStrategyRoster(setBridged);
  }, [injected]);
  const roster = injected !== undefined ? injected : bridged;

  // ── documento real del editor (neumáticos) ──────────────────────────────
  const [runtime] = useState<StrategyEditorRuntime>(
    () => (runtimeFactory ?? createWailsStrategyEditorRuntime)(),
  );
  const [editorOpenFailure, setEditorOpenFailure] = useState<VisibleApplicationFailure | null>(null);
  // StrictMode monta, desmonta y vuelve a montar: si el cierre del efecto
  // desechara el runtime en el acto, el segundo montaje encontraría un cliente
  // muerto y el inventario nunca llegaría (mismo patrón que el planificador).
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    void openOrCreateStrategyEditor(runtime.store).then(
      () => {
        if (mounted.current) setEditorOpenFailure(null);
      },
      (error: unknown) => {
        if (mounted.current) setEditorOpenFailure(visibleApplicationFailure(error));
      },
    );
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) runtime.dispose();
      });
    };
  }, [runtime]);
  const snapshot = useSyncExternalStore(runtime.store.subscribe, runtime.store.getSnapshot);
  // F2-f: inventario global sintético (Spa) retirado de rutas productivas.
  // El inventario pertenece al documento v2 por evento (StrategyDocumentV2.TyreInventory,
  // cliente API ya disponible). Mientras el evento no tenga inventario, vacío honesto.
  void snapshot;
  const inventory: StrategyTyre[] = [];

  // ── eventos locales ─────────────────────────────────────────────────────
  const [store, setStore] = useState<StrategyEventsState>(() => readStrategyEvents());
  const [legacyReadOnly, setLegacyReadOnly] = useState(() => isStrategyEventsReadOnly());
  const commit = (change: (current: StrategyEventsState) => StrategyEventsState) => {
      setStore((current) => {
        if (legacyReadOnly) return current;
        const next = change(current);
        if (next === current) return current;
        writeStrategyEvents(next);
        return next;
      });
  };
  const [sessionCatalog, setSessionCatalog] = useState<
    | { status: "loading" }
    | { status: "ready"; view: StrategySessionCatalogView }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const [sessionCatalogRetry, setSessionCatalogRetry] = useState(0);
  const [sessionPickerDismissed, setSessionPickerDismissed] = useState<string | null>(null);
  const [sessionSave, setSessionSave] = useState<"idle" | "saving" | "error">("idle");
  const [weatherSave, setWeatherSave] = useState<"idle" | "saving" | "error">("idle");
  const [validatedExamples, setValidatedExamples] = useState<ValidatedExamplesViewState>({ status: "idle" });

  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current) setSessionCatalog({ status: "loading" });
    });
    void loadStrategySessionCatalog(applicationClient).then(
      (view) => {
        if (current) setSessionCatalog({ status: "ready", view });
      },
      (error: unknown) => {
        if (current) setSessionCatalog({ status: "error", message: visibleApplicationFailure(error).message });
      },
    );
    return () => {
      current = false;
    };
  }, [applicationClient, sessionCatalogRetry]);

  const previewMigration = async () => {
    setMigration({ status: "loading", message: t("strategy.migration.reading") });
    try {
      const prepared = await previewOrbitLegacyMigration(applicationClient);
      setMigration(prepared.preview.alreadyImported
        ? { status: "success", result: prepared.preview }
        : { status: "preview", prepared });
    } catch (error) {
      setMigration({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const confirmMigration = async (prepared: PreparedOrbitLegacyMigration) => {
    setMigration({ status: "loading", message: t("strategy.migration.committing") });
    try {
      const result = await commitOrbitLegacyMigration(applicationClient, prepared);
      setLegacyReadOnly(true);
      setMigration({ status: "success", result });
    } catch (error) {
      setMigration({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const rollbackMigration = async (journalId: string) => {
    setMigration({ status: "loading", message: t("strategy.migration.rollingBack") });
    try {
      const result = await rollbackOrbitLegacyMigration(applicationClient, journalId);
      setLegacyReadOnly(false);
      setMigration({ status: "success", result });
    } catch (error) {
      setMigration({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  // El roster del puente entra como un evento más y ya no manda sobre la vista.
  const imported = useRef<string | null>(null);
  useEffect(() => {
    if (!roster) return;
    const id = rosterEventId(roster);
    if (imported.current === id) return;
    imported.current = id;
    setStore((current) => {
      if (legacyReadOnly) return current;
      if (current.events.some((event) => event.id === id)) return current;
      const next = upsertEvent(current, eventFromRoster(roster, readLegacyStrategyState()));
      // El roster es la sesión que el usuario tiene delante: si no había nada
      // abierto se abre él, y abrir sella `lastOpenedAt` como cualquier otro.
      const opened = current.activeId ? next : openEvent(next, id);
      writeStrategyEvents(opened);
      return opened;
    });
  }, [legacyReadOnly, roster]);

  const eventRecord = activeEventOf(store);
  const catalogView = sessionCatalog.status === "ready" ? sessionCatalog.view : null;
  const automaticCombinations = catalogView ? usableSessionCombinations(catalogView) : [];
  const automaticAvailable = sessionCatalog.status === "ready"
    && sessionCatalog.view.status === "available"
    && automaticCombinations.length > 0;
  const automaticReason = sessionCatalog.status === "loading"
    ? t("strategy.wizard.fill.autoChecking")
    : sessionCatalog.status === "error"
      ? t("strategy.wizard.fill.autoCatalogUnavailable")
      : sessionCatalog.view.status === "no_authorized_telemetry"
        ? t("strategy.wizard.fill.autoNoSessions")
        : automaticCombinations.length === 0
          ? t("strategy.wizard.fill.autoNoClassifiedLaps")
          : formatMessage(
              t(automaticCombinations.length === 1
                ? "strategy.wizard.fill.autoReadyOne"
                : "strategy.wizard.fill.autoReadyMany"),
              { n: automaticCombinations.length },
            );
  const sessionPickerCombinations = catalogView
    ? eventRecord?.fillMode === "telemetry"
      ? automaticCombinations
      : catalogView.combinations
    : [];
  const eventCombination = eventRecord && catalogView
    ? selectedCombination(catalogView, eventRecord.id)
    : undefined;
  const eventSessionDecisions = eventRecord && catalogView && eventCombination
    ? selectedSessions(catalogView, eventRecord.id, eventCombination)
    : [];
  const eventPlanningInputs = eventRecord && catalogView
    ? catalogView.planningByEvent[eventRecord.id]
    : undefined;
  const eventWeatherScenarios = eventRecord && catalogView
    ? selectedWeatherScenarios(catalogView, eventRecord.id)
    : EMPTY_WEATHER_SCENARIOS;
  useEffect(() => {
    let current = true;
    if (!eventRecord || !eventCombination || !catalogView) {
      queueMicrotask(() => {
        if (current) setValidatedExamples({ status: "idle" });
      });
      return () => { current = false; };
    }
    queueMicrotask(() => {
      if (current) setValidatedExamples({ status: "loading" });
    });
    void loadValidatedExamples(applicationClient, catalogView.repositoryVersion, eventRecord.id).then(
      (result) => { if (current) setValidatedExamples({ status: "success", result }); },
      () => { if (current) setValidatedExamples({ status: "error" }); },
    );
    return () => { current = false; };
  }, [applicationClient, catalogView, eventCombination, eventRecord]);
  const planningRequests = useRef(new Set<string>());
  useEffect(() => {
    if (!eventRecord || !catalogView || !eventCombination || eventPlanningInputs
      || planningRequests.current.has(eventRecord.id)) return;
    planningRequests.current.add(eventRecord.id);
    let current = true;
    void refreshStrategyPlanningInputs(applicationClient, catalogView, eventRecord.id).then(
      (view) => { if (current) setSessionCatalog({ status: "ready", view }); },
      () => { if (current) setSessionSave("error"); },
    );
    return () => { current = false; };
  }, [applicationClient, catalogView, eventCombination, eventPlanningInputs, eventRecord]);
  const strategyEvent = eventRecord ? toStrategyEvent(eventRecord, locale) : null;

  const driversById = Object.fromEntries(
    (eventRecord?.drivers ?? []).map((driver) => [driver.id, driver]),
  );

  // ── estrategias editables ────────────────────────────────────────────────
  const variants: Record<string, StrategyVariant> = Object.fromEntries(
    (eventRecord?.strategies ?? []).map((item) => [item.id, item]),
  );
  const activeId = eventRecord
    ? (eventRecord.activeStrategyId && variants[eventRecord.activeStrategyId]
        ? eventRecord.activeStrategyId
        : (eventRecord.strategies[0]?.id ?? null))
    : null;
  const storedActive = activeId ? variants[activeId] : undefined;

  // ── cálculo Go (manual + solver) ─────────────────────────────────────────
  const calculationSequence = useRef(0);
  const [calculationRetry, setCalculationRetry] = useState(0);
  const calculationInput = strategyEvent && eventRecord && activeId
    ? orbitCalculationInput(strategyEvent, eventRecord.drivers, Object.values(variants), activeId, eventPlanningInputs, eventWeatherScenarios)
    : null;
  const calculationKey = calculationInput ? JSON.stringify(calculationInput) : "";
  const [calculation, setCalculation] = useState<
    | { status: "idle" | "loading" }
    | { status: "success"; key: string; result: StrategyOrbitCalculationResultV1 }
    | { status: "error"; key: string; message: string; code?: string; field?: string }
  >({ status: "idle" });
  useEffect(() => {
    const sequence = ++calculationSequence.current;
    if (!calculationKey) {
      void Promise.resolve().then(() => {
        if (sequence === calculationSequence.current) setCalculation({ status: "idle" });
      });
      return;
    }
    const currentCalculationInput = JSON.parse(calculationKey) as NonNullable<typeof calculationInput>;
    const commandId = `orbit-calculate-${sequence}`;
    let current = true;
    void Promise.resolve().then(() => {
      if (current) setCalculation({ status: "loading" });
    });
    void calculateStrategyOrbit(
      applicationClient,
      commandId,
      currentCalculationInput,
    ).then(
      (result) => {
        if (current) setCalculation({ status: "success", key: calculationKey, result });
      },
      (error: unknown) => {
        if (!current) return;
        const typed = error instanceof Error ? error : new Error(String(error));
        const metadata = typed as Error & { code?: string; field?: string };
        setCalculation({
          status: "error",
          key: calculationKey,
          message: typed.message,
          ...(typeof metadata.code === "string"
            ? { code: metadata.code }
            : {}),
          ...(typeof metadata.field === "string"
            ? { field: metadata.field }
            : {}),
        });
      },
    );
    return () => {
      current = false;
      applicationClient.cancel(commandId);
    };
  }, [applicationClient, calculationKey, calculationRetry]);

  const calculationCurrent = "key" in calculation && calculation.key === calculationKey;
  const plansById = calculation.status === "success" && calculationCurrent ? calculation.result.plans : {};
  const plan = activeId ? plansById[activeId] ?? null : null;
  // F2-f: sin inventario sintético global. El reparto sale del documento v2 por evento;
  // donde no hay inventario se muestra vacío honesto, sin fabricar asignación.
  const active = storedActive;

  // ── custodia canónica de la revisión visible ───────────────────────────
  const lifecycleClient = applicationClient as StrategyApplicationClient<StrategyOrbitRevisionPayloadV1>;
  const lifecyclePayload: StrategyOrbitRevisionPayloadV1 | null = (() => {
    if (!eventRecord || !active || !plan) return null;
    return {
      contractVersion: STRATEGY_ORBIT_REVISION_CONTRACT_V1,
      event: {
        id: eventRecord.id,
        name: eventRecord.name,
        source: eventRecord.source,
        ...(eventRecord.seriesId ? { seriesId: eventRecord.seriesId } : {}),
        track: eventRecord.track,
        cls: eventRecord.cls,
        durationMin: eventRecord.durationMin,
        startAt: eventRecord.startAt,
        ...(eventRecord.team ? { team: eventRecord.team } : {}),
        drivers: eventRecord.drivers,
        tankL: eventRecord.tankL,
        pitLossSec: eventRecord.pitLossSec,
        availability: eventRecord.availability ?? {},
        teamMode: eventRecord.teamMode ?? "team",
        fillMode: eventRecord.fillMode ?? "manual",
      },
      variant: active,
      calculatedPlan: plan,
    };
  })();
  const lifecycleKey = lifecyclePayload ? JSON.stringify(lifecyclePayload) : "";
  const lifecycleSequence = useRef(0);
  const [lifecycleRetry, setLifecycleRetry] = useState(0);
  const [lifecycle, setLifecycle] = useState<OrbitLifecycleView>({ status: "idle" });
  useEffect(() => {
    lifecycleSequence.current += 1;
    const sequence = lifecycleSequence.current;
    if (!lifecycleKey) {
      void Promise.resolve().then(() => {
        if (sequence === lifecycleSequence.current) setLifecycle({ status: "idle" });
      });
      return;
    }
    const currentLifecyclePayload = JSON.parse(lifecycleKey) as StrategyOrbitRevisionPayloadV1;
    void Promise.resolve().then(() => {
      if (sequence === lifecycleSequence.current) setLifecycle({ status: "loading" });
    });
    void loadOrbitLifecycle(lifecycleClient, currentLifecyclePayload, String(sequence)).then(
      (state) => {
        if (sequence !== lifecycleSequence.current) return;
        setLifecycle({ status: "ready", state });
      },
      (error: unknown) => {
        if (sequence !== lifecycleSequence.current) return;
        setLifecycle({ status: "error", failure: visibleApplicationFailure(error) });
      },
    );
  }, [lifecycleClient, lifecycleKey, lifecycleRetry]);

  const saveVisibleRevision = async () => {
    if (!lifecyclePayload || !active || !eventRecord) return;
    lifecycleSequence.current += 1;
    const sequence = lifecycleSequence.current;
    setLifecycle({ status: "busy", state: lifecycle.state });
    try {
      const saved = await saveOrbitRevision(
        lifecycleClient,
        lifecyclePayload,
        `${eventRecord.name} · ${active.name}`,
      );
      if (sequence !== lifecycleSequence.current) return;
      setLifecycle({ status: "ready", state: saved });
      toast.show(
        t("strategy.lifecycle.saved"),
        formatMessage(t("strategy.lifecycle.savedHint"), {
          revision: saved.revision.revisionId,
          hash: saved.revision.contentHash.slice(0, 12),
        }),
      );
    } catch (error) {
      if (sequence !== lifecycleSequence.current) return;
      const failure = visibleApplicationFailure(error);
      setLifecycle({ status: "error", state: lifecycle.state, failure });
      toast.show(t("strategy.lifecycle.saveFailed"), failure.message);
    }
  };

  const activateVisibleRevision = async () => {
    if (!lifecycle.state?.savedRevision) return;
    lifecycleSequence.current += 1;
    const sequence = lifecycleSequence.current;
    setLifecycle({ status: "busy", state: lifecycle.state });
    try {
      const activated = await activateOrbitRevision(lifecycleClient, lifecycle.state);
      if (sequence !== lifecycleSequence.current) return;
      setLifecycle({ status: "ready", state: activated });
      toast.show(
        t("strategy.lifecycle.activated"),
        formatMessage(t("strategy.lifecycle.activatedHint"), {
          revision: activated.activePlan?.revision.revisionId ?? "",
        }),
      );
    } catch (error) {
      if (sequence !== lifecycleSequence.current) return;
      const failure = visibleApplicationFailure(error);
      setLifecycle({ status: "error", state: lifecycle.state, failure });
      toast.show(t("strategy.lifecycle.activateFailed"), failure.message);
    }
  };

  const visibleRevisionIsActive = sameRevision(
    lifecycle.state?.activePlan?.revision,
    lifecycle.state?.savedRevision,
  );

  const eventId = eventRecord?.id ?? null;
  const patchStrategies = (
    change: (list: StrategyVariant[]) => StrategyVariant[], nextActive?: string,
  ) => {
      if (!eventId) return;
      commit((current) =>
        patchEvent(current, eventId, (event) => ({
          ...event,
          strategies: change(event.strategies),
          activeStrategyId: nextActive ?? event.activeStrategyId,
        })),
      );
  };

  const update = (change: (variant: StrategyVariant) => StrategyVariant, dirty = true) => {
      if (!activeId) return;
      patchStrategies((list) =>
        list.map((item) => {
          if (item.id !== activeId) return item;
          // El reparto de neumáticos de partida se calcula al vuelo: al
          // escribir hay que partir de la estrategia efectiva, no de la guardada.
          const patched = change(item.id === activeId ? (active ?? item) : item);
          return dirty ? { ...patched, state: "draft" as const } : patched;
        }),
      );
  };

  // ── interacción ─────────────────────────────────────────────────────────
  const [tab, setTab] = useState<StrategyTab>("overview");
  const [donutMode, setDonutMode] = useState<DonutMode>("laps");
  const [panel, setPanel] = useState<SidePanel>("drivers");
  const [selected, setSelected] = useState(-1);
  const [editing, setEditing] = useState(-1);
  const [stintInputDrafts, setStintInputDrafts] = useState<Set<string>>(() => new Set());
  useHubSuspendBlocker(
    "strategy-stint-input-draft",
    t("strategy.editor.suspendBlocker"),
    stintInputDrafts.size > 0,
  );
  const beginStintInput = (key: string) => setStintInputDrafts((current) => {
    if (current.has(key)) return current;
    const next = new Set(current);
    next.add(key);
    return next;
  });
  const endStintInput = (key: string) => setStintInputDrafts((current) => {
    if (!current.has(key)) return current;
    const next = new Set(current);
    next.delete(key);
    return next;
  });
  const [picked, setPicked] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── estrategias: seleccionar, duplicar, crear ───────────────────────────
  const selectVariant = (id: string, silent = false) => {
      patchStrategies((list) => list, id);
      setEditing(-1);
      setSelected(-1);
      if (silent) return;
      const name = variants[id]?.name ?? "";
      toast.show(
        t("strategy.lifecycle.selected"),
        formatMessage(t("strategy.lifecycle.selectedHint"), { name }),
      );
  };

  const duplicate = (id: string) => {
      const source = variants[id];
      if (!source) return;
      const copyId = freeId(variants, "local");
      const name = formatMessage(t("strategy.cards.copyName"), { name: source.name });
      patchStrategies((list) => [...list, { ...source, id: copyId, name, state: "draft" as const }]);
      toast.show(t("strategy.cards.duplicated"), formatMessage(t("strategy.cards.duplicatedHint"), { name }));
  };

  /** La tarjeta «+ Nueva estrategia» avisa; la de la columna no (briefing 07). */
  const createStrategy = (silent = false) => {
      if (!eventRecord || !strategyEvent) return;
      const newId = freeId(variants, "local");
      const base = eventRecord.strategies[0]?.order ?? eventRecord.drivers.map((driver) => driver.id);
      const name = formatMessage(t("strategy.cards.newName"), {
        n: Object.keys(variants).length + 1,
      });
      patchStrategies(
        (list) => [
          ...list,
          {
            id: newId,
            name,
            note: t("strategy.cards.newNote"),
            mode: "dry" as const,
            order: base,
            state: "draft" as const,
            overrides: {},
            tyres: {},
          },
        ],
        newId,
      );
      setEditing(-1);
      setSelected(-1);
      if (!silent) {
        toast.show(t("strategy.cards.created"), formatMessage(t("strategy.cards.createdHint"), { name }));
      }
  };

  // ── comparación ─────────────────────────────────────────────────────────
  const [compareId, setCompareId] = useState<string | null>(null);

  // ── disponibilidad ──────────────────────────────────────────────────────
  // Sin dato real de disponibilidad, cada piloto entra disponible de punta a
  // punta: la pantalla no inventa ausencias que nadie ha declarado.
  const availability = eventRecord?.availability ?? {};
  const [avDriver, setAvDriver] = useState("");
  const [avState, setAvState] = useState<AvailabilityState>("ok");
  const [avFrom, setAvFrom] = useState("14:00");
  const [avTo, setAvTo] = useState("16:00");
  const [availabilityDirty, setAvailabilityDirty] = useState(false);
  useHubSuspendBlocker(
    "strategy-availability-draft",
    "Estrategia tiene disponibilidad sin guardar",
    availabilityDirty,
  );

  const addSlot = (driverId: string, state: AvailabilityState, from: string, to: string) => {
      const a = parseHhmm(from);
      const b = parseHhmm(to);
      if (a === null || b === null || b <= a) {
        toast.show(t("strategy.availability.invalidTitle"), t("strategy.availability.invalid"));
        return;
      }
      if (!eventId) return;
      commit((current) =>
        patchEvent(current, eventId, (event) => ({
          ...event,
          availability: {
            ...(event.availability ?? {}),
            [driverId]: addAvailability(event.availability?.[driverId] ?? FULL_AVAILABILITY, {
              state,
              from: a,
              to: b,
            }),
          },
        })),
      );
      setAvailabilityDirty(false);
      toast.show(
        t("strategy.availability.added"),
        formatMessage(t("strategy.availability.addedHint"), {
          driver: driversById[driverId]?.name ?? driverId,
          from,
          to,
        }),
      );
  };

  // ── ⚙ Ajustes ───────────────────────────────────────────────────────────
  const exportPlan = async () => {
    const revision = lifecycle.state?.savedRevision;
    if (!revision || !lifecyclePayload) {
      const failure = new StrategyApplicationError(
        "revision_not_found",
        "revision",
        t("strategy.lifecycle.saveFirst"),
      );
      setLifecycle({ status: "error", state: lifecycle.state, failure: visibleApplicationFailure(failure) });
      return;
    }
    try {
      const identity = orbitLifecycleIdentity(lifecyclePayload.event.id);
      const pack = await exportStrategyPackage(applicationClient, `orbit-export-${revision.revisionId}`, {
        plans: [{ planId: identity.planId, variantId: identity.variantId, revision }],
        provenance: {
          application: "Vantare",
          applicationVersion: "orbit-v0.3",
          exportedAt: new Date().toISOString(),
        },
      });
      toast.show(
        t("strategy.menu.exportDone"),
        formatMessage(t("strategy.menu.exportDoneHint"), {
          file: pack.suggestedFileName,
          kb: (pack.bytes.length / 1024).toFixed(1),
        }),
      );
    } catch (error) {
      const failure = visibleApplicationFailure(error);
      setLifecycle({ status: "error", state: lifecycle.state, failure });
      toast.show(t("strategy.menu.exportFailed"), failure.message);
    }
  };

  const scrollToStint = (index: number) => {
    window.requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-stint="${index}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  };

  const uses = tyreUses(active?.tyres ?? {});

  const assign = (stint: number, corner: OrbitCorner, tyreId: string) => {
      const tyre = inventory.find((item) => item.id === tyreId);
      if (!tyre) return;
      try {
        // La legalidad la decide el dominio real, no esta pantalla.
        assertPlannable(tyre, CORNER_TO_DOMAIN[corner]);
      } catch (error) {
        if (error instanceof StrategyTyreError) {
          toast.show(t("strategy.tyres.rejected"), error.message);
          return;
        }
        throw error;
      }
      update((variant) => ({
        ...variant,
        tyres: { ...variant.tyres, [stint]: { ...variant.tyres[stint], [corner]: tyreId } },
      }));
      setPicked(null);
  };

  const clear = (stint: number, corner: OrbitCorner) => {
      update((variant) => {
        const corners = { ...variant.tyres[stint] };
        delete corners[corner];
        return { ...variant, tyres: { ...variant.tyres, [stint]: corners } };
      });
  };

  /**
   * Orden de partida de una estrategia: el que publicó el puente si el evento
   * viene del roster, y si no el de los pilotos del evento local.
   */
  const baseOrder = (id: string): string[] => {
      const fromRoster =
        eventRecord?.source === "roster"
          ? roster?.strategies.find((item) => item.id === id)?.order
          : undefined;
      return fromRoster ?? eventRecord?.drivers.map((driver) => driver.id) ?? [];
  };

  const reset = () => {
    if (!strategyEvent || !activeId) return;
    const order = baseOrder(activeId);
    if (order.length === 0) return;
    update(
      (variant) => ({
        ...variant,
        order,
        overrides: {},
        tyres: {},
        state: "ok",
      }),
      false,
    );
    setEditing(-1);
    setPicked(null);
    toast.show(t("strategy.reset"), t("strategy.resetHint"));
  };

  const spread = () => {
    if (!plan || !activeId) return;
    const order = baseOrder(activeId);
    if (order.length === 0) return;
    update((variant) => ({ ...variant, order: plan.stints.map((stint) => stint.d) }));
  };

  const setDriver = (index: number, driverId: string) => {
      if (!plan) return;
      update((variant) => {
        const order = plan.stints.map((stint) => stint.d);
        order[index] = driverId;
        return { ...variant, order };
      });
  };

  const setOverride = (index: number, field: "laps" | "fuel", raw: string) => {
      const value = Number(raw.replace(",", "."));
      if (!Number.isFinite(value) || value <= 0) return;
      update((variant) => ({
        ...variant,
        overrides: { ...variant.overrides, [index]: { ...variant.overrides[index], [field]: value } },
      }));
  };

  const clearOverride = (index: number) => {
      update((variant) => {
        const overrides = { ...variant.overrides };
        delete overrides[index];
        return { ...variant, overrides };
      });
  };

  // ── eventos: menú de entrada, asistente, formulario y edición ───────────
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [calendarSelection, setCalendarSelection] = useState<CalendarRaceSelection | null>(null);
  const [form, setForm] = useState<{
    mode: "create" | "edit";
    /** Tablero elegido en el asistente; el formulario lo respeta. */
    teamMode: StrategyTeamMode;
    draft: EventForm;
  } | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  /** Evento que espera confirmación de borrado (diálogo del kit, nunca `confirm`). */
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const wizardHasRecoverableWork = wizard !== null &&
    (wizard.step !== "fill" || wizard.path !== "none");
  useHubSuspendBlocker(
    "strategy-event-draft",
    "Estrategia tiene un evento sin guardar",
    formDirty || wizardHasRecoverableWork || calendarSelection !== null,
  );

  /**
   * El piloto por defecto de un evento nuevo es quien lo crea. El nombre real
   * lo pone el usuario en el formulario: la pantalla no depende del proveedor
   * de licencia solo para rellenar una fila (D-W4-4).
   */
  const me = (): StrategyDriver => {
    const name = t("strategy.form.me");
    return { ...newDriver(name, 0), ini: initialsOf(name) };
  };

  const openCreate = (teamMode: StrategyTeamMode = "team") => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    setFormDirty(false);
    setForm({
      mode: "create",
      teamMode,
      draft: {
        name: "",
        track: "",
        cls: "",
        durationMin: "120",
        startAt: toLocalInput(start),
        tankL: "90",
        pitLossSec: "60",
        team: "",
        drivers: [me()],
      },
    });
  };

  const openEdit = () => {
    if (!eventRecord) return;
    setFormDirty(false);
    setForm({ mode: "edit", teamMode: eventRecord.teamMode ?? "team", draft: formOf(eventRecord) });
  };

  const patchForm = (change: Partial<EventForm>) => {
    setFormDirty(true);
    setForm((current) => (current ? { ...current, draft: { ...current.draft, ...change } } : current));
  };

  const patchFormDriver = (index: number, change: Partial<StrategyDriver>) => {
      setFormDirty(true);
      setForm((current) => {
        if (!current) return current;
        const drivers = current.draft.drivers.map((driver, i) =>
          i === index ? { ...driver, ...change } : driver,
        );
        return { ...current, draft: { ...current.draft, drivers } };
      });
  };

  const discardForm = () => {
    setForm(null);
    setFormDirty(false);
  };

  const submitForm = () => {
    const draft = form?.draft;
    if (!draft) return;
    const name = draft.name.trim();
    if (!name || draft.drivers.length === 0) {
      toast.show(t("strategy.form.invalidTitle"), t("strategy.form.invalid"));
      return;
    }
    const shared = {
      name,
      track: draft.track.trim(),
      cls: draft.cls.trim(),
      durationMin: Math.round(positive(draft.durationMin, 120)),
      startAt: fromLocalInput(draft.startAt),
      tankL: positive(draft.tankL, 90),
      pitLossSec: positive(draft.pitLossSec, 60),
      team: draft.team.trim(),
      drivers: draft.drivers,
    };
    if (form.mode === "edit" && eventId) {
      commit((current) =>
        patchEvent(current, eventId, (event) => ({
          ...event,
          ...shared,
          teamMode: form.teamMode,
          team: shared.team || undefined,
          // Si un piloto desaparece, las estrategias que lo usaban se rehacen.
          strategies: event.strategies.map((item) => {
            const order = item.order.filter((id) => shared.drivers.some((d) => d.id === id));
            return order.length > 0
              ? item
              : { ...item, order: shared.drivers.map((d) => d.id), state: "draft" as const };
          }),
        })),
      );
      setForm(null);
      setFormDirty(false);
      toast.show(t("strategy.form.savedTitle"), formatMessage(t("strategy.form.savedHint"), { name }));
      return;
    }
    const created = createCustomEvent(
      store.events,
      { ...shared, teamMode: form.teamMode, fillMode: wizard?.fill ?? "manual" },
      {
        strategyName: formatMessage(t("strategy.cards.newName"), { n: 1 }),
        strategyNote: t("strategy.cards.newNote"),
      },
    );
    commit((current) => openEvent(upsertEvent(current, created), created.id));
    setForm(null);
    setFormDirty(false);
    setWizard(null);
    setTab("overview");
    toast.show(t("strategy.form.createdTitle"), formatMessage(t("strategy.form.createdHint"), { name }));
  };

  const chooseSessionCombination = async (combinationId: string) => {
    if (!eventRecord || !catalogView) return;
    const combination = catalogView.combinations.find((item) => item.combinationId === combinationId);
    if (!combination) return;
    setSessionSave("saving");
    try {
      const saved = await persistStrategySessionSelection(
        applicationClient,
        catalogView,
        eventRecord,
        combination,
        combination.sessions.map((session) => ({ sessionId: session.sessionId, included: session.defaultIncluded })),
      );
      const view = await refreshStrategyPlanningInputs(applicationClient, saved, eventRecord.id);
      setSessionCatalog({ status: "ready", view });
      setSessionPickerDismissed(eventRecord.id);
      setSessionSave("idle");
    } catch {
      setSessionSave("error");
    }
  };

  const toggleSession = async (sessionId: string) => {
    if (!eventRecord || !catalogView || !eventCombination) return;
    const sessions = eventSessionDecisions.map((session) =>
      session.sessionId === sessionId ? { ...session, included: !session.included } : session,
    );
    setSessionSave("saving");
    try {
      const saved = await persistStrategySessionSelection(
        applicationClient,
        catalogView,
        eventRecord,
        eventCombination,
        sessions,
      );
      const view = await refreshStrategyPlanningInputs(applicationClient, saved, eventRecord.id);
      setSessionCatalog({ status: "ready", view });
      setSessionSave("idle");
    } catch {
      setSessionSave("error");
    }
  };

  const commitPlanningInput = async (field: StrategyPlanningInputFieldV2, value?: number) => {
    if (!eventRecord || !catalogView) return;
    setSessionSave("saving");
    try {
      const view = await persistStrategyPlanningOverride(applicationClient, catalogView, eventRecord, field, value);
      setSessionCatalog({ status: "ready", view });
      setSessionSave("idle");
    } catch {
      setSessionSave("error");
    }
  };

  const commitWeatherScenarios = async (scenarios: Parameters<typeof persistStrategyWeatherScenarios>[3]) => {
    if (!eventRecord || !catalogView) return false;
    setWeatherSave("saving");
    try {
      const view = await persistStrategyWeatherScenarios(applicationClient, catalogView, eventRecord, scenarios);
      setSessionCatalog({ status: "ready", view });
      setWeatherSave("idle");
      return true;
    } catch {
      setWeatherSave("error");
      return false;
    }
  };

  /**
   * Crea el evento desde una salida del calendario. Acepta tanto una salida de
   * serie (`RaceStart`) como una fila recomendada: es la misma acción y el
   * mismo constructor del dominio, no una copia con otras reglas.
   */
  const createFromSeries = (
      start: Pick<RaceStart, "seriesId" | "name" | "track" | "at"> & {
        vehicleClass?: string;
        durationMin?: number;
      },
      teamMode: StrategyTeamMode = "team",
    ) => {
      const created = createEventFromSeries(
        store.events,
        start,
        me(),
        {
          strategyName: formatMessage(t("strategy.cards.newName"), { n: 1 }),
          strategyNote: t("strategy.cards.newNote"),
        },
        teamMode,
        wizard?.fill ?? "manual",
      );
      commit((current) => openEvent(upsertEvent(current, created), created.id));
      setWizard(null);
      setTab("overview");
      toast.show(
        t("strategy.form.createdTitle"),
        formatMessage(t("strategy.form.createdHint"), { name: created.name }),
      );
  };

  /** Abrir es la única puerta al editor: aquí se sella `lastOpenedAt`. */
  const selectEvent = (id: string) => {
      commit((current) => openEvent(current, id));
      setForm(null);
      setFormDirty(false);
      setWizard(null);
      setEditing(-1);
      setSelected(-1);
      setCompareId(null);
      setTab("overview");
  };

  /**
   * Vuelve al menú de entrada sin tocar nada del evento.
   *
   * Decisión de UX (ISA-377): con un evento abierto la pestaña entra **directa
   * al editor**, porque volver a un plan a medias es lo que se hace el 90 % de
   * las veces y un menú intermedio sería un peaje. El menú no desaparece: está
   * a un clic desde la cabecera y desde la columna contextual.
   */
  const backToMenu = () => {
    commit((current) => ({ ...current, activeId: null }));
    setForm(null);
    setFormDirty(false);
    setWizard(null);
  };

  const startWizard = () => {
    setForm(null);
    setFormDirty(false);
    setWizard({ step: "fill", fill: "manual", team: "team", path: "none" });
  };

  const startManualWizard = () => {
    setCalendarSelection(null);
    setForm(null);
    setFormDirty(false);
    setWizard({ step: "team", fill: "manual", team: "team", path: "none" });
  };

  /** Copia un evento entero con sus estrategias; la copia nace sin abrir. */
  const duplicateEvent = (id: string) => {
      const source = store.events.find((event) => event.id === id);
      if (!source) return;
      const name = formatMessage(t("strategy.home.copyName"), { name: source.name });
      const copy: StrategyEventRecord = {
        ...source,
        id: freeEventId(store.events, "copy"),
        name,
        lastOpenedAt: undefined,
      };
      commit((current) => upsertEvent(current, copy));
      toast.show(
        t("strategy.home.duplicated"),
        formatMessage(t("strategy.home.duplicatedHint"), { name }),
      );
  };

  const confirmDelete = () => {
    const target = store.events.find((event) => event.id === pendingDelete);
    if (!target) return;
    commit((current) => removeEvent(current, target.id));
    setPendingDelete(null);
    toast.show(
      t("strategy.home.deleted"),
      formatMessage(t("strategy.home.deletedHint"), { name: target.name }),
    );
  };

  // ── pilotos del evento (editables) ──────────────────────────────────────
  const [editDriver, setEditDriver] = useState<string | null>(null);

  const patchDriver = (driverId: string, change: (driver: StrategyDriver) => StrategyDriver) => {
      if (!eventId) return;
      commit((current) =>
        patchEvent(current, eventId, (event) => ({
          ...event,
          drivers: event.drivers.map((driver) => (driver.id === driverId ? change(driver) : driver)),
        })),
      );
  };

  const setDriverPace = (
    driverId: string, mode: "dry" | "wet" | "eco", slot: 0 | 1, raw: string,
  ) => {
      const value = Number(raw.replace(",", "."));
      if (!Number.isFinite(value) || value <= 0) return;
      patchDriver(driverId, (driver) => {
        const pace: [number, number] = [driver[mode][0], driver[mode][1]];
        pace[slot] = value;
        return { ...driver, [mode]: pace };
      });
  };

  // ── columna contextual ──────────────────────────────────────────────────
  /** Series del calendario: primero las seguidas, luego el resto. */
  const seriesOptions = (() => {
    const followed = calendar.starts.filter((start) => start.followed);
    const rest = calendar.starts.filter((start) => !start.followed);
    return [...followed, ...rest].slice(0, 10);
  })();

  const calendarRaceSeries = calendar.calendar?.series ?? [];
  const calendarSelectionClasses = calendarSelection?.series.classes ?? [];
  const selectedCalendarClass = calendarSelection?.className
    ? calendarSelectionClasses.find((item) => item.name === calendarSelection.className)
    : undefined;
  const selectedCalendarStart = calendarSelection
    ? calendar.starts.find((start) => start.seriesId === calendarSelection.series.id)
    : undefined;
  const selectedCalendarVenueCombinations = calendarSelection && selectedCalendarClass && catalogView
    ? calendarSessionCombinations(
        calendarSelection.series,
        selectedCalendarClass,
        catalogView.combinations,
      )
    : [];
  const selectedCalendarLayouts = calendarSelection && selectedCalendarClass && catalogView
    ? calendarSessionLayouts(
        calendarSelection.series,
        selectedCalendarClass,
        catalogView.combinations,
      )
    : [];
  const selectedCalendarLayout = calendarSelection?.trackLayout
    ?? (selectedCalendarLayouts.length === 1 ? selectedCalendarLayouts[0].trackLayout : undefined);
  const selectedCalendarAllCombinations = calendarSelection && selectedCalendarClass && catalogView
    && selectedCalendarLayout
    ? calendarSessionCombinations(
        calendarSelection.series,
        selectedCalendarClass,
        catalogView.combinations,
        selectedCalendarLayout,
      )
    : [];
  const selectedCalendarCombinations = calendarSelection && selectedCalendarClass && selectedCalendarLayout
    ? calendarSessionCombinations(
        calendarSelection.series,
        selectedCalendarClass,
        automaticCombinations,
        selectedCalendarLayout,
      )
    : [];

  const selectCalendarRace = (series: RaceSeries) => {
    const classes = series.classes ?? [];
    setWizard(null);
    setCalendarSelection({
      series,
      ...(classes.length === 1 ? { className: classes[0].name } : {}),
    });
  };

  const createFromCalendarTelemetry = async (combinationId: string) => {
    if (!calendarSelection?.className || !selectedCalendarStart || !catalogView) return;
    const combination = selectedCalendarCombinations.find((item) => item.combinationId === combinationId);
    if (!combination) return;
    const created = createEventFromSeries(
      store.events,
      {
        ...selectedCalendarStart,
        vehicleClass: calendarSelection.className,
        durationMin: calendarSelection.series.raceDurationMin ?? calendarSelection.series.durationMin,
      },
      me(),
      {
        strategyName: formatMessage(t("strategy.cards.newName"), { n: 1 }),
        strategyNote: t("strategy.cards.newNote"),
      },
      "team",
      "telemetry",
    );
    setSessionSave("saving");
    try {
      const saved = await persistStrategySessionSelection(
        applicationClient,
        catalogView,
        created,
        combination,
        combination.sessions.map((session) => ({
          sessionId: session.sessionId,
          included: session.defaultIncluded,
        })),
      );
      const view = await refreshStrategyPlanningInputs(applicationClient, saved, created.id);
      setSessionCatalog({ status: "ready", view });
      commit((current) => openEvent(upsertEvent(current, created), created.id));
      setSessionPickerDismissed(created.id);
      setCalendarSelection(null);
      setSessionSave("idle");
      setTab("overview");
      toast.show(
        t("strategy.form.createdTitle"),
        formatMessage(t("strategy.form.createdHint"), { name: created.name }),
      );
    } catch {
      setSessionSave("error");
    }
  };

  /**
   * Eventos recomendados del estado inicial: especiales del calendario y, si no
   * hay ninguno, las series semanales con su próxima salida (`strategy-recommended`).
   */
  const recommended = buildRecommendedEvents(calendar.calendar, calendar.starts, new Date());

  /** Subtítulo de una fila recomendada: solo lo que el calendario publica. */
  const recommendedSubtitle = (row: RecommendedEvent) =>
      [
        row.track,
        row.vehicleClass || row.note,
        row.durationMin > 0
          ? formatMessage(t("strategy.chip.duration"), { min: row.durationMin })
          : "",
      ]
        .filter(Boolean)
        .join(" · ");

  const context = (
    <div className="orbit-strategy__context">
      <section aria-label={t("strategy.context.events")} className="orbit-block">
        <div className="orbit-block__head">
          <span className="orbit-eyebrow">{t("strategy.context.events")}</span>
        </div>
        <div className="orbit-list" data-testid="orbit-strategy-events">
          {store.events.length === 0 ? (
            <p className="orbit-row__copy">{t("strategy.context.noEvents")}</p>
          ) : (
            store.events.map((item) => (
              <ListRow
                ariaSelected={item.id === store.activeId}
                key={item.id}
                onClick={() => selectEvent(item.id)}
                selected={item.id === store.activeId}
                subtitle={item.track || item.cls}
                title={item.name}
                trailing={
                  <span className="orbit-when">{formatStartTime(new Date(item.startAt))}</span>
                }
              />
            ))
          )}
        </div>
      </section>

      {/* Las estrategias son del evento activo: sin evento no hay bloque vacío. */}
      <section
        aria-label={t("strategy.context.strategies")}
        className="orbit-block"
        hidden={!eventRecord}
      >
        <div className="orbit-block__head">
          <span className="orbit-eyebrow">{eventRecord?.name ?? t("strategy.context.noEvent")}</span>
        </div>
        <div className="orbit-list" data-testid="orbit-strategy-variants">
          {Object.values(variants).map((variant) => (
            <ListRow
              ariaSelected={variant.id === activeId}
              key={variant.id}
              onClick={() => selectVariant(variant.id, true)}
              selected={variant.id === activeId}
              subtitle={variant.note}
              title={variant.name}
              trailing={
                <StateChip state={variant.state === "ok" ? "ok" : "draft"}>
                  {variant.state === "ok" ? t("strategy.upToDate") : t("strategy.draft")}
                </StateChip>
              }
            />
          ))}
        </div>
      </section>

      <div className="orbit-strategy__context-acts">
        <Button
          data-testid="orbit-strategy-migrate"
          disabled={migration.status === "loading"}
          onClick={() => void previewMigration()}
          variant="ghost"
        >
          {legacyReadOnly ? t("strategy.migration.done") : t("strategy.migration.open")}
        </Button>
        <Button
          className="orbit-strategy__new"
          data-testid="orbit-strategy-new-column"
          disabled={!eventRecord}
          onClick={() => createStrategy(true)}
          variant="ghost"
        >
          {t("strategy.new")}
        </Button>
        <Button
          className="orbit-strategy__new"
          data-testid="orbit-strategy-new-event"
          onClick={backToMenu}
          variant="ghost"
        >
          {t("strategy.context.menu")}
        </Button>
      </div>
    </div>
  );

  // ── formulario del evento (crear · editar) ──────────────────────────────
  const durationPreset = form
    ? (DURATION_PRESETS.map(String) as string[]).includes(form.draft.durationMin)
      ? form.draft.durationMin
      : "custom"
    : "custom";

  const eventForm = form ? (
    <Surface
      aria-label={form.mode === "edit" ? t("strategy.form.editTitle") : t("strategy.form.title")}
      data-testid="orbit-strategy-form"
      fill
      meta={t("strategy.form.meta")}
      title={form.mode === "edit" ? t("strategy.form.editTitle") : t("strategy.form.title")}
    >
      <form
        className="orbit-event-form"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          submitForm();
        }}
      >
        <div className="orbit-event-form__grid">
          <Field htmlFor="orbit-ev-name" label={t("strategy.form.name")}>
            <Input
              id="orbit-ev-name"
              onChange={(changed) => patchForm({ name: changed.currentTarget.value })}
              placeholder={t("strategy.form.namePlaceholder")}
              value={form.draft.name}
            />
          </Field>
          <Field htmlFor="orbit-ev-track" label={t("strategy.form.track")}>
            <Input
              id="orbit-ev-track"
              onChange={(changed) => patchForm({ track: changed.currentTarget.value })}
              value={form.draft.track}
            />
          </Field>
          <Field htmlFor="orbit-ev-cls" label={t("strategy.form.cls")}>
            <Input
              id="orbit-ev-cls"
              list="orbit-ev-cls-options"
              onChange={(changed) => patchForm({ cls: changed.currentTarget.value })}
              value={form.draft.cls}
            />
          </Field>
          <datalist id="orbit-ev-cls-options">
            {["GT3", "LMGT3", "LMP2", "Hypercar", "GTE", "TCR"].map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <Field htmlFor="orbit-ev-start" label={t("strategy.form.start")}>
            <Input
              id="orbit-ev-start"
              onChange={(changed) => patchForm({ startAt: changed.currentTarget.value })}
              type="datetime-local"
              value={form.draft.startAt}
            />
          </Field>
          <Field htmlFor="orbit-ev-duration" label={t("strategy.form.duration")}>
            <div className="orbit-event-form__duration">
              <Seg
                label={t("strategy.form.duration")}
                onChange={(value) => {
                  if (value !== "custom") patchForm({ durationMin: value });
                }}
                options={[
                  ...DURATION_PRESETS.map((min) => ({
                    value: String(min),
                    label: formatMessage(t("strategy.form.durationPreset"), { h: min / 60 }),
                  })),
                  { value: "custom", label: t("strategy.form.durationCustom") },
                ]}
                value={durationPreset}
              />
              <Input
                aria-label={t("strategy.form.durationMin")}
                id="orbit-ev-duration"
                inputMode="numeric"
                numeric
                onChange={(changed) => patchForm({ durationMin: changed.currentTarget.value })}
                unit="min"
                value={form.draft.durationMin}
              />
              <InputProvenanceChip t={t} view={manualInputView(Number(form.draft.durationMin))} />
            </div>
          </Field>
          <Field htmlFor="orbit-ev-tank" label={t("strategy.form.tank")}>
            <Input
              id="orbit-ev-tank"
              inputMode="decimal"
              numeric
              onChange={(changed) => patchForm({ tankL: changed.currentTarget.value })}
              unit="L"
              value={form.draft.tankL}
            />
            <InputProvenanceChip t={t} view={manualInputView(Number(form.draft.tankL))} />
          </Field>
          <Field htmlFor="orbit-ev-pit" label={t("strategy.form.pit")}>
            <Input
              id="orbit-ev-pit"
              inputMode="decimal"
              numeric
              onChange={(changed) => patchForm({ pitLossSec: changed.currentTarget.value })}
              unit="s"
              value={form.draft.pitLossSec}
            />
            <InputProvenanceChip t={t} view={manualInputView(Number(form.draft.pitLossSec))} />
          </Field>
          <Field htmlFor="orbit-ev-team" label={t("strategy.form.team")}>
            <Input
              id="orbit-ev-team"
              onChange={(changed) => patchForm({ team: changed.currentTarget.value })}
              value={form.draft.team}
            />
          </Field>
        </div>

        <section aria-label={t("strategy.form.drivers")} className="orbit-event-form__drivers">
          <div className="orbit-event-form__drivers-head">
            <h4>{t("strategy.form.drivers")}</h4>
            <Button
              data-testid="orbit-strategy-form-add-driver"
              data-tip={form.teamMode === "solo" ? t("strategy.form.soloTip") : undefined}
              data-tip-side="left"
              disabled={form.teamMode === "solo"}
              onClick={() => {
                setFormDirty(true);
                setForm((current) =>
                  current
                    ? {
                        ...current,
                        draft: {
                          ...current.draft,
                          drivers: [
                            ...current.draft.drivers,
                            newDriver(
                              formatMessage(t("strategy.form.driverN"), {
                                n: current.draft.drivers.length + 1,
                              }),
                              current.draft.drivers.length,
                            ),
                          ],
                        },
                      }
                    : current,
                );
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("strategy.form.addDriver")}
            </Button>
          </div>
          {form.draft.drivers.map((driver, index) => (
            <div className="orbit-event-form__driver" key={driver.id}>
              <Input
                aria-label={formatMessage(t("strategy.form.driverName"), { n: index + 1 })}
                onChange={(changed) =>
                  patchFormDriver(index, {
                    name: changed.currentTarget.value,
                    ini: initialsOf(changed.currentTarget.value),
                  })
                }
                value={driver.name}
              />
              <Input
                aria-label={formatMessage(t("strategy.form.driverIni"), { n: index + 1 })}
                maxLength={3}
                onChange={(changed) => patchFormDriver(index, { ini: changed.currentTarget.value })}
                value={driver.ini}
              />
              <Select
                label={formatMessage(t("strategy.form.driverColor"), { n: index + 1 })}
                onChange={(value) => patchFormDriver(index, { color: value })}
                options={DRIVER_COLORS.map((color, k) => ({
                  value: color,
                  label: formatMessage(t("strategy.form.colorN"), { n: k + 1 }),
                }))}
                value={driver.color}
              />
              <Input
                aria-label={formatMessage(t("strategy.form.driverPace"), { n: index + 1 })}
                inputMode="decimal"
                numeric
                onChange={(changed) =>
                  patchFormDriver(index, {
                    dry: [Number(changed.currentTarget.value) || driver.dry[0], driver.dry[1]],
                  })
                }
                unit="s"
                value={String(driver.dry[0])}
              />
              <InputProvenanceChip t={t} view={manualInputView(driver.dry[0])} />
              <Input
                aria-label={formatMessage(t("strategy.form.driverFuel"), { n: index + 1 })}
                inputMode="decimal"
                numeric
                onChange={(changed) =>
                  patchFormDriver(index, {
                    dry: [driver.dry[0], Number(changed.currentTarget.value) || driver.dry[1]],
                  })
                }
                unit="L/v"
                value={String(driver.dry[1])}
              />
              <InputProvenanceChip t={t} view={manualInputView(driver.dry[1])} />
              <Button
                aria-label={formatMessage(t("strategy.form.removeDriver"), { n: index + 1 })}
                disabled={form.draft.drivers.length <= 1}
                onClick={() => {
                  setFormDirty(true);
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          draft: {
                            ...current.draft,
                            drivers: current.draft.drivers.filter((_, i) => i !== index),
                          },
                        }
                      : current,
                  );
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                ×
              </Button>
            </div>
          ))}
        </section>

        <div className="orbit-event-form__acts">
          <Button data-testid="orbit-strategy-form-submit" type="submit" variant="primary">
            {form.mode === "edit" ? t("strategy.form.save") : t("strategy.form.submit")}
          </Button>
          <Button onClick={discardForm} type="button" variant="ghost">
            {t("strategy.form.cancel")}
          </Button>
        </div>
      </form>
    </Surface>
  ) : null;

  // ── menú de entrada y asistente de creación (ISA-377) ───────────────────

  /** Resumen de una estrategia guardada: evento, pilotos y variantes. */
  const savedSummary = (record: StrategyEventRecord) =>
    [
      [record.cls, record.track].filter(Boolean).join(" · "),
      formatMessage(t("strategy.home.driversN"), { n: record.drivers.length }),
      formatMessage(t("strategy.home.variantsN"), { n: record.strategies.length }),
    ]
      .filter(Boolean)
      .join(" · ");

  /** Última edición en formato corto; sin sello, el evento nunca se abrió. */
  const lastEditLabel = (record: StrategyEventRecord) => {
    if (!record.lastOpenedAt) return t("strategy.home.neverOpened");
    const at = new Date(record.lastOpenedAt);
    if (Number.isNaN(at.getTime())) return t("strategy.home.neverOpened");
    return formatMessage(t("strategy.home.lastEdit"), {
      when: new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(at),
    });
  };

  const savedEvents = eventsByRecency(store);
  const continueEvent = lastOpenedEventOf(store);
  const deleteTarget = store.events.find((event) => event.id === pendingDelete) ?? null;

  const deleteDialog = (
    <ConfirmDialog
      body={formatMessage(t("strategy.home.deleteBody"), { name: deleteTarget?.name ?? "" })}
      cancelLabel={t("strategy.home.deleteCancel")}
      confirmLabel={t("strategy.home.deleteConfirm")}
      data-testid="orbit-strategy-delete-dialog"
      onCancel={() => setPendingDelete(null)}
      onConfirm={confirmDelete}
      open={deleteTarget !== null}
      title={t("strategy.home.deleteTitle")}
      tone="danger"
    />
  );

  const migrationPreview = migration.status === "preview" ? migration.prepared.preview : null;
  const migrationResult = migration.status === "success" ? migration.result : null;
  const migrationDialog = migration.status === "idle" ? null : (
    <div className="orbit-migration" role="presentation">
      <section
        aria-labelledby="orbit-migration-title"
        aria-modal="true"
        autoFocus
        className="orbit-migration__dialog"
        data-testid="orbit-strategy-migration-dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape" && migration.status !== "loading") setMigration({ status: "idle" });
        }}
        role="dialog"
        tabIndex={-1}
      >
        <h3 id="orbit-migration-title">{t("strategy.migration.title")}</h3>
        {migration.status === "loading" ? <p>{migration.message}</p> : null}
        {migration.status === "error" ? <Note title={t("strategy.migration.error")}>{migration.message}</Note> : null}
        {migrationPreview ? (
          <>
            <p>{formatMessage(t("strategy.migration.summary"), {
              events: migrationPreview.document.events.length,
              quarantine: migrationPreview.quarantine.length,
            })}</p>
            <code className="orbit-migration__fingerprint">{migrationPreview.fingerprint}</code>
            {migrationPreview.document.events.length ? (
              <ul>{migrationPreview.document.events.map((event) => <li key={event.id}>{event.id} · {event.name.value}</li>)}</ul>
            ) : null}
            {migrationPreview.quarantine.length ? (
              <div>
                <h4>{t("strategy.migration.quarantine")}</h4>
                <ul>{migrationPreview.quarantine.map((item, index) => <li key={`${item.path}-${index}`}><code>{item.path}</code> — {item.message}</li>)}</ul>
              </div>
            ) : null}
            {migrationPreview.warnings.length ? <ul>{migrationPreview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
          </>
        ) : null}
        {migrationResult ? (
          <Note title={migrationResult.rolledBack ? t("strategy.migration.rolledBack") : t("strategy.migration.done")}>{migrationResult.rolledBack ? t("strategy.migration.rolledBackResult") : formatMessage(t("strategy.migration.result"), {
            events: migrationResult.document.events.length,
            quarantine: migrationResult.quarantine.length,
          })}</Note>
        ) : null}
        <div className="orbit-migration__actions">
          {migration.status === "preview" ? (
            <Button data-testid="orbit-strategy-migration-confirm" onClick={() => void confirmMigration(migration.prepared)} variant="primary">
              {t("strategy.migration.confirm")}
            </Button>
          ) : null}
          {migration.status === "error" ? <Button onClick={() => void previewMigration()} variant="primary">{t("strategy.migration.retry")}</Button> : null}
          {migrationResult && !migrationResult.rolledBack ? (
            <Button onClick={() => void rollbackMigration(migrationResult.journalId)} variant="danger">
              {t("strategy.migration.rollback")}
            </Button>
          ) : null}
          <Button disabled={migration.status === "loading"} onClick={() => setMigration({ status: "idle" })} variant="ghost">
            {migrationResult ? t("strategy.migration.close") : t("strategy.migration.cancel")}
          </Button>
        </div>
      </section>
    </div>
  );
  const editorFailureView = editorOpenFailure ? (
    <div className="orbit-note" data-testid="orbit-strategy-editor-open-error" role="alert">
      <b>{t("strategy.lifecycle.openFailed")}</b>
      <span>{editorOpenFailure.message}</span>
      {[editorOpenFailure.code, editorOpenFailure.field].filter(Boolean).join(" · ") ? (
        <small>{[editorOpenFailure.code, editorOpenFailure.field].filter(Boolean).join(" · ")}</small>
      ) : null}
    </div>
  ) : null;

  /** Lista del calendario y recomendados: el punto de partida «desde evento». */
  const calendarStep = (
    <>
      {wizard?.path === "series" ? (
        <div className="orbit-list orbit-strategy__series-list" data-testid="orbit-strategy-series">
          {seriesOptions.length === 0 ? (
            <Note title={t("strategy.empty.noneTitle")}>{t("strategy.empty.none")}</Note>
          ) : (
            seriesOptions.map((start) => (
              <ListRow
                key={`${start.seriesId}-${start.at.getTime()}`}
                onClick={() => createFromSeries(start, wizard.team)}
                subtitle={[
                  start.track,
                  start.vehicleClass,
                  start.durationMin
                    ? formatMessage(t("strategy.chip.duration"), { min: start.durationMin })
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                title={start.name}
                trailing={<span className="orbit-when">{formatStartTime(start.at)}</span>}
              />
            ))
          )}
        </div>
      ) : null}

      {/* El hueco bajo las dos tarjetas lo llena el calendario real: los
          especiales si los hay, y si no las semanales (briefing 07, D-R3-E-1). */}
      <section className="orbit-strategy__rec-block" data-testid="orbit-strategy-recommended">
        <div className="orbit-block__head">
          <span className="orbit-eyebrow">{t("strategy.recommended.eyebrow")}</span>
          {recommended.kind === "none" ? null : (
            <span className="orbit-strategy__rec-meta">
              {t(`strategy.recommended.meta.${recommended.kind}`)}
            </span>
          )}
        </div>
        {recommended.rows.length === 0 ? (
          <Note title={t("strategy.recommended.emptyTitle")}>
            {t("strategy.recommended.empty")}
          </Note>
        ) : (
          <div className="orbit-list orbit-strategy__rec" data-testid="orbit-strategy-recommended-list">
            {recommended.rows.map((row) => (
              <div className="orbit-strategy__rec-row" key={row.key}>
                <ListRow
                  onClick={() => createFromSeries(row, wizard?.team ?? "team")}
                  subtitle={recommendedSubtitle(row)}
                  title={row.name}
                  trailing={<span className="orbit-when">{formatStartTime(row.at)}</span>}
                />
                <Button
                  aria-label={formatMessage(t("strategy.recommended.planName"), { name: row.name })}
                  data-testid={`orbit-strategy-plan-${row.seriesId}`}
                  onClick={() => createFromSeries(row, wizard?.team ?? "team")}
                  size="sm"
                  variant="primary"
                >
                  {t("strategy.recommended.plan")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );

  const stepIndex = wizard ? WIZARD_STEPS.indexOf(wizard.step) : 0;

  const wizardView = wizard ? (
    <Surface
      aria-label={t("strategy.wizard.title")}
      data-testid="orbit-strategy-wizard"
      fill
      meta={formatMessage(t("strategy.wizard.stepMeta"), {
        n: stepIndex + 1,
        total: WIZARD_STEPS.length,
      })}
      title={t("strategy.wizard.title")}
    >
      <ol aria-label={t("strategy.wizard.stepsLabel")} className="orbit-strategy__steps">
        {WIZARD_STEPS.map((id, index) => (
          <li
            data-state={index < stepIndex ? "done" : index === stepIndex ? "now" : "next"}
            data-testid={`orbit-strategy-wizard-step-${id}`}
            key={id}
          >
            <span className="orbit-strategy__step-n">{index + 1}</span>
            <span>{t(`strategy.wizard.steps.${id}`)}</span>
          </li>
        ))}
      </ol>

      {wizard.step === "fill" ? (
        <>
          <p className="orbit-strategy__empty-lead">{t("strategy.wizard.fill.lead")}</p>
          <div className="orbit-strategy__paths" data-testid="orbit-strategy-wizard-fill">
            <Featured
              data-testid="orbit-strategy-wizard-manual"
              interactive
              onClick={() => setWizard({ ...wizard, fill: "manual", step: "team" })}
            >
              <span className="orbit-path__k">{t("strategy.wizard.fill.manual")}</span>
              <span className="orbit-path__d">{t("strategy.wizard.fill.manualHint")}</span>
            </Featured>
            <Featured
              className={automaticAvailable ? undefined : "orbit-strategy__opt--off"}
              data-testid="orbit-strategy-wizard-auto"
            >
              <span className="orbit-path__k">{t("strategy.wizard.fill.auto")}</span>
              <span className="orbit-path__d">{t("strategy.wizard.fill.autoHint")}</span>
              <span className="orbit-path__d" data-testid="orbit-strategy-wizard-auto-reason" id="orbit-strategy-wizard-auto-reason">
                {automaticReason}
              </span>
              <Button
                aria-describedby="orbit-strategy-wizard-auto-reason"
                data-testid="orbit-strategy-wizard-auto-action"
                data-tip={automaticReason}
                data-tip-side="top"
                disabled={!automaticAvailable}
                onClick={() => {
                  setCalendarSelection(null);
                  setWizard(null);
                }}
                size="sm"
                variant={automaticAvailable ? "primary" : "ghost"}
              >
                {t("strategy.wizard.fill.autoAction")}
              </Button>
            </Featured>
          </div>
        </>
      ) : wizard.step === "team" ? (
        <>
          <p className="orbit-strategy__empty-lead">{t("strategy.wizard.team.lead")}</p>
          <div className="orbit-strategy__paths" data-testid="orbit-strategy-wizard-team-step">
            <Featured
              data-testid="orbit-strategy-wizard-solo"
              interactive
              onClick={() => setWizard({ ...wizard, team: "solo", step: "start" })}
            >
              <span className="orbit-path__k">{t("strategy.wizard.team.solo")}</span>
              <span className="orbit-path__d">{t("strategy.wizard.team.soloHint")}</span>
            </Featured>
            <Featured
              data-testid="orbit-strategy-wizard-team"
              interactive
              onClick={() => setWizard({ ...wizard, team: "team", step: "start" })}
            >
              <span className="orbit-path__k">{t("strategy.wizard.team.team")}</span>
              <span className="orbit-path__d">{t("strategy.wizard.team.teamHint")}</span>
            </Featured>
          </div>
        </>
      ) : (
        <>
          <p className="orbit-strategy__empty-lead">{t("strategy.wizard.start.lead")}</p>
          <div className="orbit-strategy__paths" data-testid="orbit-strategy-paths">
            <Featured
              data-testid="orbit-strategy-path-own"
              interactive
              onClick={() => openCreate(wizard.team)}
            >
              <span className="orbit-path__k">{t("strategy.picker.own")}</span>
              <span className="orbit-path__d">{t("strategy.picker.ownHint")}</span>
            </Featured>
            <Featured
              data-testid="orbit-strategy-path-series"
              interactive
              onClick={() => setWizard({ ...wizard, path: "series" })}
            >
              <span className="orbit-path__k">{t("strategy.picker.series")}</span>
              <span className="orbit-path__d">{t("strategy.picker.seriesHint")}</span>
            </Featured>
          </div>
          {calendarStep}
        </>
      )}

      <div className="orbit-strategy__wizard-acts">
        <Button
          data-testid="orbit-strategy-wizard-back"
          onClick={() => {
            if (stepIndex === 0) {
              setWizard(null);
              return;
            }
            setWizard({ ...wizard, step: WIZARD_STEPS[stepIndex - 1], path: "none" });
          }}
          variant="ghost"
        >
          {stepIndex === 0 ? t("strategy.wizard.cancel") : t("strategy.wizard.back")}
        </Button>
      </div>
    </Surface>
  ) : null;

  const sessionPickerView = eventRecord ? (
    <Surface
      aria-label={t("strategy.sessions.pickerTitle")}
      data-testid="orbit-strategy-session-picker"
      meta={t("strategy.sessions.optional")}
      title={t("strategy.sessions.pickerTitle")}
    >
      <p className="orbit-strategy__empty-lead">{t("strategy.sessions.pickerLead")}</p>
      {sessionCatalog.status === "loading" ? (
        <p role="status">{t("strategy.sessions.loading")}</p>
      ) : sessionCatalog.status === "ready" && sessionPickerCombinations.length === 0 ? (
        <Note title={t("strategy.sessions.emptyTitle")}>{t("strategy.sessions.empty")}</Note>
      ) : sessionCatalog.status === "ready" ? (
        <div className="orbit-session-picker__list">
          {sessionPickerCombinations.map((combination) => (
            <Featured
              data-testid={`orbit-session-combination-${combination.combinationId}`}
              interactive
              key={combination.combinationId}
              onClick={() => void chooseSessionCombination(combination.combinationId)}
            >
              <span className="orbit-eyebrow">{combination.simId.toUpperCase()}</span>
              <span className="orbit-path__k">{combination.trackName} · {combination.carName}</span>
              <span className="orbit-path__d">
                {formatMessage(t("strategy.sessions.summary"), {
                  sessions: combination.sessionCount,
                  races: combination.raceCount,
                  activity: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(combination.lastActivity)),
                })}
              </span>
              <span className="orbit-session-picker__buckets">
                {combination.climateBuckets.length > 0
                  ? combination.climateBuckets.map((bucket) => `${t(`strategy.sessions.bucket.${bucket.bucket}`)} ${bucket.laps}`).join(" · ")
                  : t("strategy.sessions.noBuckets")}
              </span>
            </Featured>
          ))}
        </div>
      ) : null}
      {sessionSave === "error" ? <p role="alert">{t("strategy.sessions.saveError")}</p> : null}
      <div className="orbit-strategy__wizard-acts">
        <Button
          data-testid="orbit-strategy-session-skip"
          disabled={sessionSave === "saving"}
          onClick={() => setSessionPickerDismissed(eventRecord.id)}
          variant="ghost"
        >
          {t("strategy.sessions.skip")}
        </Button>
      </div>
    </Surface>
  ) : null;

  const calendarRaceView = (
    <Surface
      aria-label={t("strategy.calendar.title")}
      data-testid="orbit-strategy-calendar"
      meta={calendar.calendar
        ? formatMessage(t("strategy.calendar.meta"), { n: calendarRaceSeries.length })
        : t("strategy.calendar.metaUnavailable")}
      title={t("strategy.calendar.title")}
    >
      {calendar.calendar === null ? (
        <Note title={t("strategy.calendar.unavailableTitle")}>
          {t("strategy.calendar.unavailable")}
        </Note>
      ) : calendarSelection === null ? (
        calendarRaceSeries.length === 0 ? (
          <Note title={t("strategy.calendar.emptyTitle")}>{t("strategy.calendar.empty")}</Note>
        ) : (
          <div className="orbit-session-picker__list orbit-strategy__calendar-list">
            {calendarRaceSeries.map((series) => {
              const classes = series.classes ?? [];
              const duration = series.raceDurationMin ?? series.durationMin;
              const restrictions = [
                series.tyres > 0
                  ? formatMessage(t("strategy.calendar.tyres"), { n: series.tyres })
                  : "",
                series.veLimit && series.veLimit > 0
                  ? formatMessage(t("strategy.calendar.veLimit"), { n: series.veLimit })
                  : "",
                series.setup === "fixed"
                  ? t("strategy.calendar.setup.fixed")
                  : series.setup === "open"
                    ? t("strategy.calendar.setup.open")
                    : "",
              ].filter(Boolean);
              return (
                <Featured
                  data-testid={`orbit-strategy-calendar-race-${series.id}`}
                  interactive
                  key={series.id}
                  onClick={() => selectCalendarRace(series)}
                >
                  <span className="orbit-eyebrow">{series.name}</span>
                  <span className="orbit-path__k">{series.track}</span>
                  <span className="orbit-path__d">
                    {classes.length > 0
                      ? classes.map((item) => item.qualifier ? `${item.name} (${item.qualifier})` : item.name).join(" · ")
                      : t("strategy.calendar.classesMissing")}
                  </span>
                  {duration > 0 ? (
                    <span className="orbit-path__d">
                      {formatMessage(t("strategy.calendar.duration"), { n: duration })}
                    </span>
                  ) : null}
                  {restrictions.length > 0 ? (
                    <span className="orbit-session-picker__buckets">{restrictions.join(" · ")}</span>
                  ) : null}
                </Featured>
              );
            })}
          </div>
        )
      ) : !calendarSelection.series.telemetryTrackName ? (
        <div data-testid="orbit-strategy-calendar-identity-error">
          <Note title={t("strategy.calendar.venueUnresolvedTitle")}>
            {formatMessage(t("strategy.calendar.venueUnresolved"), {
              track: calendarSelection.series.track,
            })}
          </Note>
          <div className="orbit-strategy__wizard-acts">
            <Button onClick={() => setCalendarSelection(null)} variant="ghost">
              {t("strategy.calendar.back")}
            </Button>
            <Button data-testid="orbit-strategy-calendar-manual" onClick={startManualWizard} variant="ghost">
              {t("strategy.calendar.manual")}
            </Button>
          </div>
        </div>
      ) : calendarSelectionClasses.length === 0 ? (
        <div data-testid="orbit-strategy-calendar-classes">
          <Note title={t("strategy.calendar.classesMissingTitle")}>
            {t("strategy.calendar.classesMissingReason")}
          </Note>
          <Button data-testid="orbit-strategy-calendar-manual" onClick={startManualWizard} variant="ghost">
            {t("strategy.calendar.manual")}
          </Button>
        </div>
      ) : calendarSelection.className === undefined ? (
        <div data-testid="orbit-strategy-calendar-classes">
          <p className="orbit-strategy__empty-lead">
            {formatMessage(t("strategy.calendar.chooseClass"), { track: calendarSelection.series.track })}
          </p>
          <div className="orbit-session-picker__list">
            {calendarSelectionClasses.map((item) => (
              <Featured
                data-testid={`orbit-strategy-calendar-class-${item.name}`}
                interactive
                key={item.name}
                onClick={() => setCalendarSelection({
                  series: calendarSelection.series,
                  className: item.name,
                })}
              >
                <span className="orbit-path__k">{item.name}</span>
                {item.qualifier ? <span className="orbit-path__d">{item.qualifier}</span> : null}
              </Featured>
            ))}
          </div>
          <Button onClick={() => setCalendarSelection(null)} variant="ghost">
            {t("strategy.calendar.back")}
          </Button>
        </div>
      ) : !selectedCalendarClass?.telemetryClassName ? (
        <div data-testid="orbit-strategy-calendar-identity-error">
          <Note title={t("strategy.calendar.classUnresolvedTitle")}>
            {formatMessage(t("strategy.calendar.classUnresolved"), {
              class: calendarSelection.className,
            })}
          </Note>
          <div className="orbit-strategy__wizard-acts">
            <Button onClick={() => setCalendarSelection(null)} variant="ghost">
              {t("strategy.calendar.back")}
            </Button>
            <Button data-testid="orbit-strategy-calendar-manual" onClick={startManualWizard} variant="ghost">
              {t("strategy.calendar.manual")}
            </Button>
          </div>
        </div>
      ) : sessionCatalog.status === "ready"
        && sessionCatalog.view.status === "available"
        && selectedCalendarVenueCombinations.length > 0
        && selectedCalendarLayouts.length > 1
        && calendarSelection.trackLayout === undefined ? (
        <div data-testid="orbit-strategy-calendar-layouts">
          <p className="orbit-strategy__empty-lead">
            {formatMessage(t("strategy.calendar.chooseLayout"), {
              track: calendarSelection.series.track,
            })}
          </p>
          <div className="orbit-session-picker__list">
            {selectedCalendarLayouts.map((layout) => (
              <Featured
                data-testid={`orbit-strategy-calendar-layout-${layout.trackLayout}`}
                interactive
                key={layout.trackLayout}
                onClick={() => setCalendarSelection({
                  ...calendarSelection,
                  trackLayout: layout.trackLayout,
                })}
              >
                <span className="orbit-path__k">{layout.trackLayout}</span>
                <span className="orbit-path__d">
                  {formatMessage(t(layout.sessionCount === 1
                    ? "strategy.calendar.layoutSessionOne"
                    : "strategy.calendar.layoutSessionMany"), { n: layout.sessionCount })}
                </span>
              </Featured>
            ))}
          </div>
          <div className="orbit-strategy__wizard-acts">
            <Button onClick={() => setCalendarSelection(null)} variant="ghost">
              {t("strategy.calendar.back")}
            </Button>
          </div>
        </div>
      ) : (
        <div data-testid="orbit-strategy-calendar-cars">
          <p className="orbit-strategy__empty-lead">
            {formatMessage(t("strategy.calendar.chooseCar"), {
              track: calendarSelection.series.track,
              class: calendarSelection.className,
              layout: selectedCalendarLayout ?? "",
            })}
          </p>
          {sessionCatalog.status === "loading" ? (
            <p role="status">{t("strategy.wizard.fill.autoChecking")}</p>
          ) : sessionCatalog.status === "error" ? (
            <Note title={t("strategy.calendar.catalogUnavailableTitle")}>
              {t("strategy.wizard.fill.autoCatalogUnavailable")}
            </Note>
          ) : sessionCatalog.view.status === "no_authorized_telemetry" ? (
            <Note title={t("strategy.calendar.noSessionsTitle")}>
              {t("strategy.wizard.fill.autoNoSessions")}
            </Note>
          ) : selectedCalendarVenueCombinations.length === 0 ? (
            <Note title={t("strategy.calendar.noMatchTitle")}>
              {t("strategy.calendar.noMatch")}
            </Note>
          ) : selectedCalendarAllCombinations.length === 0 ? (
            <Note title={t("strategy.calendar.noLayoutMatchTitle")}>
              {formatMessage(t("strategy.calendar.noLayoutMatch"), {
                layout: selectedCalendarLayout ?? "",
              })}
            </Note>
          ) : selectedCalendarCombinations.length === 0 ? (
            <Note title={t("strategy.calendar.noClassifiedTitle")}>
              {t("strategy.wizard.fill.autoNoClassifiedLaps")}
            </Note>
          ) : selectedCalendarStart === undefined ? (
            <Note title={t("strategy.calendar.noStartTitle")}>
              {t("strategy.calendar.noStart")}
            </Note>
          ) : (
            <div className="orbit-session-picker__list">
              {selectedCalendarCombinations.map((combination) => (
                <Featured
                  data-testid={`orbit-strategy-calendar-car-${combination.combinationId}`}
                  interactive
                  key={combination.combinationId}
                  onClick={() => void createFromCalendarTelemetry(combination.combinationId)}
                >
                  <span className="orbit-path__k">{combination.carName}</span>
                  <span className="orbit-path__d">{combination.trackLayout}</span>
                  <span className="orbit-session-picker__buckets">
                    {combination.climateBuckets.map((bucket) =>
                      `${t(`strategy.sessions.bucket.${bucket.bucket}`)} ${bucket.laps}`,
                    ).join(" · ")}
                  </span>
                </Featured>
              ))}
            </div>
          )}
          {sessionSave === "error" ? <p role="alert">{t("strategy.sessions.saveError")}</p> : null}
          <div className="orbit-strategy__wizard-acts">
            <Button onClick={() => setCalendarSelection(null)} variant="ghost">
              {t("strategy.calendar.back")}
            </Button>
            {(sessionCatalog.status !== "ready"
              || sessionCatalog.view.status !== "available"
              || selectedCalendarCombinations.length === 0
              || selectedCalendarStart === undefined) ? (
              <Button data-testid="orbit-strategy-calendar-manual" onClick={startManualWizard} variant="ghost">
                {t("strategy.calendar.manual")}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </Surface>
  );

  const entryMenu = (
    <div className="orbit-strategy__empty-stack">
      <Surface
        aria-label={t("strategy.home.title")}
        data-testid="orbit-strategy-home"
        meta={t("strategy.home.meta")}
        title={t("strategy.home.title")}
      >
        <p className="orbit-strategy__empty-lead">{t("strategy.home.lead")}</p>
        <div className="orbit-strategy__entry" data-testid="orbit-strategy-entry">
          {continueEvent ? (
            <Featured
              className="orbit-strategy__entry-card"
              data-testid="orbit-strategy-continue"
              interactive
              onClick={() => selectEvent(continueEvent.id)}
            >
              <span className="orbit-eyebrow">{t("strategy.home.continue")}</span>
              <span className="orbit-path__k">{continueEvent.name}</span>
              <span className="orbit-path__d">{savedSummary(continueEvent)}</span>
              <span className="orbit-strategy__entry-when">{lastEditLabel(continueEvent)}</span>
            </Featured>
          ) : null}
          <Featured
            className="orbit-strategy__entry-card"
            data-testid="orbit-strategy-new-strategy"
            interactive
            onClick={startWizard}
          >
            <span className="orbit-eyebrow">{t("strategy.home.newEyebrow")}</span>
            <span className="orbit-path__k">{t("strategy.home.new")}</span>
            <span className="orbit-path__d">{t("strategy.home.newHint")}</span>
          </Featured>
        </div>
      </Surface>

      {calendarRaceView}

      <Surface
        aria-label={t("strategy.home.saved")}
        data-testid="orbit-strategy-saved"
        fill
        meta={formatMessage(t("strategy.home.savedMeta"), { n: savedEvents.length })}
        title={t("strategy.home.saved")}
      >
        {savedEvents.length === 0 ? (
          <Note title={t("strategy.home.emptyTitle")}>{t("strategy.home.empty")}</Note>
        ) : (
          <div className="orbit-list orbit-strategy__saved" data-testid="orbit-strategy-saved-list">
            {savedEvents.map((record) => (
              <div className="orbit-strategy__saved-row" key={record.id}>
                <ListRow
                  onClick={() => selectEvent(record.id)}
                  subtitle={savedSummary(record)}
                  title={record.name}
                  trailing={
                    <span className="orbit-when">{formatStartTime(new Date(record.startAt))}</span>
                  }
                />
                <div className="orbit-strategy__saved-acts">
                  <Button
                    data-testid={`orbit-strategy-open-${record.id}`}
                    onClick={() => selectEvent(record.id)}
                    size="sm"
                    variant="primary"
                  >
                    {t("strategy.home.open")}
                  </Button>
                  <Button
                    aria-label={formatMessage(t("strategy.home.duplicateName"), {
                      name: record.name,
                    })}
                    data-testid={`orbit-strategy-duplicate-${record.id}`}
                    onClick={() => duplicateEvent(record.id)}
                    size="sm"
                    variant="ghost"
                  >
                    {t("strategy.home.duplicate")}
                  </Button>
                  <Button
                    aria-label={formatMessage(t("strategy.home.deleteName"), { name: record.name })}
                    data-testid={`orbit-strategy-delete-${record.id}`}
                    onClick={() => setPendingDelete(record.id)}
                    size="sm"
                    variant="danger"
                  >
                    {t("strategy.home.delete")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Surface>
    </div>
  );

  // ── entrada: menú, asistente o formulario ───────────────────────────────
  if (!eventRecord || !strategyEvent || !storedActive) {
    return (
      <div className="orbit-strategy orbit-strategy--empty" data-testid="orbit-strategy">
        {contextSlot ? createPortal(context, contextSlot) : null}
        <StrategyColdStartBanner client={applicationClient} onImported={() => setSessionCatalogRetry((value) => value + 1)} t={t} />
        {form ? eventForm : (wizardView ?? entryMenu)}
        {editorFailureView}
        {deleteDialog}
        {migrationDialog}
      </div>
    );
  }

  if (!eventCombination && sessionPickerDismissed !== eventRecord.id && sessionCatalog.status === "ready") {
    return (
      <div className="orbit-strategy orbit-strategy--empty" data-testid="orbit-strategy">
        {contextSlot ? createPortal(context, contextSlot) : null}
        <StrategyColdStartBanner client={applicationClient} onImported={() => setSessionCatalogRetry((value) => value + 1)} t={t} />
        {sessionPickerView}
        {editorFailureView}
        {migrationDialog}
      </div>
    );
  }

  if (!calculationCurrent) {
    return (
      <div className="orbit-strategy orbit-strategy--empty" data-testid="orbit-strategy">
        {contextSlot ? createPortal(context, contextSlot) : null}
        <Surface data-testid="orbit-strategy-calculation-loading" title={t("strategy.calculation.loading")}>
          <p role="status">{t("strategy.calculation.loadingHint")}</p>
        </Surface>
        {editorFailureView}
        {migrationDialog}
      </div>
    );
  }

  if (calculation.status === "error" || !active || !plan) {
    const message = calculation.status === "error" ? calculation.message : t("strategy.calculation.missing");
    const detail = calculation.status === "error"
      ? [calculation.code, calculation.field].filter(Boolean).join(" · ")
      : "";
    return (
      <div className="orbit-strategy orbit-strategy--empty" data-testid="orbit-strategy">
        {contextSlot ? createPortal(context, contextSlot) : null}
        <Surface data-testid="orbit-strategy-calculation-error" title={t("strategy.calculation.error")}>
          <p role="alert">{message}</p>
          {detail ? <p className="orbit-strategy__meta">{detail}</p> : null}
          <Button onClick={() => setCalculationRetry((value) => value + 1)} variant="primary">
            {t("strategy.calculation.retry")}
          </Button>
        </Surface>
        {editorFailureView}
        {migrationDialog}
      </div>
    );
  }


  const event = strategyEvent;
  const drivers = eventRecord.drivers;
  /** Tablero de un solo piloto: elección del asistente (ISA-377). */
  const soloBoard = eventRecord.teamMode === "solo";

  // ── derivados de las pestañas Estrategias y Disponibilidad ──────────────
  const cards = Object.values(variants);
  const eco = cards.find((variant) => plansById[variant.id]?.savingApplied);
  const ecoPlan = eco ? plansById[eco.id] : undefined;
  const ecoComparison = eco && calculation.status === "success" && calculationCurrent
    ? calculation.result.comparisons[eco.id]
    : undefined;
  const analysisClasses = calendar.calendar?.series
    ?.find((series) => series.id === eventRecord.seriesId)
    ?.classes?.map((item) => item.name) ?? [event.vehicleClass];
  const others = cards.filter((variant) => variant.id !== active.id);
  const compare = others.find((variant) => variant.id === compareId) ?? others[0];
  const verdict = compare && calculation.status === "success" && calculationCurrent
    ? calculation.result.comparisons[compare.id] ?? null
    : null;
  const verdictText = verdict
    ? formatMessage(t("strategy.cards.verdict"), {
        winner: variants[verdict.winnerId]?.name ?? "",
        a: verdict.winnerLaps,
        b: verdict.loserLaps,
        diff: verdict.diff === 0 ? t("strategy.cards.tie") : `+${verdict.diff}`,
        reason: verdict.sameStops
          ? t("strategy.cards.same")
          : formatMessage(t("strategy.cards.saves"), {
              n: verdict.savedStops,
              s: verdict.savedS.toFixed(0),
              cost: verdict.costS.toFixed(0),
            }) + (verdict.pays ? t("strategy.cards.pays") : t("strategy.cards.noPays")),
        stints: verdict.stints,
        drivers: verdict.driverCount,
        doubles: verdict.doubles.join(", ") || t("strategy.cards.nobody"),
      })
    : null;

  const availRanges: Record<string, AvailRange[]> = Object.fromEntries(
    drivers.map((driver) => [
      driver.id,
      (availability[driver.id] ?? FULL_AVAILABILITY).map((segment) => ({
        from: segment.from / 60,
        to: segment.to / 60,
        state: segment.state,
      })),
    ]),
  );
  const avDriverId = avDriver || drivers[0]?.id || "";
  const timelineStart = event.startISO
    ? new Date(event.startISO)
    : (() => {
        const base = new Date();
        base.setHours(Math.floor(event.startMin / 60), event.startMin % 60, 0, 0);
        return base;
      })();
  const spanMin = Math.ceil(event.durationMin * 1.02);
  const slices = distributionView(plan, drivers);
  const donutSlices: DonutSlice[] = slices.map((slice) => ({
    id: slice.driver.id,
    label: `${slice.driver.name.split(" ")[0]} · ${
      donutMode === "laps" ? slice.laps : clockTime(slice.time)
    }`,
    value: donutMode === "laps" ? slice.laps : slice.time,
    color: slice.driver.color,
  }));
  const totalTime = slices.reduce((sum, slice) => sum + slice.time, 0);
  const tankInputView = strategyInputProvenance(eventPlanningInputs, "tank_liters", event.tankL);
  const pitInputView = strategyInputProvenance(eventPlanningInputs, "pit_loss_seconds", event.pitS);
  const effectiveTankLiters = tankInputView.value;
  const effectivePitSeconds = pitInputView.value;

  const blocksOf = (driver: StrategyDriver): TimelineBlock[] => {
    const mine = plan.stints.filter((stint) => stint.d === driver.id);
    const stints: TimelineBlock[] = mine.map((stint) => ({
      id: String(stint.i),
      start: new Date(timelineStart.getTime() + stint.start * 1000),
      durationMin: (stint.end - stint.start) / 60,
      color: driver.color,
      label: `S${stint.i + 1}`,
    }));
    const pits: TimelineBlock[] = mine
      .filter((stint) => stint.i < plan.stints.length - 1)
      .map((stint) => ({
        id: `pit-${stint.i}`,
        start: new Date(timelineStart.getTime() + stint.end * 1000),
        durationMin: (effectivePitSeconds ?? 0) / 60,
        color: "var(--orbit-ember)",
        label: t("strategy.pit.label"),
      }));
    return [...stints, ...pits];
  };

  const tyreView = (tyre: StrategyTyre): TyreView => {
    const condition = tyreCondition(tyre, uses[tyre.id]?.length ?? 0);
    return {
      id: tyre.id,
      compound: chipCompound(tyre),
      condition: condition.max,
      label: t("strategy.tyres.free"),
    };
  };

  const modeLabel =
    active.mode === "wet"
      ? t("strategy.stints.wet")
      : active.mode === "eco"
        ? t("strategy.stints.eco")
        : t("strategy.stints.dry");
  const lifecycleReference = lifecycle.state?.savedRevision ?? lifecycle.state?.activePlan?.revision;
  const lifecycleStatus = lifecycle.status === "loading" || lifecycleReference || lifecycle.failure ? (
    <div className="orbit-note" data-testid="orbit-strategy-revision-status">
      {lifecycle.status === "loading" ? <span role="status">{t("strategy.lifecycle.loading")}</span> : null}
      {lifecycleReference ? (
        <>
          <b>{visibleRevisionIsActive ? t("strategy.lifecycle.active") : t("strategy.lifecycle.saved")}</b>
          <span>{lifecycleReference.revisionId} · {lifecycleReference.contentHash.slice(0, 12)}</span>
        </>
      ) : null}
      {lifecycle.status === "error" && lifecycle.failure ? (
        <div data-testid="orbit-strategy-lifecycle-error" role="alert">
          <b>{t("strategy.lifecycle.error")}</b>
          <span>{lifecycle.failure.message}</span>
          {[lifecycle.failure.code, lifecycle.failure.field].filter(Boolean).join(" · ") ? (
            <small>{[lifecycle.failure.code, lifecycle.failure.field].filter(Boolean).join(" · ")}</small>
          ) : null}
          <Button onClick={() => setLifecycleRetry((value) => value + 1)} size="sm" variant="ghost">
            {t("strategy.lifecycle.retry")}
          </Button>
        </div>
      ) : null}
    </div>
  ) : null;
  const sessionDecisionByID = new Map(eventSessionDecisions.map((session) => [session.sessionId, session.included]));
  const sessionsPanel = sessionCatalog.status === "error" ? (
    <Note title={t("strategy.sessions.errorTitle")}>
      {sessionCatalog.message}
      <Button onClick={() => setSessionCatalogRetry((value) => value + 1)} size="sm" variant="ghost">
        {t("strategy.sessions.retry")}
      </Button>
    </Note>
  ) : !eventCombination ? (
    <Note title={t("strategy.sessions.manualTitle")}>{t("strategy.sessions.manual")}</Note>
  ) : (
    <div className="orbit-strategy__sessions" data-testid="orbit-strategy-sessions">
      <div className="orbit-strategy__sessions-head">
        <b>{eventCombination.trackName} · {eventCombination.carName}</b>
        <span>{eventCombination.carClass}</span>
      </div>
      {eventCombination.sessions.map((session) => {
        const included = sessionDecisionByID.get(session.sessionId) ?? session.defaultIncluded;
        const reason = included
          ? t("strategy.sessions.included")
          : session.defaultIncluded
            ? t("strategy.sessions.userExcluded")
            : t(`strategy.sessions.reason.${session.exclusionReason ?? "no_completed_lap"}`);
        return (
          <div className="orbit-strategy__session-row" data-included={included ? "true" : "false"} key={session.sessionId}>
            <span>
              <b>{t(`strategy.sessions.type.${session.type}`)}</b>
              <small>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(session.lastActivity))}</small>
            </span>
            <span className="orbit-strategy__session-reason">{reason}</span>
            <Button
              aria-pressed={included}
              disabled={sessionSave === "saving"}
              onClick={() => void toggleSession(session.sessionId)}
              size="sm"
              variant={included ? "ghost" : "primary"}
            >
              {included ? t("strategy.sessions.exclude") : t("strategy.sessions.include")}
            </Button>
          </div>
        );
      })}
      {sessionSave === "error" ? <p role="alert">{t("strategy.sessions.saveError")}</p> : null}
    </div>
  );
  const planningInputsPanel = (
    <div className="orbit-planning-inputs" data-testid="orbit-planning-inputs">
      {([
        ["fuel_per_lap_liters", t("strategy.inputs.field.fuel"), "L/v", drivers[0]?.dry[1]],
        ["ve_per_lap_percent", t("strategy.inputs.field.ve"), "%/v", undefined],
        ["base_pace_seconds", t("strategy.inputs.field.pace"), "s", drivers[0]?.dry[0]],
        ["tank_liters", t("strategy.inputs.field.tank"), "L", event.tankL],
        ["pit_loss_seconds", t("strategy.inputs.field.pit"), "s", event.pitS],
        ["tyre_life_laps", t("strategy.inputs.field.tyreLife"), t("strategy.inputs.unit.laps"), undefined],
        ["degradation_per_lap_seconds", t("strategy.inputs.field.degradation"), "s/v", undefined],
        ["saving_fuel_per_lap", t("strategy.inputs.field.savingFuel"), "L/v", undefined],
        ["saving_time_cost_per_lap", t("strategy.inputs.field.savingCost"), "s/v", undefined],
      ] as const).map(([field, label, unit, fallback]) => (
        <PlanningInputRow
          field={field}
          key={field}
          label={label}
          onCommit={(changedField, value) => void commitPlanningInput(changedField, value)}
          t={t}
          unit={unit}
          view={strategyInputProvenance(eventPlanningInputs, field, fallback)}
        />
      ))}
    </div>
  );
  const weatherPanel = (
    <StrategyWeatherPanel
      combinationId={eventCombination?.combinationId}
      eventId={eventRecord.id}
      onSave={commitWeatherScenarios}
      result={calculation.status === "success" && calculationCurrent ? calculation.result.weather : undefined}
      saving={weatherSave}
      scenarios={eventWeatherScenarios}
      t={t}
    />
  );

  return (
    <div className="orbit-strategy" data-testid="orbit-strategy">
      {contextSlot ? createPortal(context, contextSlot) : null}
      {migrationDialog}

      <StrategyColdStartBanner client={applicationClient} onImported={() => setSessionCatalogRetry((value) => value + 1)} t={t} />

      <header className="orbit-strategy__head">
        <Monogram
          g1="var(--orbit-coral)"
          g2="var(--orbit-wine)"
          size={52}
          text={event.monogram}
        />
        <div className="orbit-strategy__copy">
          <div className="orbit-strategy__crumb">
            <span>{t("strategy.crumb")}</span>
            <i aria-hidden="true">›</i>
            <b data-testid="orbit-strategy-name">{active.name}</b>
            <StateChip state={active.state === "ok" ? "ok" : "draft"}>
              {active.state === "ok" ? t("strategy.upToDate") : t("strategy.draft")}
            </StateChip>
          </div>
          <h2>{event.name}</h2>
          <p>{event.subtitle}</p>
          <div className="orbit-strategy__chips">
            <Chip caseNormal icon="i-carreras">
              {formatMessage(t("strategy.chip.when"), {
                day: event.dayLabel,
                from: hhmm(event.startMin),
                to: hhmm(event.startMin + event.durationMin),
              })}
            </Chip>
            <Chip caseNormal>{formatMessage(t("strategy.chip.duration"), { min: event.durationMin })}</Chip>
            {event.vehicleClass ? <Chip tier="silver">{event.vehicleClass}</Chip> : null}
            {event.team ? <Chip caseNormal>{event.team}</Chip> : null}
          </div>
        </div>
        <div className="orbit-strategy__actions">
          <Button
            data-testid="orbit-strategy-back"
            icon="i-estrategia"
            onClick={backToMenu}
            variant="ghost"
          >
            {t("strategy.backToMenu")}
          </Button>
          <Button
            data-testid="orbit-strategy-save-revision"
            disabled={lifecycle.status === "loading" || lifecycle.status === "busy"}
            onClick={() => void saveVisibleRevision()}
            variant="primary"
          >
            {t("strategy.lifecycle.save")}
          </Button>
          <Button
            data-testid="orbit-strategy-activate-revision"
            disabled={!lifecycle.state?.savedRevision || lifecycle.status === "busy" || visibleRevisionIsActive}
            onClick={() => void activateVisibleRevision()}
            variant="ghost"
          >
            {visibleRevisionIsActive ? t("strategy.lifecycle.active") : t("strategy.lifecycle.activate")}
          </Button>
          <Menu
            items={[
              {
                id: "telemetry",
                title: t("strategy.menu.telemetry"),
                description: t("strategy.menu.telemetryHint"),
                onSelect: () => toast.show(t("strategy.menu.telemetry"), t("strategy.menu.soon")),
              },
              {
                id: "fuel",
                title: t("strategy.menu.fuel"),
                description: t("strategy.menu.fuelHint"),
                onSelect: () => toast.show(t("strategy.menu.fuel"), t("strategy.menu.soon")),
              },
              {
                id: "info",
                title: t("strategy.menu.info"),
                description: t("strategy.menu.infoHint"),
                onSelect: openEdit,
              },
              {
                id: "export",
                title: t("strategy.menu.export"),
                description: t("strategy.menu.exportHint"),
                onSelect: () => void exportPlan(),
              },
            ]}
            label={t("strategy.menu.label")}
            trigger={
              <Button data-testid="orbit-strategy-settings" icon="i-ajustes" variant="ghost">
                {t("strategy.settings")}
              </Button>
            }
          />
          <Button data-testid="orbit-strategy-reset" onClick={reset} variant="ghost">
            {t("strategy.reset")}
          </Button>
        </div>
      </header>

      {editorFailureView}
      {lifecycleStatus}

      <UnderlineTabs<StrategyTab>
        className="orbit-strategy__tabs"
        label={t("strategy.tabs.label")}
        onChange={setTab}
        tabs={[
          { id: "overview", label: t("strategy.tabs.overview") },
          { id: "analysis", label: t("strategy.tabs.analysis") },
          { id: "strategies", label: t("strategy.tabs.strategies") },
          // Un evento en solitario no reparte turnos: la pestaña sobraría.
          ...(soloBoard ? [] : [{ id: "availability" as const, label: t("strategy.tabs.availability") }]),
        ]}
        value={tab}
      />

      {form ? eventForm : tab === "analysis" ? (
        <StrategyAnalysisPanel
          active={active}
          classes={analysisClasses}
          comparison={ecoComparison}
          eco={eco}
          ecoPlan={ecoPlan}
          event={event}
          eventProvenance={eventRecord.source === "series" ? "reference" : eventRecord.fillMode === "telemetry" ? "derived" : "manual"}
          plan={plan}
          planningInputs={eventPlanningInputs}
          start={timelineStart}
          t={t}
        />
      ) : tab === "strategies" ? (
        <div className="orbit-strategy__pane" data-testid="orbit-strategy-strategies">
          <div className="orbit-strats-grid">
            {cards.map((variant) => {
              const q = plansById[variant.id];
              return (
                <article
                  className="orbit-strat-card"
                  data-active={variant.id === active.id && visibleRevisionIsActive ? "true" : undefined}
                  data-testid={`orbit-strat-${variant.id}`}
                  key={variant.id}
                >
                  <h4>
                    {variant.name}
                    <StateChip state={variant.state === "ok" ? "ok" : "draft"}>
                      {variant.state === "ok" ? t("strategy.upToDate") : t("strategy.draft")}
                    </StateChip>
                  </h4>
                  <p>{variant.note}</p>
                  <dl>
                    <dt>{t("strategy.cards.stintsStops")}</dt>
                    <dd>
                      {q.stints.length} · {q.stops}
                    </dd>
                    <dt>{t("strategy.cards.laps")}</dt>
                    <dd>{q.totalLaps}</dd>
                    <dt>{t("strategy.cards.avgPace")}</dt>
                    <dd>{lapTime(q.avgPace)}</dd>
                    <dt>{t("strategy.cards.avgFuel")}</dt>
                    <dd>{q.avgFuel.toFixed(2)} L/v</dd>
                    <dt>{t("strategy.cards.total")}</dt>
                    <dd>{clockTime(q.total)}</dd>
                  </dl>
                  <div className="orbit-strat-card__acts">
                    {variant.id === active.id ? (
                      <Button
                        data-tip={visibleRevisionIsActive ? t("strategy.cards.activeTip") : t("strategy.lifecycle.selectedTip")}
                        data-tip-side="top"
                        disabled
                        size="sm"
                        variant="ghost"
                      >
                        {visibleRevisionIsActive ? t("strategy.cards.active") : t("strategy.lifecycle.selected")}
                      </Button>
                    ) : (
                      <Button
                        data-testid={`orbit-strat-select-${variant.id}`}
                        onClick={() => selectVariant(variant.id)}
                        size="sm"
                        variant="primary"
                      >
                        {t("strategy.lifecycle.select")}
                      </Button>
                    )}
                    <Button
                      data-testid={`orbit-strat-duplicate-${variant.id}`}
                      onClick={() => duplicate(variant.id)}
                      size="sm"
                      variant="ghost"
                    >
                      {t("strategy.cards.duplicate")}
                    </Button>
                  </div>
                </article>
              );
            })}
            <button
              className="orbit-strat-card orbit-strat-card--new"
              data-testid="orbit-strategy-new-card"
              onClick={() => createStrategy()}
              type="button"
            >
              <b>{t("strategy.new")}</b>
              <span>{t("strategy.cards.newNote")}</span>
            </button>
          </div>

          <Surface
            actions={
              others.length > 1 && compare ? (
                <Select
                  label={t("strategy.cards.compare")}
                  onChange={setCompareId}
                  options={others.map((variant) => ({ value: variant.id, label: variant.name }))}
                  value={compare.id}
                />
              ) : undefined
            }
            aria-label={t("strategy.cards.compare")}
            meta={t("strategy.cards.compareMeta")}
            title={t("strategy.cards.compare")}
          >
            <p className="orbit-strategy__verdict" data-testid="orbit-strategy-verdict">
              {verdictText ?? t("strategy.cards.compareNone")}
            </p>
          </Surface>
        </div>
      ) : tab === "availability" ? (
        <div className="orbit-strategy__pane" data-testid="orbit-strategy-availability">
          <Surface
            aria-label={t("strategy.availability.title")}
            meta={formatMessage(t("strategy.availability.range"), {
              from: hhmm(AVAILABILITY_FROM),
              to: hhmm(AVAILABILITY_TO),
            })}
            title={t("strategy.availability.title")}
          >
            <AvailabilityBoard
              drivers={drivers.map((driver) => ({
                id: driver.id,
                name: driver.name,
                color: driver.color,
              }))}
              from={AVAILABILITY_FROM / 60}
              label={t("strategy.availability.title")}
              ranges={availRanges}
              to={AVAILABILITY_TO / 60}
            />
          </Surface>

          <Surface
            aria-label={t("strategy.availability.add")}
            meta={t("strategy.availability.addHint")}
            title={t("strategy.availability.add")}
          >
            <form
              className="orbit-avail-form"
              data-testid="orbit-availability-form"
              onSubmit={(formEvent) => {
                formEvent.preventDefault();
                addSlot(avDriverId, avState, avFrom, avTo);
              }}
            >
              <Field htmlFor="orbit-av-driver" label={t("strategy.availability.driver")}>
                <Select
                  id="orbit-av-driver"
                  label={t("strategy.availability.driver")}
                  onChange={(value) => {
                    setAvailabilityDirty(true);
                    setAvDriver(value);
                  }}
                  options={drivers.map((driver) => ({ value: driver.id, label: driver.name }))}
                  value={avDriverId}
                />
              </Field>
              <Field htmlFor="orbit-av-state" label={t("strategy.availability.status")}>
                <Select<AvailabilityState>
                  id="orbit-av-state"
                  label={t("strategy.availability.status")}
                  onChange={(value) => {
                    setAvailabilityDirty(true);
                    setAvState(value);
                  }}
                  options={[
                    { value: "ok", label: t("strategy.availability.ok") },
                    { value: "maybe", label: t("strategy.availability.maybe") },
                    { value: "no", label: t("strategy.availability.no") },
                  ]}
                  value={avState}
                />
              </Field>
              <Field htmlFor="orbit-av-from" label={t("strategy.availability.from")}>
                <Input
                  aria-label={t("strategy.availability.from")}
                  id="orbit-av-from"
                  numeric
                  onChange={(changed) => {
                    setAvailabilityDirty(true);
                    setAvFrom(changed.currentTarget.value);
                  }}
                  step={300}
                  type="time"
                  value={avFrom}
                />
              </Field>
              <Field htmlFor="orbit-av-to" label={t("strategy.availability.to")}>
                <Input
                  aria-label={t("strategy.availability.to")}
                  id="orbit-av-to"
                  numeric
                  onChange={(changed) => {
                    setAvailabilityDirty(true);
                    setAvTo(changed.currentTarget.value);
                  }}
                  step={300}
                  type="time"
                  value={avTo}
                />
              </Field>
              <Button type="submit" variant="primary">
                {t("strategy.availability.submit")}
              </Button>
            </form>
          </Surface>
        </div>
      ) : (
        <div className="orbit-strategy__overview" data-testid="orbit-strategy-overview">
          <StatRow className="orbit-strategy__kpis">
            <StatTile
              label={t("strategy.kpi.duration")}
              sub={formatMessage(t("strategy.kpi.durationHint"), {
                from: hhmm(event.startMin),
                to: hhmm(event.startMin + event.durationMin),
              })}
              value={`${Math.floor(event.durationMin / 60)}h${String(event.durationMin % 60).padStart(2, "0")}m`}
            />
            <StatTile
              label={t("strategy.kpi.tank")}
              sub={`${formatMessage(t("strategy.kpi.tankHint"), {
                laps: plan.maxLaps,
                l: plan.avgFuel.toFixed(2),
              })} · ${t(`strategy.inputs.chip.${tankInputView.kind}`)}`}
              value={effectiveTankLiters === undefined ? "—" : `${effectiveTankLiters} L`}
            />
            <StatTile
              label={t("strategy.kpi.pit")}
              sub={`${t("strategy.kpi.pitHint")} · ${t(`strategy.inputs.chip.${pitInputView.kind}`)}`}
              value={effectivePitSeconds === undefined ? "—" : lapTime(effectivePitSeconds)}
            />
            <StatTile
              label={t("strategy.kpi.stops")}
              sub={formatMessage(t("strategy.kpi.stopsHint"), {
                stints: plan.stints.length,
                laps: plan.totalLaps,
              })}
              value={plan.stops}
            />
          </StatRow>

          {eventCombination || catalogView ? (
            <div className="orbit-strategy__evidence">
              {eventCombination ? (
                <StrategyValidatedExamplesPanel locale={locale} state={validatedExamples} t={t} />
              ) : null}
              {catalogView ? (
                <StrategyReferencePanel
                  client={applicationClient}
                  event={eventRecord}
                  existing={catalogView.events.find((candidate) => candidate.id === eventRecord.id)}
                  onSaved={(saved, repositoryVersion) => setSessionCatalog((current) => {
                    if (current.status !== "ready") return current;
                    const events = [...current.view.events.filter((candidate) => candidate.id !== saved.id), saved];
                    return { status: "ready", view: { ...current.view, repositoryVersion, events, planningByEvent: saved.planningInputs ? { ...current.view.planningByEvent, [saved.id]: saved.planningInputs } : current.view.planningByEvent } };
                  })}
                  repositoryVersion={catalogView.repositoryVersion}
                  t={t}
                />
              ) : null}
            </div>
          ) : null}

          <div className="orbit-strategy__grid">
            <Surface
              aria-label={t("strategy.timeline.title")}
              meta={t("strategy.timeline.hint")}
              title={t("strategy.timeline.title")}
            >
              <HorizontalTimeline
                blocks={blocksOf}
                headWidth={150}
                label={t("strategy.timeline.title")}
                onBlock={(id) => {
                  if (id.startsWith("pit-")) return;
                  setSelected(Number(id));
                  scrollToStint(Number(id));
                }}
                rowLabel={(driver: StrategyDriver) => (
                  <span className="orbit-strategy__tl-driver">
                    <i aria-hidden="true" style={{ background: driver.color }} />
                    {driver.name}
                  </span>
                )}
                rows={drivers}
                selected={selected >= 0 ? String(selected) : undefined}
                spanMin={spanMin}
                start={timelineStart}
                tickEveryMin={30}
              />
            </Surface>

            <Surface
              actions={
                <Seg<DonutMode>
                  label={t("strategy.distribution.title")}
                  onChange={setDonutMode}
                  options={[
                    { value: "laps", label: t("strategy.distribution.laps") },
                    { value: "time", label: t("strategy.distribution.time") },
                  ]}
                  value={donutMode}
                />
              }
              aria-label={t("strategy.distribution.title")}
              title={t("strategy.distribution.title")}
            >
              <Donut
                centerLabel={t("strategy.distribution.total")}
                centerValue={
                  donutMode === "laps"
                    ? formatMessage(t("strategy.distribution.lapsValue"), { n: plan.totalLaps })
                    : clockTime(totalTime)
                }
                slices={donutSlices}
              />
            </Surface>
          </div>

          <div className="orbit-strategy__grid2">
            <section aria-label={t("strategy.stints.title")} className="orbit-strategy__stints">
              <div className="orbit-strategy__stints-head">
                <h3>{t("strategy.stints.title")}</h3>
                <span className="orbit-strategy__meta">{t("strategy.stints.hint")}</span>
                <Button data-testid="orbit-strategy-spread" onClick={spread} size="sm" variant="ghost">
                  {t("strategy.stints.autoAssign")}
                </Button>
              </div>
              <p className="orbit-strategy__edge">
                {formatMessage(t("strategy.stints.start"), {
                  time: hhmm(event.startMin),
                  fuel: Math.min(effectiveTankLiters ?? 0, plan.stints[0]?.fuel ?? 0).toFixed(0),
                })}
              </p>

              <div className="orbit-strategy__list" data-testid="orbit-strategy-list" ref={listRef}>
                {plan.stints.map((stint, index) => {
                  const driver = driversById[stint.d];
                  const corners = active.tyres[stint.i] ?? {};
                  return (
                    <Fragment key={stint.i}>
                      <div
                        className="orbit-stint"
                        data-selected={selected === stint.i ? "true" : undefined}
                        data-laps={stint.laps}
                        data-stint={stint.i}
                        data-testid={`orbit-stint-${stint.i}`}
                      >
                        {/* Asa visual del prototipo: el orden se cambia con el
                            Select de piloto, no arrastrando la tarjeta. */}
                        <span aria-hidden="true" className="orbit-stint__grip">
                          ⋮⋮
                        </span>
                        <span className="orbit-stint__n">#{index + 1}</span>
                        <span className="orbit-stint__cell">
                          <span className="orbit-stint__k">{t("strategy.stints.driver")}</span>
                          <span
                            className="orbit-stint__driver"
                            style={{ "--orbit-driver": driver?.color } as React.CSSProperties}
                          >
                            <i aria-hidden="true" />
                            <Select
                              label={formatMessage(t("strategy.stints.driverOf"), { n: index + 1 })}
                              onChange={(value) => setDriver(stint.i, value)}
                              options={drivers.map((item) => ({ value: item.id, label: item.name }))}
                              value={stint.d}
                            />
                          </span>
                        </span>
                        <span className="orbit-stint__cell">
                          <span className="orbit-stint__k">{t("strategy.stints.time")}</span>
                          <span className="orbit-stint__v orbit-stint__v--num">
                            {hhmm(stintClock(event, stint.start))} – {hhmm(stintClock(event, stint.end))}
                          </span>
                        </span>
                        <span className="orbit-stint__cell">
                          <span className="orbit-stint__k">{t("strategy.stints.laps")}</span>
                          <span className="orbit-stint__v orbit-stint__v--num">
                            {stint.laps} <small>{stint.lap0}–{stint.lap1}</small>
                          </span>
                        </span>
                        <span className="orbit-stint__cell">
                          <span className="orbit-stint__k">{t("strategy.stints.fuel")}</span>
                          <span
                            className="orbit-stint__v orbit-stint__v--num"
                            data-warn={stint.over ? "true" : undefined}
                          >
                            {stint.fuel.toFixed(1)} L
                          </span>
                        </span>
                        <span className="orbit-stint__cell">
                          <span className="orbit-stint__k">{t("strategy.stints.pitWindow")}</span>
                          <span className="orbit-stint__v orbit-stint__v--num">
                            {index < plan.stints.length - 1
                              ? `${hhmm(stintClock(event, stint.pitWindowSeconds))} (~V${stint.pitWindowLap})`
                              : "—"}
                          </span>
                        </span>
                        <span className="orbit-stint__cell">
                          <span className="orbit-stint__k">{t("strategy.stints.setup")}</span>
                          <Chip caseNormal tone={active.mode === "wet" ? "reference" : "warn"}>
                            {modeLabel}
                          </Chip>
                        </span>
                        <span className="orbit-stint__acts">
                          <button
                            aria-expanded={editing === stint.i}
                            aria-label={formatMessage(t("strategy.stints.edit"), { n: index + 1 })}
                            className="orbit-icon-btn orbit-icon-btn--28"
                            data-testid={`orbit-stint-edit-${stint.i}`}
                            onClick={() => {
                              const next = editing === stint.i ? -1 : stint.i;
                              setEditing(next);
                              setSelected(stint.i);
                              if (next >= 0) scrollToStint(stint.i);
                            }}
                            type="button"
                          >
                            <svg
                              aria-hidden="true"
                              fill="none"
                              height="14"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.4"
                              viewBox="0 0 16 16"
                              width="14"
                            >
                              <path d="M11.5 2.5l2 2L6 12H4v-2z" />
                            </svg>
                          </button>
                          {stint.manual ? (
                            <span
                              aria-label={t("strategy.stints.manual")}
                              className="orbit-stint__flag orbit-stint__flag--manual"
                              data-testid={`orbit-stint-manual-${stint.i}`}
                              role="img"
                            >
                              ✎
                            </span>
                          ) : null}
                          {stint.over ? (
                            <span
                              aria-label={t("strategy.stints.over")}
                              className="orbit-stint__flag orbit-stint__flag--over"
                              role="img"
                            >
                              !
                            </span>
                          ) : null}
                        </span>
                      </div>

                      {editing === stint.i ? (
                        <div className="orbit-stint-editor" data-testid={`orbit-stint-editor-${stint.i}`}>
                          <div className="orbit-stint-editor__fields">
                            <label className="orbit-stint-editor__field">
                              <span>{t("strategy.editor.laps")}</span>
                              <Input
                                defaultValue={String(stint.laps)}
                                inputMode="numeric"
                                key={`laps-${stint.i}-${stint.laps}`}
                                numeric
                                onBlur={(e) => {
                                  setOverride(stint.i, "laps", e.currentTarget.value);
                                  endStintInput(`${stint.i}:laps`);
                                }}
                                onInput={() => beginStintInput(`${stint.i}:laps`)}
                                aria-label={t("strategy.editor.laps")}
                              />
                              <InputProvenanceChip t={t} view={{ kind: "manual", presence: "valid", value: stint.laps, canRevert: false }} />
                            </label>
                            <label className="orbit-stint-editor__field">
                              <span>{t("strategy.editor.fuel")}</span>
                              <Input
                                defaultValue={stint.fuel.toFixed(1)}
                                inputMode="decimal"
                                key={`fuel-${stint.i}-${stint.fuel.toFixed(1)}`}
                                numeric
                                onBlur={(e) => {
                                  setOverride(stint.i, "fuel", e.currentTarget.value);
                                  endStintInput(`${stint.i}:fuel`);
                                }}
                                onInput={() => beginStintInput(`${stint.i}:fuel`)}
                                unit="L"
                                aria-label={t("strategy.editor.fuel")}
                              />
                              <InputProvenanceChip t={t} view={{ kind: "manual", presence: "valid", value: stint.fuel, canRevert: false }} />
                            </label>
                            <span className="orbit-stint-editor__field">
                              <span>{t("strategy.editor.pace")}</span>
                              <b className="orbit-stint__v orbit-stint__v--num">{lapTime(stint.pace)}</b>
                              <em>{t("strategy.editor.ofDriver")}</em>
                            </span>
                            <Button
                              disabled={!stint.manual}
                              onClick={() => clearOverride(stint.i)}
                              size="sm"
                              variant="ghost"
                            >
                              {t("strategy.editor.auto")}
                            </Button>
                          </div>
                          <div className="orbit-stint-editor__corners">
                            <div className="orbit-stint-editor__car">
                              <span className="orbit-stint-editor__axle">{t("strategy.editor.front")}</span>
                              {(["FL", "FR"] as OrbitCorner[]).map((corner) => (
                                <CornerSlot
                                  corner={corner}
                                  key={corner}
                                  onClear={() => clear(stint.i, corner)}
                                  onDrop={(id) => assign(stint.i, corner, id)}
                                  picked={Boolean(picked)}
                                  pickedId={picked ?? undefined}
                                  tyre={(() => {
                                    const mounted = inventory.find((item) => item.id === corners[corner]);
                                    return mounted ? tyreView(mounted) : undefined;
                                  })()}
                                />
                              ))}
                              <span className="orbit-stint-editor__axle">{t("strategy.editor.rear")}</span>
                              {(["RL", "RR"] as OrbitCorner[]).map((corner) => (
                                <CornerSlot
                                  corner={corner}
                                  key={corner}
                                  onClear={() => clear(stint.i, corner)}
                                  onDrop={(id) => assign(stint.i, corner, id)}
                                  picked={Boolean(picked)}
                                  pickedId={picked ?? undefined}
                                  tyre={(() => {
                                    const mounted = inventory.find((item) => item.id === corners[corner]);
                                    return mounted ? tyreView(mounted) : undefined;
                                  })()}
                                />
                              ))}
                            </div>
                            <p className="orbit-stint-editor__hint">{t("strategy.editor.hint")}</p>
                          </div>
                        </div>
                      ) : null}

                      {index < plan.stints.length - 1 ? (
                        <div className="orbit-pit" data-testid={`orbit-pit-${stint.i}`}>
                          <span aria-hidden="true" className="orbit-pit__line" />
                          <span className="orbit-pit__label">{t("strategy.pit.label")}</span>
                          <span className="orbit-pit__detail">
                            <span>
                              {t("strategy.pit.duration")} <b>{lapTime(event.pitS)}</b>
                            </span>
                            <span>
                              {t("strategy.pit.fuel")}{" "}
                              <b>{formatMessage(t("strategy.pit.inTank"), { tank: event.tankL })}</b>{" "}
                              {formatMessage(t("strategy.pit.added"), {
                                l: Math.min(event.tankL, plan.stints[index + 1].fuel).toFixed(1),
                              })}
                            </span>
                            <span>
                              {t("strategy.pit.lap")} <b>{stint.lap1}</b>
                            </span>
                            <span>
                              {t("strategy.pit.tyres")} <b>{t("strategy.pit.newSet")}</b>
                            </span>
                          </span>
                        </div>
                      ) : null}
                    </Fragment>
                  );
                })}
              </div>

              <p className="orbit-strategy__edge">
                {formatMessage(t("strategy.stints.end"), {
                  flag: hhmm(event.startMin + event.durationMin),
                  end: hhmm(stintClock(event, plan.total)),
                  laps: plan.totalLaps,
                })}
              </p>
            </section>

            <Surface
              actions={
                <Seg<SidePanel>
                  label={t("strategy.drivers.title")}
                  onChange={setPanel}
                  options={[
                    { value: "inputs", label: t("strategy.inputs.tab") },
                    { value: "drivers", label: t("strategy.drivers.title") },
                    { value: "tyres", label: t("strategy.drivers.tyres") },
                    { value: "sessions", label: t("strategy.sessions.title") },
                    { value: "weather", label: t("strategy.weather.tab") },
                  ]}
                  value={panel}
                />
              }
              aria-label={t("strategy.drivers.title")}
              className="orbit-strategy__side"
              fill
              meta={
                panel === "inputs"
                  ? (eventCombination ? t("strategy.inputs.combinedShort") : t("strategy.inputs.manualShort"))
                  : panel === "drivers"
                  ? String(drivers.length)
                  : panel === "tyres" ? formatMessage(t("strategy.drivers.inUse"), {
                      n: inventory.length,
                      used: Object.keys(uses).length,
                    })
                    : panel === "sessions"
                      ? String(eventCombination?.sessions.length ?? 0)
                      : String(eventWeatherScenarios.length)
              }
            >
              {panel === "inputs" ? planningInputsPanel : panel === "drivers" ? (
                <div className="orbit-strategy__drivers" data-testid="orbit-strategy-drivers">
                  {drivers.map((driver) => (
                    <article
                      className="orbit-driver"
                      key={driver.id}
                      style={{ "--orbit-driver": driver.color } as React.CSSProperties}
                    >
                      <div className="orbit-driver__head">
                        <span aria-hidden="true" className="orbit-driver__avatar">
                          {driver.ini}
                        </span>
                        <span className="orbit-driver__name">
                          <b>{driver.name}</b>
                          {driver.cls ? (
                            <Chip tier={driver.cls.startsWith("Gold") ? "gold" : "silver"}>{driver.cls}</Chip>
                          ) : null}
                        </span>
                      </div>
                      <div className="orbit-driver__paces">
                        {(
                          [
                            ["dry", t("strategy.drivers.dry"), "var(--orbit-ember)"],
                            ["wet", t("strategy.drivers.wet"), "var(--orbit-cyan)"],
                            ["eco", t("strategy.drivers.eco"), "var(--orbit-green)"],
                          ] as const
                        ).map(([mode, label, color]) => {
                          const paceView = mode === "eco"
                            ? strategyEcoProvenance(eventPlanningInputs, "base_pace_seconds", driver[mode][0])
                            : strategyInputProvenance(
                                eventPlanningInputs,
                                "base_pace_seconds",
                                driver[mode][0],
                                mode === "wet" ? "wet" : "dry",
                              );
                          const fuelView = mode === "eco"
                            ? strategyEcoProvenance(eventPlanningInputs, "fuel_per_lap_liters", driver[mode][1])
                            : strategyInputProvenance(
                                eventPlanningInputs,
                                "fuel_per_lap_liters",
                                driver[mode][1],
                                mode === "wet" ? "wet" : "dry",
                              );
                          return (
                            <div className="orbit-driver__pace" key={mode}>
                              <span>
                                <i aria-hidden="true" style={{ background: color }} />
                                {label}
                              </span>
                              <EffectiveInputDisplay as="b" format={lapTime} t={t} view={paceView} />
                              <EffectiveInputDisplay as="em" format={(value) => `${value.toFixed(2)} L/v`} t={t} view={fuelView} />
                            </div>
                          );
                        })}
                      </div>
                      {/* Los pilotos son del evento local: sus ritmos y su
                          consumo se editan aquí y el plan se recalcula
                          (D-W4-3, sustituye al botón muerto de D-94). */}
                      <Button
                        aria-expanded={editDriver === driver.id}
                        data-testid={`orbit-driver-edit-${driver.id}`}
                        onClick={() =>
                          setEditDriver((current) => (current === driver.id ? null : driver.id))
                        }
                        size="sm"
                        variant="ghost"
                      >
                        {t("strategy.drivers.edit")}
                      </Button>
                      {editDriver === driver.id ? (
                        <div
                          className="orbit-driver__editor"
                          data-testid={`orbit-driver-editor-${driver.id}`}
                        >
                          <label className="orbit-driver__field">
                            <span>{t("strategy.drivers.name")}</span>
                            <Input
                              aria-label={t("strategy.drivers.name")}
                              onChange={(changed) =>
                                patchDriver(driver.id, (item) => ({
                                  ...item,
                                  name: changed.currentTarget.value,
                                }))
                              }
                              value={driver.name}
                            />
                          </label>
                          {(["dry", "wet", "eco"] as const).map((mode) => (
                            <div className="orbit-driver__field-row" key={mode}>
                              <label className="orbit-driver__field">
                                <span>
                                  {formatMessage(t("strategy.drivers.paceOf"), {
                                    mode: t(`strategy.drivers.${mode}`),
                                  })}
                                </span>
                                <Input
                                  aria-label={formatMessage(t("strategy.drivers.paceOf"), {
                                    mode: t(`strategy.drivers.${mode}`),
                                  })}
                                  inputMode="decimal"
                                  numeric
                                  onChange={(changed) =>
                                    setDriverPace(driver.id, mode, 0, changed.currentTarget.value)
                                  }
                                  unit="s"
                                  value={String(driver[mode][0])}
                                />
                                <InputProvenanceChip t={t} view={manualInputView(driver[mode][0])} />
                              </label>
                              <label className="orbit-driver__field">
                                <span>
                                  {formatMessage(t("strategy.drivers.fuelOf"), {
                                    mode: t(`strategy.drivers.${mode}`),
                                  })}
                                </span>
                                <Input
                                  aria-label={formatMessage(t("strategy.drivers.fuelOf"), {
                                    mode: t(`strategy.drivers.${mode}`),
                                  })}
                                  inputMode="decimal"
                                  numeric
                                  onChange={(changed) =>
                                    setDriverPace(driver.id, mode, 1, changed.currentTarget.value)
                                  }
                                  unit="L/v"
                                  value={String(driver[mode][1])}
                                />
                                <InputProvenanceChip t={t} view={manualInputView(driver[mode][1])} />
                              </label>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : panel === "tyres" ? (
                <div className="orbit-strategy__tyres" data-testid="orbit-strategy-tyres">
                  {inventory.length === 0 ? (
                    <Note title={t("strategy.tyres.emptyTitle")}>{t("strategy.tyres.empty")}</Note>
                  ) : (
                    <>
                      <p className="orbit-strategy__tyre-hint">{t("strategy.drivers.hint")}</p>
                      <div className="orbit-strategy__tyre-list">
                        {inventory.map((tyre) => {
                          const used = uses[tyre.id] ?? [];
                          const condition = tyreCondition(tyre, used.length);
                          return (
                            <TyreItem
                              key={tyre.id}
                              onPick={() => {
                                const next = picked === tyre.id ? null : tyre.id;
                                setPicked(next);
                                if (next && editing < 0) {
                                  toast.show(t("strategy.drivers.picked"), t("strategy.drivers.pickedHint"));
                                }
                              }}
                              picked={picked === tyre.id}
                              tyre={{
                                id: tyre.id,
                                compound: chipCompound(tyre),
                                condition: condition.max,
                                label: t("strategy.tyres.free"),
                              }}
                              used={used.map((use) => ({ stint: use.stint + 1, corner: use.corner }))}
                            />
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              ) : panel === "sessions" ? sessionsPanel : weatherPanel}
            </Surface>
          </div>
        </div>
      )}
    </div>
  );
}
