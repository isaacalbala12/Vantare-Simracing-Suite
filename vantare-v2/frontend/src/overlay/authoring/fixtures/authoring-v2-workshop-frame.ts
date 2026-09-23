import { rankDemoStandings, withFunctionalStandingsDemo } from "./functional-standings-demo";
import crystalReferenceManifest from "../../../../testdata/crystal-reference/manifest.json";
import type {
  OverlayControlsHistoryV2,
  OverlayFrameV2,
  OverlayQualityV2,
  OverlayQValue,
  OverlayRelativeRowV2,
  OverlayStandingRowV2,
  Overlayv2DeltaHistoryV2,
} from "../../../generated/telemetry";
import type { DesignSystemId, WidgetInstanceV3, WidgetType } from "../../core/profile-document";
import type { WidgetRuntimeInput } from "../../core/widget-definition";
import { EFFICIENCY_SYSTEM_ID } from "../../core/design-system-names";
import { normalizeRacingFlagsTextColor } from "../../design-systems/vantare-functional/racing-flags-settings";
import {
  AUTHORING_V2_VARIANTS,
  buildAuthoringV2ScenarioRuntime,
  type AuthoringV2Variant,
} from "./authoring-v2-scenario-fixture";
import { buildAuthoringV2ScenarioWidget } from "./authoring-v2-scenario-widget";
import {
  getEnabledRelativeColumns,
  parseRelativeContent,
  RELATIVE_RANGE_AHEAD,
  RELATIVE_RANGE_BEHIND,
  updateRelativeFilters,
} from "../../widget-types/relative/relative-content";
import {
  computeRelativeConfiguredRowCount,
  computeRelativeIntrinsicHeight,
  computeRelativeIntrinsicWidth,
} from "../../widget-types/relative/relative-renderer-helpers";
import {
  EFFICIENCY_RELATIVE_BASE_WIDTH,
  resolveEfficiencyRelativeBaseHeight,
  resolveEfficiencyRelativeSlotsWidth,
} from "../../design-systems/vantare-efficiency/relative-layout";
import { EFFICIENCY_STUDY_DEFAULT_MODULES } from "../efficiency-study-options";
import { resolveStandingsMinimumSize } from "../../widget-types/standings/standings-frame-layout";
import { applyWidgetDesign } from "../../core/widget-design";
import { getOfficialDesign, listOfficialDesigns } from "../../design-systems/official-designs";
import { getAnimationScene, sceneFrameAt } from "./animation-scenes";
import type { SceneFrame, SceneOverride } from "./animation-scenes";
import type { PedalsKnownFlag } from "../../widget-types/pedals/pedals-view-model";

// Variantes dev de Workshop: transformaciones explícitas, deterministas y
// acotadas sobre el golden canónico. La variante en sí declara el artificio;
// nada aquí pretende ser telemetría real.
export const WORKSHOP_V2_DEV_VARIANTS = [
  "standings-functional-study",
  "standings-stress60",
  "standings-replay",
  "pedals-zero",
  "pedals-full",
] as const;

export type WorkshopV2DevVariant = (typeof WORKSHOP_V2_DEV_VARIANTS)[number];
export type WorkshopV2Variant = AuthoringV2Variant | WorkshopV2DevVariant;

const WORKSHOP_V2_VARIANTS: readonly WorkshopV2Variant[] = [
  ...AUTHORING_V2_VARIANTS,
  ...WORKSHOP_V2_DEV_VARIANTS,
];

// La presentación multiclass es el default del Relative dentro de Eficiencia.
function usesRelativeStudyProjection(input: {
  widget: WidgetType;
  system: DesignSystemId;
  variant: WorkshopV2Variant;
}): boolean {
  return input.widget === "relative" && input.system === EFFICIENCY_SYSTEM_ID && input.variant === "default";
}

const WORKSHOP_V2_VARIANT_SET: ReadonlySet<string> = new Set(WORKSHOP_V2_VARIANTS);

export function isWorkshopV2Variant(value: string): value is WorkshopV2Variant {
  return WORKSHOP_V2_VARIANT_SET.has(value);
}

export const STANDINGS_REPLAY_FRAME_COUNT = 10;

// Las variantes dev no dan forma: se dibujan con la shape equivalente mínima.
const DEV_SHAPE_VARIANT: Record<WorkshopV2DevVariant, AuthoringV2Variant> = {
  "standings-functional-study": "default",
  "standings-stress60": "default",
  "standings-replay": "standings-multiclass",
  "pedals-zero": "default",
  "pedals-full": "default",
};

function workshopDesignMeta(designId: string): { designId: string; width: number; height: number } | undefined {
  const entry = crystalReferenceManifest.entries.find((candidate) => candidate.designId === designId);
  return entry ? { designId: entry.designId, width: entry.width, height: entry.height } : undefined;
}

function shapeVariantFor(input: {
  widget: WidgetType;
  system: DesignSystemId;
  variant: WorkshopV2Variant;
  sceneId?: string;
}): AuthoringV2Variant {
  // La escena también da forma al widget: sin multiclass la escena de
  // fastest-lap entregaría la corona entre coches fuera de pantalla.
  if (input.sceneId && input.widget === "standings" && input.system !== EFFICIENCY_SYSTEM_ID) {
    return "standings-multiclass";
  }
  if ((AUTHORING_V2_VARIANTS as readonly string[]).includes(input.variant)) {
    return input.variant as AuthoringV2Variant;
  }
  return DEV_SHAPE_VARIANT[input.variant as WorkshopV2DevVariant];
}

export function createScenarioWidget(input: {
  widget: WidgetType;
  system: DesignSystemId;
  variant: WorkshopV2Variant;
  designId?: string;
  sceneId?: string;
}): WidgetInstanceV3 {
  const shape = shapeVariantFor(input);
  let widget = buildAuthoringV2ScenarioWidget({ widget: input.widget, system: input.system, variant: shape });
  // La proyección multiclass del Relative se presenta como en la referencia:
  // solo posición, clase, nombre y gap — driverNumber y bestLap son huecos
  // declarados de la proyección y dibujarían columnas permanentes de "—".
  // En Eficiencia esta es la forma canónica de `default`.
  if (usesRelativeStudyProjection(input)) {
    const content = widget.content as Record<string, unknown>;
    const keep = new Set(["position", "class", "driverName", "gap"]);
    const columns = Array.isArray(content.columns)
      ? (content.columns as Record<string, unknown>[]).map((column) => ({ ...column, enabled: keep.has(String(column.metricId)) }))
      : content.columns;
    widget = { ...widget, content: { ...content, columns } };
  }
  // Siempre hay un diseño concreto: sin `designId` en la URL se aplica el
  // oficial por defecto del sistema — el Workshop no conoce el estado
  // "renderer sin diseño" porque en el producto tampoco existe.
  const designId = input.designId
    ?? listOfficialDesigns(input.widget).find((d) => d.systemId === input.system && d.isDefault)?.id
    ?? listOfficialDesigns(input.widget).find((d) => d.systemId === input.system)?.id;
  if (!designId) return widget;
  const official = getOfficialDesign(designId);
  if (!official) {
    throw new Error(`authoring-v2-workshop-frame: diseño desconocido ${JSON.stringify(designId)}`);
  }
  if (official.widgetType !== input.widget || official.systemId !== input.system) {
    throw new Error(
      `authoring-v2-workshop-frame: diseño ${designId} incompatible con ${input.widget}/${input.system}`,
    );
  }
  widget = applyWidgetDesign(widget, official, "1970-01-01T00:00:00.000Z");
  const manifest = workshopDesignMeta(designId);
  if (manifest) widget.layout = { ...widget.layout, w: manifest.width, h: manifest.height };
  return widget;
}

/**
 * ÚNICO punto donde se decide la forma del widget del Workshop (ISA-1128):
 * función pura de la selección completa — variante de forma, diseño oficial,
 * retoques dev, sesión, marca y módulos del estudio — en este orden fijo.
 * Nada más toca widget.content ni widget.visual en el harness.
 */
export function buildWorkshopWidget(input: {
  widget: WidgetType;
  system: DesignSystemId;
  variant: WorkshopV2Variant;
  session: WorkshopV2Scenario["session"];
  designId?: string;
  sceneId?: string;
  brand?: "off";
  modules?: readonly string[];
  slots?: readonly string[];
  ahead?: number;
  behind?: number;
  nameFormat?: "full" | "initial" | "surname";
  rows?: number;
  textColor?: string;
}): WidgetInstanceV3 {
  let widget = createScenarioWidget({
    widget: input.widget,
    system: input.system,
    variant: input.variant,
    ...(input.designId ? { designId: input.designId } : {}),
    ...(input.sceneId ? { sceneId: input.sceneId } : {}),
  });

  if (input.widget === "broadcast-tower" && input.system === EFFICIENCY_SYSTEM_ID && input.sceneId === "broadcast-tower-carousel") {
    widget.visual = { ...widget.visual, baseSettings: { ...widget.visual.baseSettings, driverCarousel: true } };
  }

  // El estudio cambia explícitamente la columna de vuelta fuera de carrera;
  // los perfiles guardados no los toca nunca el renderer al cambiar la sesión.
  // Solo Standings tiene columnas de vuelta — Delta/Pedals no llevan
  // content.columns (antes este bloque explotaba sobre ellos).
  if (input.system === EFFICIENCY_SYSTEM_ID && input.widget === "standings" && input.variant === "default" && input.session !== "race") {
    const content = widget.content as Record<string, unknown>;
    const columns = Array.isArray(content.columns)
      ? (content.columns as Record<string, unknown>[]).map((column) => column.metricId === "lastLap" ? { ...column, enabled: false } : column.metricId === "bestLap" ? { ...column, enabled: true } : column)
      : content.columns;
    widget = { ...widget, content: { ...content, columns } };
  }

  // Formato del nombre de piloto: el mismo `format.mode` que edita Studio en
  // la columna Piloto. Viaja por content.columns, nada fuera del contrato.
  if (input.nameFormat && (input.widget === "standings" || input.widget === "relative")) {
    const content = widget.content as Record<string, unknown>;
    const columns = Array.isArray(content.columns)
      ? (content.columns as Record<string, unknown>[]).map((column) =>
          column.metricId === "driverName"
            ? { ...column, format: { ...(column.format as Record<string, unknown> | undefined), mode: input.nameFormat } }
            : column)
      : content.columns;
    widget = { ...widget, content: { ...content, columns } };
  }

  // Recuento de filas del Standings: el mismo `rowCount` que edita Studio;
  // el view model recorta por él.
  if (input.widget === "standings" && input.rows !== undefined) {
    const content = widget.content as Record<string, unknown>;
    widget = { ...widget, content: { ...content, rowCount: input.rows } };
  }

  // El formato de nombre y el recuento cambian el tamaño intrínseco: la caja
  // se re-encaja después de aplicarlos — el encaje base de createScenarioWidget
  // siempre vio el formato completo y el recuento por defecto.
  if (input.widget === "standings" && input.system === EFFICIENCY_SYSTEM_ID
      && (input.rows !== undefined || input.nameFormat !== undefined || input.variant === "standings-multiclass")) {
    widget = fitStandingsMinimum(widget);
  }

  // El selector de marca del panel hace de autoridad local (en producción la
  // decisión la inyecta la política nativa de ISA-1105 como brandVisible).
  if (input.brand === "off") {
    widget = {
      ...widget,
      visual: {
        ...widget.visual,
        appearanceOverrides: { ...(widget.visual.appearanceOverrides ?? {}), brandVisible: false },
      },
    };
  }

  if (input.widget === "racing-flags" && input.system === EFFICIENCY_SYSTEM_ID && input.textColor !== undefined) {
    widget = {
      ...widget,
      visual: {
        ...widget.visual,
        appearanceOverrides: {
          ...(widget.visual.appearanceOverrides ?? {}),
          textColor: normalizeRacingFlagsTextColor(input.textColor),
        },
      },
    };
  }

  // Módulos de Standings Eficiencia: posición y piloto siempre visibles; el
  // resto lo encienden los módulos elegidos. La selección también aplica a la
  // variante canónica `default`, que es la que expone el Workshop.
  if (input.system === EFFICIENCY_SYSTEM_ID && input.widget === "standings"
    && (input.variant === "standings-functional-study" || input.modules !== undefined)) {
    const modules = input.modules ?? EFFICIENCY_STUDY_DEFAULT_MODULES;
    const content = widget.content as Record<string, unknown>;
    const columns = Array.isArray(content.columns)
      ? (content.columns as Record<string, unknown>[]).map((column) => ({
          ...column,
          ...(input.variant === "standings-functional-study" ? { widthPreset: "auto" as const } : {}),
          enabled: column.metricId === "position" || column.metricId === "driverName" || modules.includes(String(column.metricId)),
        }))
      : content.columns;
    // El estudio enseña siempre al menos 15 pilotos; la variante canónica
    // conserva su recuento salvo que el selector Filas lo haya cambiado.
    widget = { ...widget, content: { ...content, columns, ...(input.variant === "standings-functional-study" ? { rowCount: 15 } : {}) } };
    // La altura derivada del estudio pertenece al widget que estamos
    // construyendo, no a una corrección posterior del harness. Así el layout
    // que recibe WidgetVisualHost sigue siendo la resolución real del profile.
    widget = fitStandingsMinimum(widget);
  }

  // Huecos de datos del pie en standings/relative de Eficiencia.
  if (input.slots && input.slots.length > 0 && input.system === EFFICIENCY_SYSTEM_ID
    && (input.widget === "standings" || input.widget === "relative")) {
    widget = {
      ...widget,
      visual: {
        ...widget.visual,
        appearanceOverrides: { ...(widget.visual.appearanceOverrides ?? {}), footerSlots: [...input.slots] },
      },
    };
  }

  // Ventana del relative: la caja se adapta al contenido, nunca al revés —
  // la fila queda a su alto fijo y el marco crece o se encoge con las filas
  // configuradas. En Eficiencia se re-encaja siempre (a escala 1 las filas
  // miden 28px reales y las fichas no se encogen); en el resto de sistemas
  // solo cuando la URL fija la ventana, para no pisar las medidas de
  // manifiesto o diseño sin motivo.
  if (input.widget === "relative") {
    const next = updateRelativeFilters(parseRelativeContent(widget.content), {
      ...(input.ahead !== undefined ? { rangeAhead: input.ahead } : {}),
      ...(input.behind !== undefined ? { rangeBehind: input.behind } : {}),
    });
    widget = { ...widget, content: next };
    const rows = computeRelativeConfiguredRowCount(next);
    const settings = { ...widget.visual.baseSettings, ...widget.visual.appearanceOverrides };
    if (input.system === EFFICIENCY_SYSTEM_ID) {
      const w = Math.max(
        EFFICIENCY_RELATIVE_BASE_WIDTH,
        Math.ceil(resolveEfficiencyRelativeSlotsWidth(settings)),
      );
      const h = Math.ceil(resolveEfficiencyRelativeBaseHeight(rows, settings) * (w / EFFICIENCY_RELATIVE_BASE_WIDTH));
      widget = { ...widget, layout: { ...widget.layout, w, h: next.rowHeightMode === "fill" ? Math.max(widget.layout.h, h) : h } };
    } else if (input.ahead !== undefined || input.behind !== undefined) {
      const w = computeRelativeIntrinsicWidth(getEnabledRelativeColumns(next));
      const h = computeRelativeIntrinsicHeight(next.rowHeightMode, rows);
      widget = { ...widget, layout: { ...widget.layout, w, h: next.rowHeightMode === "fill" ? Math.max(widget.layout.h, h) : h } };
    }
  }

  return widget;
}

export type WorkshopV2Scenario = {
  session: "practice" | "qualifying" | "race";
  location: "track" | "pits";
  state: "ready" | "stale" | "disconnected" | "error";
  widget: WidgetType;
  system: DesignSystemId;
  variant: WorkshopV2Variant;
  /** Dev-only explicit SessionV2 flag probe for flag-aware widgets. */
  flag?: PedalsKnownFlag;
  replayFrame?: number;
  sceneId?: string;
  sceneFrame?: number;
  sceneState?: SceneFrame;
  /** Filas que la ventana de Relative deja delante/detrás del jugador. */
  rangeAhead?: number;
  rangeBehind?: number;
  /** Filas declaradas por el Standings (1–30); el golden se completa en ciclo. */
  standingRows?: number;
  /** Posición del jugador en la parrilla de demostración del Workshop. */
  playerPosition?: number;
};

// Calendario auxiliar dev migrado del mock legacy: no es telemetría, solo
// alimenta el canal auxiliar de race-schedule en Workshop.
const WORKSHOP_V2_SCHEDULE_EVENTS = [
  { id: "spa", title: "Spa Endurance", track: "Spa-Francorchamps", startAt: "2026-07-14T18:00:00.000Z", durationMinutes: 90, classes: ["GT3"], status: "upcoming", license: "A" },
  { id: "monza", title: "Monza Sprint", track: "Monza", startAt: "2026-07-15T19:30:00.000Z", durationMinutes: 45, classes: ["GT3"], status: "upcoming", license: "A" },
  { id: "cota", title: "One Stint Sprint", track: "Circuit of the Americas", startAt: "2026-07-16T20:00:00.000Z", durationMinutes: 40, classes: ["HYPERCAR", "LMGT3"], status: "open", license: "GOLD SR" },
  { id: "lemans", title: "6 Hours of Le Mans", track: "Circuit de la Sarthe", startAt: "2026-07-17T17:00:00.000Z", durationMinutes: 360, classes: ["HYPERCAR", "LMP2", "LMGT3"], status: "team registration", license: "SPECIAL EVENT" },
] as const;

// Parrilla de demostración del Workshop: nombres de pilotos de resistencia
// sobre las posiciones del golden canónico (hypercar/lmp2/gte alternados,
// jugador en P1). Los ocho asientos con nombre que usan las escenas conservan
// sus posiciones declaradas en STANDINGS_DEV_SEAT_BY_DRIVER, así los parches
// por nombre siguen resolviendo las mismas filas.
const WORKSHOP_DEMO_GRID: readonly string[] = [
  "André Lotterer",       // 1 hypercar — jugador
  "Ben Hanley",           // 2 lmp2
  "Kévin Estre",          // 3 gte
  "Antonio Giovinazzi",   // 4 hypercar
  "Filipe Albuquerque",   // 5 lmp2
  "Alessandro Pier Guidi",// 6 gte
  "Sarah Bovy",           // 7 hypercar
  "Martin Berry",         // 8 lmp2
  "Michael Birch",        // 9 gte
  "Gianmaria Bruni",      // 10 hypercar
  "Phil Hanson",          // 11 lmp2
  "Matt Campbell",        // 12 gte
  "Duncan Cameron",       // 13 hypercar
  "Job van Uitert",       // 14 lmp2
  "Daniel Juncadella",    // 15 gte
  "Conrad Laursen",       // 16 hypercar
  "Oliver Jarvis",        // 17 lmp2
  "Maro Engel",           // 18 gte
  "Mikkel Jensen",        // 19 hypercar
  "Nico Pino",            // 20 lmp2
  "Charlie Eastwood",     // 21 gte — filas extra del selector 1–30
  "Robert Kubica",        // 22 hypercar
  "Matthieu Vaxivière",   // 23 lmp2
  "Valentino Rossi",      // 24 gte
  "Jenson Button",        // 25 hypercar
  "Bent Viscaal",         // 26 lmp2
  "Rahel Frey",           // 27 gte
  "Mick Schumacher",      // 28 hypercar
  "Franco Colapinto",     // 29 lmp2
  "Michelle Gatting",     // 30 gte
];

// Trazas deterministas de un sector para input-telemetry: recta, frenada
// fuerte y tracción. El history V2 usa per-mille 0..1000 en pedales y
// OverlayQValue en instrumentos.
const DEMO_HISTORY_POINTS = 40;
function demoControlsHistory(quality: OverlayQualityV2): OverlayControlsHistoryV2 {
  const throttle: number[] = [];
  const brake: number[] = [];
  const clutch: number[] = [];
  const speed: OverlayQValue<number>[] = [];
  const rpm: OverlayQValue<number>[] = [];
  const gear: OverlayQValue<number>[] = [];
  const capturedAtMS: number[] = [];
  for (let i = 0; i < DEMO_HISTORY_POINTS; i += 1) {
    const phase = i / (DEMO_HISTORY_POINTS - 1);
    const braking = phase > 0.55 && phase < 0.78;
    const brakeForce = braking ? Math.min(1, (phase - 0.55) * 9) : 0;
    const throttleForce = braking ? 0 : Math.min(1, 0.55 + phase * 0.6);
    throttle.push(Math.round(throttleForce * 1000));
    brake.push(Math.round(brakeForce * 1000));
    clutch.push(0);
    capturedAtMS.push(i * 20);
    speed.push(qualityValue(62 - brakeForce * 24, quality));
    rpm.push(qualityValue(8600 - brakeForce * 3100, quality));
    gear.push(qualityValue(brakeForce > 0.6 ? 3 : 5, quality));
  }
  return { q: quality, capturedAtMS, throttle, brake, clutch, speedMPS: speed, rpm, gear };
}

// Serie delta determinista para delta-trace: 100 muestras a 20 Hz sobre 5 s
// (la ventana por defecto enseña las últimas 4 s). Tendencia a la baja —
// el piloto recorta — con ondulación de sector.
const DEMO_DELTA_POINTS = 100;
function demoDeltaHistory(quality: OverlayQualityV2): Overlayv2DeltaHistoryV2 {
  const capturedAtMS: number[] = [];
  const seconds: number[] = [];
  const base = 1_757_900_000_000;
  for (let i = 0; i < DEMO_DELTA_POINTS; i += 1) {
    capturedAtMS.push(base + i * 50);
    const drift = i / (DEMO_DELTA_POINTS - 1);
    seconds.push(0.5 - drift * 0.3 + Math.sin(i / 5) * 0.07);
  }
  return { q: quality, capturedAtMS, seconds };
}

// Capa de demostración del Workshop: el golden canónico trae shape y cantidad
// pero nombres vacíos ("Driver 0NN") y varios canales sin valor, que no sirven
// para juzgar el diseño. Aquí se rellenan identidades y canales de muestra —
// solo en este builder, nunca en el golden ni en producción. Las variantes y
// escenas siguen sobreescribiendo lo suyo después.
function withWorkshopDemo(frame: OverlayFrameV2, quality: OverlayQualityV2): OverlayFrameV2 {
  const nameAt = (position: number) => WORKSHOP_DEMO_GRID[position - 1];
  return {
    ...frame,
    standings: frame.standings.map((row) => {
      // bestLap no es un hueco declarado de standings: la proyección puede
      // entregarlo y el golden simplemente no lo lleva — el demo lo deriva
      // del lastLap con una mejora determinista para que la columna juzgue.
      const lastLap = typeof row.lastLap?.v === "number" ? row.lastLap.v : undefined;
      const bestLap = row.bestLap.q === "missing" && lastLap !== undefined
        ? qualityValue(lastLap - (0.2 + (row.position % 7) * 0.07), quality)
        : row.bestLap;
      return { ...row, driver: nameAt(row.position) ?? row.driver, bestLap };
    }),
    relative: frame.relative.map((row) => ({ ...row, name: nameAt(row.position) ?? row.name })),
    relativeSettled: frame.relativeSettled.map((row) => ({ ...row, name: nameAt(row.position) ?? row.name })),
    player: {
      ...frame.player,
      clutch: qualityValue(0.06, quality),
      steering: qualityValue(0.08, quality),
    },
    delta: {
      ...frame.delta,
      seconds: qualityValue(0.214, quality),
      history: demoDeltaHistory(quality),
    },
    session: { ...frame.session, flag: qualityValue("green", quality) },
    controls: { history: demoControlsHistory(quality) },
    fuel: {
      ...frame.fuel,
      perLap: qualityValue(2.14, quality),
      requiredFuel: qualityValue(169.1, quality),
      history: {
        q: quality,
        lap: [14, 15, 16, 17],
        consumed: [2.21, 2.08, 2.26, 2.12],
      },
    },
    weather: {
      ...frame.weather,
      ambientC: qualityValue(21, quality),
      trackC: qualityValue(28, quality),
      windKph: qualityValue(14, quality),
      windDir: qualityValue("NW", quality),
      rainPercent: qualityValue(0, quality),
      wetnessPct: qualityValue(0, quality),
    },
  };
}

function withWorkshopRaceLapDeltas(frame: OverlayFrameV2, quality: OverlayQualityV2): OverlayFrameV2 {
  const lapDeltaAtPosition = (position: number): OverlayQValue<number> =>
    position === 4 ? qualityValue(-1, quality) : { q: "missing" };
  return {
    ...frame,
    relative: frame.relative.map((row) => ({ ...row, lapDelta: lapDeltaAtPosition(row.position) })),
    relativeSettled: frame.relativeSettled.map((row) => ({ ...row, lapDelta: lapDeltaAtPosition(row.position) })),
  };
}

function withWorkshopRelativePositionSwap(
  frame: OverlayFrameV2,
  firstPosition: number,
  secondPosition: number,
): OverlayFrameV2 {
  const firstClassPosition = frame.standings.find((row) => row.position === firstPosition)?.classPosition;
  const secondClassPosition = frame.standings.find((row) => row.position === secondPosition)?.classPosition;
  const swap = (position: number): number =>
    position === firstPosition ? secondPosition : position === secondPosition ? firstPosition : position;
  return {
    ...frame,
    standings: frame.standings
      .map((row) => ({
        ...row,
        position: swap(row.position),
        classPosition: row.position === firstPosition
          ? secondClassPosition ?? row.classPosition
          : row.position === secondPosition ? firstClassPosition ?? row.classPosition : row.classPosition,
      }))
      .sort((left, right) => left.position - right.position),
    relative: frame.relative.map((row) => ({ ...row, position: swap(row.position) })),
    relativeSettled: frame.relativeSettled.map((row) => ({ ...row, position: swap(row.position) })),
  };
}

function withWorkshopPlayerPosition(frame: OverlayFrameV2, position: number): OverlayFrameV2 {
  const target = frame.standings.find((row) => row.position === position);
  if (!target) return frame;
  return { ...frame, player: { ...frame.player, id: target.id } };
}

// Asiento posicional de cada piloto dev en la parrilla legacy: las tablas dev
// clavean por nombre sintético, el golden conserva sus identidades, así que
// los overrides se aplican a la fila canónica en esa posición.
const STANDINGS_DEV_SEAT_BY_DRIVER: Readonly<Record<string, number>> = {
  "Gianmaria Bruni": 10,
  "Sarah Bovy": 7,
  "Michael Birch": 9,
  "Martin Berry": 8,
  "Duncan Cameron": 13,
  "Ben Hanley": 2,
  "Filipe Albuquerque": 5,
  "Conrad Laursen": 16,
  "Alessandro Pier Guidi": 6,
};

// Tabla posicional separada para relative: el que cruza al jugador (detrás
// cerca, visible en el recorte de producto) y el que entra en ventana
// (segundo detrás, también visible en el recorte por defecto).
const RELATIVE_DEV_SEAT_BY_DRIVER: Readonly<Record<string, number>> = {
  "Gianmaria Bruni": 20,
  "Michael Birch": 19,
};

type RowPatch = {
  gap?: number;
  position?: number;
  pit?: boolean;
  bestLap?: number;
  absent?: boolean;
};

function replayStepPatches(step: number): Readonly<Record<number, RowPatch>> {
  const base = 7.404;
  const pair = { 10: { position: 7, gap: base - 0.05 }, 7: { position: 10, gap: base + 0.2 } };
  switch (step) {
    case 1:
      return { 10: { gap: base + 0.6 } };
    case 2:
      return { 10: { gap: base + 0.35 } };
    case 3:
      return { 10: { gap: base + 0.15 } };
    case 4:
      return pair;
    case 5:
      return { 10: { position: 7, gap: base - 0.1 }, 7: { position: 10, gap: base + 1.3 } };
    case 6:
      return { 10: { position: 7, gap: base - 0.1 }, 7: { position: 10, gap: base + 1.3 }, 13: { pit: true } };
    case 7:
    case 8: {
      const patches: Record<number, RowPatch> = {
        10: { position: 7, gap: base - 0.1 },
        7: { position: 10, gap: base + 1.3 },
        13: { gap: 24.5 },
        2: { bestLap: 85.902 },
      };
      if (step === 8) patches[16] = { absent: true };
      return patches;
    }
    case 9:
      // Laursen sigue fuera un frame para que el 0 juegue su reentrada.
      return { 16: { absent: true } };
    default:
      return {};
  }
}

function qualityValue<T>(value: T, quality: OverlayQualityV2): OverlayQValue<T> {
  return { v: value, q: quality };
}

function patchRow(
  row: OverlayStandingRowV2,
  patch: RowPatch,
  quality: OverlayQualityV2,
): OverlayStandingRowV2 | null {
  if (patch.absent) return null;
  return {
    ...row,
    ...(patch.position !== undefined ? { position: patch.position } : {}),
    ...(patch.gap !== undefined ? { gap: qualityValue(patch.gap, quality) } : {}),
    ...(patch.pit !== undefined ? { pit: patch.pit ? "pit" : "track" } : {}),
    ...(patch.bestLap !== undefined ? { bestLap: qualityValue(patch.bestLap, quality) } : {}),
  };
}

function patchStandings(
  rows: readonly OverlayStandingRowV2[],
  patches: Readonly<Record<number, RowPatch>>,
  quality: OverlayQualityV2,
): OverlayStandingRowV2[] {
  const out: OverlayStandingRowV2[] = [];
  for (const row of rows) {
    const patch = patches[row.position];
    if (!patch) {
      out.push(row);
      continue;
    }
    const patched = patchRow(row, patch, quality);
    if (patched) out.push(patched);
  }
  return out.sort((left, right) => left.position - right.position);
}

// Repite la parrilla en ciclo hasta `count` filas: ids únicos por copia,
// posición reenumerada y un salto de gap por vuelta para que las filas
// extra no repliquen el "Leader" de la P1.
function padStandings(rows: readonly OverlayStandingRowV2[], count: number): OverlayStandingRowV2[] {
  const out: OverlayStandingRowV2[] = [...rows];
  const perClass = new Map<string, number>();
  out.forEach((row) => {
    const classId = row.classId ?? "unknown";
    perClass.set(classId, (perClass.get(classId) ?? 0) + 1);
  });
  for (let copy = 1; out.length < count; copy++) {
    for (const row of rows) {
      if (out.length >= count) break;
      const classId = row.classId ?? "unknown";
      perClass.set(classId, (perClass.get(classId) ?? 0) + 1);
      const gap = typeof row.gap?.v === "number" ? row.gap.v + copy * 15 : row.gap;
      out.push({
        ...row,
        id: `${row.id}#dev-${copy}`,
        gap: typeof gap === "number" ? { ...row.gap, v: gap } : row.gap,
        position: out.length + 1,
        classPosition: perClass.get(classId)!,
      });
    }
  }
  return out;
}

function stressStandings(rows: readonly OverlayStandingRowV2[]): OverlayStandingRowV2[] {
  return padStandings(rows, rows.length * 3);
}

// Gaps dev por distancia al jugador (cerca→lejos). El golden ofrece 8 filas
// por lado; más allá de los valores semilla la distancia crece a paso fijo
// para que cualquier ventana 0–8 siga siendo determinista.
const RELATIVE_DEV_GAP_AHEAD = [0.4, 1.8, 4.2, 5.5];
const RELATIVE_DEV_GAP_BEHIND = [-0.3, -2.6, -5.1];

function relativeDevGap(distance: number): number {
  if (distance > 0) {
    const base = RELATIVE_DEV_GAP_AHEAD[distance - 1];
    return base ?? Math.round((5.5 + (distance - RELATIVE_DEV_GAP_AHEAD.length) * 1.7) * 100) / 100;
  }
  if (distance < 0) {
    const base = RELATIVE_DEV_GAP_BEHIND[-distance - 1];
    return base ?? Math.round((-5.1 - (-distance - RELATIVE_DEV_GAP_BEHIND.length) * 1.9) * 100) / 100;
  }
  return 0;
}

function sideForGap(gap: number, fallback: string): string {
  if (gap > 0) return "ahead";
  if (gap < 0) return "behind";
  return fallback;
}

// Ventana dev sobre el orden canónico: N ahead near→far, player, M behind
// near→far, con N/M configurables (por defecto 3/3, el default de producto).
// Una sola función para relative y relativeSettled.
function relativeDevWindow(
  rows: readonly OverlayRelativeRowV2[],
  playerId: string,
  quality: OverlayQualityV2,
  aheadCount = 3,
  behindCount = 3,
): OverlayRelativeRowV2[] {
  const gapValue = (row: OverlayRelativeRowV2): number => row.gap.v ?? 0;
  const ahead = rows
    .filter((row) => row.side === "ahead")
    .sort((left, right) => gapValue(left) - gapValue(right));
  const behind = rows.filter((row) => row.side === "behind");
  const player = rows.find((row) => row.id === playerId);
  if (!player) {
    throw new Error("authoring-v2-workshop-frame: relative sin fila del jugador");
  }
  const aheadRows = ahead.slice(0, aheadCount);
  const window = [...aheadRows, player, ...behind.slice(0, behindCount)];
  const playerIndex = aheadRows.length;
  return window.map((row, index) => {
    const gap = row.id === playerId
      ? 0
      : row.side === "ahead"
        ? relativeDevGap(index + 1)
        : relativeDevGap(playerIndex - index);
    return {
      ...row,
      gap: qualityValue(gap, quality),
      side: row.id === playerId ? "player" : sideForGap(gap, row.side),
    };
  });
}

function forcePedals(frame: OverlayFrameV2, value: number, quality: OverlayQualityV2): OverlayFrameV2 {
  const pedal = qualityValue(value, quality);
  const history = frame.controls.history;
  // El history V2 es per-mille 0..1000; el player va en fracción 0..1.
  const force = (samples: readonly number[] | undefined): readonly number[] | undefined =>
    samples?.map(() => value * 1000);
  return {
    ...frame,
    player: { ...frame.player, throttle: pedal, brake: pedal, clutch: pedal },
    controls: {
      history: { ...history, throttle: force(history.throttle), brake: force(history.brake), clutch: force(history.clutch) },
    },
  };
}

function seatNameAt(table: Readonly<Record<string, number>>, position: number): string | undefined {
  for (const [name, seat] of Object.entries(table)) {
    if (seat === position) return name;
  }
  return undefined;
}

// Una escena cuyo parche no resuelve ninguna fila — el piloto no está en la
// parrilla y su asiento declarado tampoco tiene dueño — se descartaba en
// silencio: el parche resbalaba a un asiento equivocado o no aterrizaba. El
// aviso sale una vez por escena y piloto, no por frame muestreado.
const warnedScenePatches = new Set<string>();
function warnDroppedScenePatches(
  sceneId: string,
  keys: readonly string[],
  resolved: ReadonlySet<string>,
): void {
  for (const key of keys) {
    if (resolved.has(key)) continue;
    const tag = `${sceneId}${key}`;
    if (warnedScenePatches.has(tag)) continue;
    warnedScenePatches.add(tag);
    console.warn(
      `[workshop] escena "${sceneId}": el parche de "${key}" no resolvió ninguna fila (ni por nombre ni por asiento) — se descarta.`,
    );
  }
}

function patchRelativeSection(
  rows: readonly OverlayRelativeRowV2[],
  cars: Record<string, SceneOverride>,
  quality: OverlayQualityV2,
  resolved?: Set<string>,
): OverlayRelativeRowV2[] {
  return rows.flatMap((row) => {
    const key = (row.name && cars[row.name] ? row.name : undefined) ?? seatNameAt(RELATIVE_DEV_SEAT_BY_DRIVER, row.position);
    const patch = key === undefined ? undefined : cars[key];
    if (key === undefined || !patch) return [row];
    resolved?.add(key);
    if (patch.absent) return [];
    if (patch.timeGapToPlayer === undefined && patch.lapDelta === undefined && patch.lapDeltaQuality === undefined) return [row];
    return [{
      ...row,
      ...(patch.timeGapToPlayer !== undefined ? {
        gap: qualityValue(patch.timeGapToPlayer, quality),
        side: sideForGap(patch.timeGapToPlayer, row.side),
      } : {}),
      ...(patch.lapDelta !== undefined || patch.lapDeltaQuality !== undefined ? {
        lapDelta: patch.lapDelta === undefined
          ? { q: patch.lapDeltaQuality ?? quality }
          : qualityValue(patch.lapDelta, patch.lapDeltaQuality ?? quality),
      } : {}),
    }];
  });
}

function applyScene(
  frame: OverlayFrameV2,
  scenario: WorkshopV2Scenario,
  quality: OverlayQualityV2,
): OverlayFrameV2 {
  const scene = scenario.sceneId ? getAnimationScene(scenario.sceneId, scenario.system, scenario.session) : undefined;
  if (!scene || scene.widget !== scenario.widget) return frame;
  const state = scenario.sceneState ?? sceneFrameAt(scene, scenario.sceneFrame ?? 0);
  let standings = frame.standings;
  let relative = frame.relative;
  let settled = frame.relativeSettled;
  // El golden canónico no inventa vueltas. Estas dos escenas de autoría
  // declaran su dueño inicial para que el traspaso observable tenga origen.
  if (scene.id === "standings-fastest-lap" || scene.id === "standings-full") {
    standings = patchStandings(standings, { 3: { bestLap: 86.408 } }, quality);
  }
  if (state.cars) {
    const resolved = new Set<string>();
    if (scene.widget === "relative") {
      relative = patchRelativeSection(frame.relative, state.cars, quality, resolved);
      settled = patchRelativeSection(frame.relativeSettled, state.cars, quality, resolved);
      // La VM confía en el orden canónico del frame: tras un cruce hay que
      // reordenar como haría Go — delante cerca→lejos, jugador en medio,
      // detrás cerca→lejos — si no el cambio de lado no se ve.
      const relativeOrder = (left: OverlayRelativeRowV2, right: OverlayRelativeRowV2) => {
        const sideRank = (side: string) => side === "ahead" ? 0 : side === "player" ? 1 : 2;
        const rankDelta = sideRank(left.side) - sideRank(right.side);
        if (rankDelta !== 0) return rankDelta;
        const leftGap = left.gap.v ?? 0;
        const rightGap = right.gap.v ?? 0;
        return left.side === "behind" ? rightGap - leftGap : leftGap - rightGap;
      };
      relative = [...relative].sort(relativeOrder);
      settled = [...settled].sort(relativeOrder);
    } else {
      standings = standings.flatMap((row) => {
        const key = (row.driver && state.cars![row.driver] ? row.driver : undefined) ?? seatNameAt(STANDINGS_DEV_SEAT_BY_DRIVER, row.position);
        const patch = key === undefined ? undefined : state.cars![key];
        if (key === undefined || !patch) return [row];
        resolved.add(key);
        // tireCompound no tiene campo en la fila V2: se ignora sin fingirlo.
        if (patch.absent) return [];
        return [
          patchRow(row, {
            ...(patch.place !== undefined ? { position: patch.place } : {}),
            ...(patch.timeBehindLeader !== undefined ? { gap: patch.timeBehindLeader } : {}),
            ...(patch.inPits !== undefined ? { pit: patch.inPits } : {}),
            ...(patch.bestLapTime !== undefined ? { bestLap: patch.bestLapTime } : {}),
            ...(patch.bestLapImprovement !== undefined && row.bestLap?.v !== undefined
              ? { bestLap: row.bestLap.v - patch.bestLapImprovement } : {}),
          }, quality) ?? row,
        ];
      });
      standings = [...standings].sort((left, right) => left.position - right.position);
      if (scene.id.startsWith("standings-functional-")) {
        if (scenario.session !== "race") {
          standings = [...standings].sort((left, right) => (left.bestLap.v ?? Infinity) - (right.bestLap.v ?? Infinity));
        }
        standings = rankDemoStandings(standings).map((row, index) => ({
          ...row, gap: state.cars?.[row.driver ?? ""]?.timeBehindLeader !== undefined
            ? row.gap : frame.standings[index]!.gap,
        }));
      }
    }
    warnDroppedScenePatches(scene.id, Object.keys(state.cars), resolved);
  }
  let player = frame.player;
  if (state.standingsWindowPosition !== undefined) {
    const anchor = standings.find((row) => row.position === state.standingsWindowPosition);
    if (anchor) player = { ...player, id: anchor.id };
  }
  let delta = frame.delta;
  let session = frame.session;
  if (scene.id === "broadcast-tower-carousel") {
    // Explicit review fixture: only the pilot strip moves, all data stay still.
    standings = standings.map((row) => ({ ...row, laps: 127 }));
    session = { ...session, maxLaps: qualityValue(180, quality) };
  }
  if (state.player?.deltaSeconds !== undefined) {
    delta = { ...delta, seconds: qualityValue(state.player.deltaSeconds, quality) };
  }
  if (state.player?.throttle !== undefined) {
    player = { ...player, throttle: qualityValue(state.player.throttle, quality) };
  }
  if (state.player?.brake !== undefined) {
    player = { ...player, brake: qualityValue(state.player.brake, quality) };
  }
  if (state.player?.clutch !== undefined) {
    player = { ...player, clutch: qualityValue(state.player.clutch, quality) };
  }
  if (state.player?.bestLapSeconds !== undefined) {
    // El player V2 no tiene bestLap: la mejor del piloto vive en su fila.
    standings = standings.map((row) =>
      row.id === frame.player.id
        ? { ...row, bestLap: qualityValue(state.player!.bestLapSeconds!, quality) }
        : row,
    );
  }
  if (state.remainingSeconds !== undefined) {
    session = { ...session, remaining: qualityValue(state.remainingSeconds, quality) };
  }
  return { ...frame, standings, relative, relativeSettled: settled, player, delta, session };
}

/**
 * Frame V2 de Workshop: parte del escenario canónico y aplica solo la
 * variante dev pedida como transformación explícita y determinista. Sin
 * snapshot, sin adapter, sin seed global, sin Date.now.
 */
export function buildWorkshopFrameV2(scenario: WorkshopV2Scenario): WidgetRuntimeInput {
  if (!isWorkshopV2Variant(scenario.variant)) {
    throw new Error(
      `authoring-v2-workshop-frame: variante no soportada ${JSON.stringify(scenario.variant)}`,
    );
  }
  const base = buildAuthoringV2ScenarioRuntime({ ...scenario, variant: "default" });
  const source = base.overlayV2Source!;
  const runtime: WidgetRuntimeInput = {
    overlayV2Frame: base.overlayV2Frame,
    overlayV2Source: source,
  };
  if (scenario.widget === "race-schedule") {
    runtime.raceScheduleEvents = WORKSHOP_V2_SCHEDULE_EVENTS;
    runtime.raceScheduleStatus = scenario.state;
  }
  if (source.state !== "live" && source.state !== "stale") {
    return runtime;
  }
  const quality: OverlayQualityV2 = source.state === "live" ? "fresh" : "stale";
  // El selector de filas (1–30) puede pedir más coches de los que trae el
  // golden de 20: se completa en ciclo antes del demo para que las filas
  // extra también reciban nombre de la parrilla.
  let baseFrame = base.overlayV2Frame!;
  if (scenario.widget === "standings" && scenario.standingRows !== undefined
    && baseFrame.standings.length < scenario.standingRows) {
    baseFrame = { ...baseFrame, standings: padStandings(baseFrame.standings, scenario.standingRows) };
  }
  let frame = withWorkshopDemo(baseFrame, quality);
  if (scenario.widget === "relative" && scenario.session === "race") {
    frame = withWorkshopRaceLapDeltas(frame, quality);
  }
  const relativeScene = scenario.sceneId ? getAnimationScene(scenario.sceneId) : undefined;
  if (scenario.widget === "relative" && relativeScene?.positionSwap) {
    frame = withWorkshopRelativePositionSwap(frame, ...relativeScene.positionSwap);
  }
  if (scenario.widget === "pedals" || scenario.widget === "racing-flags") {
    // Racing Flags keeps the vivid green demo state by default, while Pedals
    // preserves the canonical missing flag unless the Workshop asks for an
    // explicit probe. In both cases an explicit probe lets the harness inspect
    // yellow and the other known SessionV2 flag values without inventing live
    // telemetry.
    frame = {
      ...frame,
      session: {
        ...frame.session,
        flag: scenario.flag === undefined
          ? scenario.widget === "racing-flags"
            ? qualityValue("green", quality)
            : baseFrame.session.flag
          : qualityValue(scenario.flag, quality),
      },
    };
  }
  switch (scenario.variant) {
    case "standings-functional-study": {
      // Explicit visual-study data, never live telemetry. The original V2
      // golden remains untouched; only this named development variant uses it.
      // Las escenas se dirigen por nombre de piloto: los asientos ancla
      // (Bovy 7, Bruni 10…) llevan los nombres de la parrilla de escenas
      // para que los overrides resuelvan sus filas; el resto conserva la
      // parrilla GT3 del estudio.
      const names = ["Renan Azeredo", "Ben Hanley", "Fabian Seischegg", "Adaildo Vieira", "Filipe Albuquerque", "Rick Zwieten", "Sarah Bovy", "Martin Berry", "Michael Birch", "Gianmaria Bruni", "Tommaso Mosca", "Luca Ghiotto", "Duncan Cameron", "Frederik Schandorff", "Ulysse De Pauw"];
      const gaps = [0, .8, 11.3, 32.1, 35.2, 44.5, 47.3, 52.2, 53.6, 59.4, 62.8, 68.1, 74.6, 81.2, 88.7];
      const laps = [102.198, 102.089, 103.702, 102.278, 104.002, 104.059, 105.035, 104.822, 104.754, 103.111, 103.942, 104.316, 103.687, 104.501, 105.229];
      const rows = frame.standings.slice(0, names.length).map((row, index) => ({
        ...row, driver: names[index]!, position: index + 1, classPosition: index + 1,
        classId: "GT3", gap: qualityValue(gaps[index]!, quality),
        bestLap: qualityValue(laps[index]!, quality), lastLap: qualityValue(laps[index]! + .284, quality),
        pit: index === 5 ? "pit" : "track",
      }));
      frame = { ...frame, standings: rows, player: { ...frame.player, id: rows[6]!.id },
        session: { ...frame.session, remaining: qualityValue(20 * 60 + 3, quality) },
        weather: { ...frame.weather,
          ambientC: qualityValue(21, quality), trackC: qualityValue(28, quality),
          windKph: qualityValue(18, quality), windDir: qualityValue("NW", quality),
          rainPercent: qualityValue(0, quality), wetnessPct: qualityValue(0, quality) } };
      break;
    }
    case "standings-stress60":
      frame = { ...frame, standings: stressStandings(frame.standings) };
      break;
    case "standings-replay": {
      const step =
        ((scenario.replayFrame ?? 0) % STANDINGS_REPLAY_FRAME_COUNT + STANDINGS_REPLAY_FRAME_COUNT) %
        STANDINGS_REPLAY_FRAME_COUNT;
      frame = { ...frame, standings: patchStandings(frame.standings, replayStepPatches(step), quality) };
      break;
    }
    case "pedals-zero":
      frame = forcePedals(frame, 0, quality);
      break;
    case "pedals-full":
      frame = forcePedals(frame, 1, quality);
      break;
    default:
      break;
  }
  // El default de Relative en Eficiencia usa una ventana multiclass
  // determinista; no existe una variante alternativa para esta presentación.
  if (usesRelativeStudyProjection(scenario)) {
    const playerId = frame.player.id ?? "";
    // Una escena puede sacar o cruzar un coche: la selección 3+3 la hace la
    // VM después del parche, con el resto del campo disponible para rellenar
    // el hueco. Recortar aquí dejaría permanentemente una fila sin rival.
    const hasRelativeScene = scenario.sceneId && getAnimationScene(scenario.sceneId)?.widget === "relative";
    const ahead = hasRelativeScene ? Number.POSITIVE_INFINITY : scenario.rangeAhead ?? RELATIVE_RANGE_AHEAD;
    const behind = hasRelativeScene ? Number.POSITIVE_INFINITY : scenario.rangeBehind ?? RELATIVE_RANGE_BEHIND;
    frame = {
      ...frame,
      relative: relativeDevWindow(frame.relative, playerId, quality, ahead, behind),
      relativeSettled: relativeDevWindow(frame.relativeSettled, playerId, quality, ahead, behind),
    };
  }
  if (scenario.widget === "standings" && scenario.playerPosition !== undefined) {
    frame = withWorkshopPlayerPosition(frame, scenario.playerPosition);
  }
  if (scenario.widget === "standings" && scenario.system === EFFICIENCY_SYSTEM_ID
    && (scenario.variant === "default" || scenario.variant === "standings-multiclass")) {
    frame = withFunctionalStandingsDemo(frame, scenario, quality);
  }
  frame = applyScene(frame, scenario, quality);
  return { ...runtime, overlayV2Frame: frame };
}

function fitStandingsMinimum(widget: WidgetInstanceV3): WidgetInstanceV3 {
  const minimum = resolveStandingsMinimumSize(widget);
  return minimum
    ? { ...widget, layout: { ...widget.layout, w: minimum.width, h: minimum.height ?? widget.layout.h } }
    : widget;
}
