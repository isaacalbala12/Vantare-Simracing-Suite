import crystalReferenceManifest from "../../../../testdata/crystal-reference/manifest.json";
import type {
  OverlayFrameV2,
  OverlayQualityV2,
  OverlayQValue,
  OverlayRelativeRowV2,
  OverlayStandingRowV2,
} from "../../../generated/telemetry";
import type { DesignSystemId, WidgetInstanceV3, WidgetType } from "../../core/profile-document";
import type { WidgetRuntimeInput } from "../../core/widget-definition";
import {
  AUTHORING_V2_VARIANTS,
  buildAuthoringV2ScenarioRuntime,
  type AuthoringV2Variant,
} from "./authoring-v2-scenario-fixture";
import { widgetTypeRegistry } from "../../core/widget-registry";
import { applyWidgetDesign } from "../../core/widget-design";
import { parseRelativeContent, updateRelativeFilters } from "../../widget-types/relative/relative-content";
import { getOfficialDesign } from "../../design-systems/official-designs";
import { getAnimationScene, sceneFrameAt } from "./animation-scenes";
import type { SceneFrame } from "./animation-scenes";

// ponytail: tablas dev migradas del megamódulo legacy; mueren con él en E1.

// Variantes dev de Workshop: transformaciones explícitas, deterministas y
// acotadas sobre el golden canónico. La variante en sí declara el artificio;
// nada aquí pretende ser telemetría real.
export const WORKSHOP_V2_DEV_VARIANTS = [
  "standings-stress60",
  "standings-replay",
  "relative-multiclass",
  "pedals-zero",
  "pedals-full",
] as const;

export type WorkshopV2DevVariant = (typeof WORKSHOP_V2_DEV_VARIANTS)[number];
export type WorkshopV2Variant = AuthoringV2Variant | WorkshopV2DevVariant;

export const WORKSHOP_V2_VARIANTS: readonly WorkshopV2Variant[] = [
  ...AUTHORING_V2_VARIANTS,
  ...WORKSHOP_V2_DEV_VARIANTS,
];

const WORKSHOP_V2_VARIANT_SET: ReadonlySet<string> = new Set(WORKSHOP_V2_VARIANTS);

export function isWorkshopV2Variant(value: string): value is WorkshopV2Variant {
  return WORKSHOP_V2_VARIANT_SET.has(value);
}

export const STANDINGS_REPLAY_FRAME_COUNT = 10;

// Las variantes dev no dan forma: se dibujan con la shape equivalente mínima.
const DEV_SHAPE_VARIANT: Record<WorkshopV2DevVariant, AuthoringV2Variant> = {
  "standings-stress60": "default",
  "standings-replay": "standings-multiclass",
  "relative-multiclass": "default",
  "pedals-zero": "default",
  "pedals-full": "default",
};

function workshopDesignMeta(designId: string): { designId: string; width: number; height: number } | undefined {
  const entry = crystalReferenceManifest.entries.find((candidate) => candidate.designId === designId);
  return entry ? { designId: entry.designId, width: entry.width, height: entry.height } : undefined;
}

function shapeVariantFor(input: {
  widget: WidgetType;
  variant: WorkshopV2Variant;
  sceneId?: string;
}): AuthoringV2Variant {
  // La escena también da forma al widget: sin multiclass la escena de
  // fastest-lap entregaría la corona entre coches fuera de pantalla.
  if (input.sceneId && input.widget === "standings") {
    return "standings-multiclass";
  }
  if ((AUTHORING_V2_VARIANTS as readonly string[]).includes(input.variant)) {
    return input.variant as AuthoringV2Variant;
  }
  return DEV_SHAPE_VARIANT[input.variant as WorkshopV2DevVariant];
}

// Forma del widget desde el registro productivo (E1b: consolida aquí el
// helper temporal borrado; solo forma, cero telemetría).
function buildScenarioWidgetShape(input: {
  widget: WidgetType;
  system: DesignSystemId;
  variant: AuthoringV2Variant;
}): WidgetInstanceV3 {
  if (!AUTHORING_V2_VARIANTS.includes(input.variant)) {
    throw new Error(
      `authoring-v2-workshop-frame: variante no soportada ${JSON.stringify(input.variant)}`,
    );
  }
  const definition = widgetTypeRegistry.get(input.widget);
  const widget = definition.createDefault(`${input.widget}-harness`);
  widget.visual = { ...widget.visual, systemId: input.system };

  if (input.widget === "broadcast-tower") {
    widget.content = { ...widget.content as Record<string, unknown>, rowCount: 10 };
  }
  if (input.widget === "multiclass-relative") {
    widget.content = { ...widget.content as Record<string, unknown>, rowCount: 4 };
  }
  if (input.widget === "standings" && input.variant === "standings-multiclass") {
    const content = widget.content as Record<string, unknown>;
    const columns = Array.isArray(content.columns)
      ? (content.columns as Record<string, unknown>[]).map((column) =>
          column.metricId === "bestLap" ? { ...column, enabled: true } : column,
        )
      : content.columns;
    widget.content = { ...content, classScope: "all-classes", columns };
  }
  if (
    input.widget === "standings" &&
    (input.variant === "standings-minimal" || input.variant === "standings-all-columns")
  ) {
    const content = widget.content as Record<string, unknown>;
    const columns = Array.isArray(content.columns)
      ? (content.columns as Record<string, unknown>[]).map((column) => ({
          ...column,
          enabled:
            input.variant === "standings-all-columns" ||
            column.metricId === "position" ||
            column.metricId === "driverName",
        }))
      : content.columns;
    widget.content = { ...content, columns };
  }
  widget.layout = { ...widget.layout, x: 120, y: 96, zIndex: 1 };

  if (input.widget === "relative" && input.variant === "relative-fill") {
    const content = parseRelativeContent(widget.content);
    widget.content = updateRelativeFilters(content, { rowHeightMode: "fill" });
    widget.layout = { ...widget.layout, h: Math.max(widget.layout.h, 320) };
  }

  return widget;
}

export function createScenarioWidget(input: {
  widget: WidgetType;
  system: DesignSystemId;
  variant: WorkshopV2Variant;
  designId?: string;
  sceneId?: string;
}): WidgetInstanceV3 {
  const shape = shapeVariantFor(input);
  let widget = buildScenarioWidgetShape({ widget: input.widget, system: input.system, variant: shape });
  if (!input.designId) return widget;
  const official = getOfficialDesign(input.designId);
  if (!official) {
    throw new Error(`authoring-v2-workshop-frame: diseño desconocido ${JSON.stringify(input.designId)}`);
  }
  if (official.widgetType !== input.widget || official.systemId !== input.system) {
    throw new Error(
      `authoring-v2-workshop-frame: diseño ${input.designId} incompatible con ${input.widget}/${input.system}`,
    );
  }
  widget = applyWidgetDesign(widget, official, "1970-01-01T00:00:00.000Z");
  const manifest = workshopDesignMeta(input.designId);
  if (manifest) widget.layout = { ...widget.layout, w: manifest.width, h: manifest.height };
  return widget;
}

export type WorkshopV2Scenario = {
  session: "practice" | "qualifying" | "race";
  location: "track" | "pits";
  state: "ready" | "stale" | "disconnected" | "error";
  widget: WidgetType;
  system: DesignSystemId;
  variant: WorkshopV2Variant;
  replayFrame?: number;
  sceneId?: string;
  sceneFrame?: number;
  sceneState?: SceneFrame;
};

// Calendario auxiliar dev migrado del mock legacy: no es telemetría, solo
// alimenta el canal auxiliar de race-schedule en Workshop.
const WORKSHOP_V2_SCHEDULE_EVENTS = [
  { id: "spa", title: "Spa Endurance", track: "Spa-Francorchamps", startAt: "2026-07-14T18:00:00.000Z", durationMinutes: 90, classes: ["GT3"], status: "upcoming", license: "A" },
  { id: "monza", title: "Monza Sprint", track: "Monza", startAt: "2026-07-15T19:30:00.000Z", durationMinutes: 45, classes: ["GT3"], status: "upcoming", license: "A" },
  { id: "cota", title: "One Stint Sprint", track: "Circuit of the Americas", startAt: "2026-07-16T20:00:00.000Z", durationMinutes: 40, classes: ["HYPERCAR", "LMGT3"], status: "open", license: "GOLD SR" },
  { id: "lemans", title: "6 Hours of Le Mans", track: "Circuit de la Sarthe", startAt: "2026-07-17T17:00:00.000Z", durationMinutes: 360, classes: ["HYPERCAR", "LMP2", "LMGT3"], status: "team registration", license: "SPECIAL EVENT" },
] as const;

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

function stressStandings(rows: readonly OverlayStandingRowV2[]): OverlayStandingRowV2[] {
  const out: OverlayStandingRowV2[] = [];
  const perClass = new Map<string, number>();
  for (let copy = 0; copy < 3; copy++) {
    rows.forEach((row) => {
      const classId = row.classId ?? "unknown";
      perClass.set(classId, (perClass.get(classId) ?? 0) + 1);
      out.push({
        ...row,
        id: copy === 0 ? row.id : `${row.id}#dev-${copy}`,
        position: out.length + 1,
        classPosition: perClass.get(classId)!,
      });
    });
  }
  return out;
}

const RELATIVE_DEV_GAPS = [5.5, 4.2, 1.8, 0.4, 0, -0.3, -2.6, -5.1];

function sideForGap(gap: number, fallback: string): string {
  if (gap > 0) return "ahead";
  if (gap < 0) return "behind";
  return fallback;
}

// Ventana dev sobre el orden canónico: 4 ahead far→near, player, 3 behind
// near→far. Una sola función para relative y relativeSettled.
function relativeDevWindow(
  rows: readonly OverlayRelativeRowV2[],
  playerId: string,
  quality: OverlayQualityV2,
): OverlayRelativeRowV2[] {
  const gapValue = (row: OverlayRelativeRowV2): number => row.gap.v ?? 0;
  const ahead = rows
    .filter((row) => row.side === "ahead")
    .sort((left, right) => gapValue(right) - gapValue(left));
  const behind = rows.filter((row) => row.side === "behind");
  const player = rows.find((row) => row.id === playerId);
  if (!player) {
    throw new Error("authoring-v2-workshop-frame: relative sin fila del jugador");
  }
  const window = [...ahead.slice(-4), player, ...behind.slice(0, 3)];
  return window.map((row, index) => {
    const gap = RELATIVE_DEV_GAPS[index]!;
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

function patchRelativeSection(
  rows: readonly OverlayRelativeRowV2[],
  cars: Record<string, { timeGapToPlayer?: number; absent?: boolean }>,
  quality: OverlayQualityV2,
): OverlayRelativeRowV2[] {
  return rows.flatMap((row) => {
    const key = (row.name && cars[row.name] ? row.name : undefined) ?? seatNameAt(RELATIVE_DEV_SEAT_BY_DRIVER, row.position);
    const patch = key ? cars[key] : undefined;
    if (!patch) return [row];
    // lapDistanceMeters no tiene campo en la fila V2: se ignora sin fingirlo.
    if (patch.absent) return [];
    if (patch.timeGapToPlayer === undefined) return [row];
    return [{
      ...row,
      gap: qualityValue(patch.timeGapToPlayer, quality),
      side: sideForGap(patch.timeGapToPlayer, row.side),
    }];
  });
}

function applyScene(
  frame: OverlayFrameV2,
  scenario: WorkshopV2Scenario,
  quality: OverlayQualityV2,
): OverlayFrameV2 {
  const scene = scenario.sceneId ? getAnimationScene(scenario.sceneId) : undefined;
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
    if (scene.widget === "relative") {
      relative = patchRelativeSection(frame.relative, state.cars, quality);
      settled = patchRelativeSection(frame.relativeSettled, state.cars, quality);
    } else {
      standings = standings.flatMap((row) => {
        const key = (row.driver && state.cars![row.driver] ? row.driver : undefined) ?? seatNameAt(STANDINGS_DEV_SEAT_BY_DRIVER, row.position);
        const patch = key ? state.cars![key] : undefined;
        if (!patch) return [row];
        // tireCompound no tiene campo en la fila V2: se ignora sin fingirlo.
        if (patch.absent) return [];
        return [
          patchRow(row, {
            ...(patch.place !== undefined ? { position: patch.place } : {}),
            ...(patch.timeBehindLeader !== undefined ? { gap: patch.timeBehindLeader } : {}),
            ...(patch.inPits !== undefined ? { pit: patch.inPits } : {}),
            ...(patch.bestLapTime !== undefined ? { bestLap: patch.bestLapTime } : {}),
          }, quality) ?? row,
        ];
      });
      standings = [...standings].sort((left, right) => left.position - right.position);
    }
  }
  let player = frame.player;
  let delta = frame.delta;
  let session = frame.session;
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
  let frame = base.overlayV2Frame!;
  switch (scenario.variant) {
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
    case "relative-multiclass": {
      const playerId = frame.player.id ?? "";
      frame = {
        ...frame,
        relative: relativeDevWindow(frame.relative, playerId, quality),
        relativeSettled: relativeDevWindow(frame.relativeSettled, playerId, quality),
      };
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
  frame = applyScene(frame, scenario, quality);
  return { ...runtime, overlayV2Frame: frame };
}
