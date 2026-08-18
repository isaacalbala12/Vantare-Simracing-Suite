/**
 * Dominio de Telemetría Orbit (`13-modelo-y-algoritmos.md § 13.6`).
 *
 * Aquí vive **solo** el generador sintético del modo demo: la fuente real de
 * sesiones (archivos locales de LMU indexados en DuckDB, ADR 0004 / 0005) no
 * está expuesta al frontend todavía, así que la pantalla arranca vacía y este
 * módulo únicamente se usa cuando el flag de demo está encendido. Todo lo que
 * sale de aquí está etiquetado como sintético por quien lo pinta.
 */

import type { TrackSegment } from "../../ui/orbit";
import { segmentTone } from "../../ui/orbit";

/** Las tres referencias del `Seg` de la cabecera. */
export type TelemetryReference = "best" | "session" | "pro";

export const TELEMETRY_REFERENCES: TelemetryReference[] = ["best", "session", "pro"];

/** Escala de la referencia (`13.6`): propia 1 · sesión .85 · Vantare 1.6. */
export const REFERENCE_SCALE: Record<TelemetryReference, number> = {
  best: 1,
  session: 0.85,
  pro: 1.6,
};

export const LAP_METERS = 3700;
export const SAMPLES = 400;

export interface TelemetryCorner {
  /** Nombre de la curva, y también su id de tramo (`T7`). */
  name: string;
  /** Delta base en segundos: + se pierde, − se gana. */
  delta: number;
  /** Fracción de vuelta 0–1. */
  pos: number;
  /** Clave i18n de la explicación (`telemetry.demo.why.*`). */
  whyKey: string;
}

/** Las ocho curvas del circuito de demostración del prototipo (`13.6`). */
export const DEMO_CORNERS: TelemetryCorner[] = [
  { name: "T1", delta: -0.04, pos: 0.06, whyKey: "telemetry.demo.why.t1" },
  { name: "T3", delta: 0.06, pos: 0.19, whyKey: "telemetry.demo.why.t3" },
  { name: "T5", delta: 0.02, pos: 0.31, whyKey: "telemetry.demo.why.t5" },
  { name: "T7", delta: 0.18, pos: 0.44, whyKey: "telemetry.demo.why.t7" },
  { name: "T10", delta: -0.05, pos: 0.58, whyKey: "telemetry.demo.why.t10" },
  { name: "T13", delta: 0.11, pos: 0.71, whyKey: "telemetry.demo.why.t13" },
  { name: "T15", delta: 0.09, pos: 0.83, whyKey: "telemetry.demo.why.t15" },
  { name: "T17", delta: 0.16, pos: 0.93, whyKey: "telemetry.demo.why.t17" },
];

const TRACK_ANCHORS: [number, number][] = [
  [60, 150], [70, 90], [110, 60], [170, 50], [230, 58], [280, 45], [330, 55],
  [360, 90], [355, 135], [320, 160], [300, 200], [330, 240], [300, 270],
  [240, 265], [190, 245], [150, 255], [110, 240], [80, 205], [62, 180],
];

/** Catmull-Rom cerrado sobre los 19 puntos del prototipo (`13.6`). */
function catmull(points: [number, number][], resolution = 12): [number, number][] {
  const out: [number, number][] = [];
  const count = points.length;
  for (let index = 0; index < count; index += 1) {
    const p0 = points[(index - 1 + count) % count];
    const p1 = points[index];
    const p2 = points[(index + 1) % count];
    const p3 = points[(index + 2) % count];
    for (let step = 0; step < resolution; step += 1) {
      const t = step / resolution;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}

export const DEMO_TRACK: [number, number][] = catmull(TRACK_ANCHORS);

export interface TelemetryChannels {
  speed: number[];
  throttle: number[];
  brake: number[];
  steer: number[];
}

/**
 * Canales deterministas de 400 muestras (`13.6`): velocidad 250 base menos una
 * gaussiana por curva, freno antes del vértice, acelerador a 0 en curva y
 * volante con signo alterno. La vuelta propia frena antes donde pierde tiempo.
 */
export function demoChannels(mine: boolean): TelemetryChannels {
  const speed: number[] = [];
  const throttle: number[] = [];
  const brake: number[] = [];
  const steer: number[] = [];

  for (let index = 0; index < SAMPLES; index += 1) {
    const x = index / SAMPLES;
    let v = 250;
    let thr = 100;
    let brk = 0;
    let str = 0;

    DEMO_CORNERS.forEach((corner) => {
      const distance = Math.abs(x - corner.pos);
      const width = 0.035;
      if (distance >= width * 2.2) return;
      const g = Math.exp(-(distance * distance) / (2 * width * width));
      const depth = 60 + (70 * ((corner.name.charCodeAt(1) * 7) % 5)) / 4;
      const early = mine ? corner.delta * 0.35 : 0;
      const shift = x - corner.pos + early;
      v -= depth * g * (mine ? 1 + corner.delta * 0.6 : 1);
      brk = Math.max(
        brk,
        shift < 0 && shift > -width * 1.6
          ? 90 *
              Math.exp(-((shift + width * 0.8) ** 2) / (2 * (width * 0.5) ** 2)) *
              (mine ? 1 - corner.delta * 0.8 : 1)
          : 0,
      );
      thr = Math.min(thr, shift < 0.02 && shift > -width * 1.6 ? 100 - 100 * g : 100);
      str =
        Math.max(Math.abs(str), 40 + 60 * g) *
        (corner.name.charCodeAt(1) % 2 ? 1 : -1) *
        (mine && corner.delta > 0.1 ? 1 + 0.15 * Math.sin(x * 400) : 1);
    });

    speed.push(Math.max(60, v));
    throttle.push(Math.max(0, thr));
    brake.push(Math.min(100, brk));
    steer.push(str);
  }

  return { speed, throttle, brake, steer };
}

/**
 * Delta acumulado: se suma el delta de cada curva **una sola vez**, al pasar
 * por su posición, escalado por la referencia elegida.
 */
export function demoDeltaSeries(scale: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  let accumulated = 0;
  for (let index = 0; index < SAMPLES; index += 1) {
    const x = index / SAMPLES;
    DEMO_CORNERS.forEach((corner, position) => {
      if (!seen.has(position) && x >= corner.pos) {
        seen.add(position);
        accumulated += corner.delta * scale;
      }
    });
    out.push(accumulated);
  }
  return out;
}

/** Delta total de la vuelta contra la referencia, en segundos. */
export function demoTotalDelta(scale: number): number {
  const series = demoDeltaSeries(scale);
  return series[series.length - 1] ?? 0;
}

/** Tramo del mapa por curva: ±4.5 % del trazado alrededor de su posición. */
export function demoSegments(scale: number): TrackSegment[] {
  return DEMO_CORNERS.map((corner) => ({
    id: corner.name,
    from: corner.pos - 0.045,
    to: corner.pos + 0.045,
    delta: corner.delta * scale,
    label: corner.name,
  }));
}

export const demoBands = () => DEMO_CORNERS.map((corner) => ({ at: corner.pos, label: corner.name }));

export interface TelemetryInsight {
  id: string;
  corner: string;
  pos: number;
  delta: number;
  meters: number;
  whyKey: string;
  tone: "loss" | "gain" | "flat";
}

/** Insights ordenados por pérdida (mayor delta primero). */
export function demoInsights(scale: number): TelemetryInsight[] {
  return DEMO_CORNERS.map((corner) => {
    const delta = corner.delta * scale;
    return {
      id: corner.name,
      corner: corner.name,
      pos: corner.pos,
      delta,
      meters: Math.round(corner.pos * LAP_METERS),
      whyKey: corner.whyKey,
      tone: segmentTone(delta),
    };
  }).sort((a, b) => b.delta - a.delta);
}

export interface TelemetrySector {
  id: "S1" | "S2" | "S3";
  delta: number;
  tone: "loss" | "gain" | "flat";
}

/** Sectores: se reparten las curvas en tercios de vuelta y se suman sus deltas. */
export function demoSectors(scale: number): TelemetrySector[] {
  const ids: TelemetrySector["id"][] = ["S1", "S2", "S3"];
  return ids.map((id, index) => {
    const from = index / 3;
    const to = (index + 1) / 3;
    const delta = DEMO_CORNERS.filter(
      (corner) => corner.pos >= from && (index === 2 ? corner.pos <= to : corner.pos < to),
    ).reduce((total, corner) => total + corner.delta * scale, 0);
    return { id, delta, tone: segmentTone(delta) };
  });
}

export interface TelemetryReadout {
  meters: number;
  speed: number;
}

/** Lectura del cursor: metros de vuelta y velocidad propia en ese punto. */
export function readoutAt(channels: TelemetryChannels, cursor: number): TelemetryReadout {
  const clamped = Math.min(1, Math.max(0, cursor));
  const index = Math.min(SAMPLES - 1, Math.floor(clamped * SAMPLES));
  return {
    meters: Math.round(clamped * LAP_METERS),
    speed: Math.round(channels.speed[index] ?? 0),
  };
}

export interface TelemetrySession {
  id: string;
  track: string;
  car: string;
  /** Fecha ya formateada por el origen ("Hoy 18:42"). */
  when: string;
  laps: number;
  best: string;
}

/** Sesiones del modo demo. No existen: son las tres del prototipo. */
export const DEMO_SESSIONS: TelemetrySession[] = [
  { id: "s1", track: "Sebring (School)", car: "LMGT3", when: "Hoy 18:42", laps: 12, best: "2:04.512" },
  { id: "s2", track: "Sebring (School)", car: "LMGT3", when: "Ayer 21:10", laps: 9, best: "2:05.087" },
  { id: "s3", track: "COTA (National)", car: "LMGT3", when: "Sáb 17:30", laps: 15, best: "2:11.930" },
];

/** Formato `+0.53` / `−0.53` con signo siempre visible. */
export function formatDelta(delta: number, digits = 2): string {
  const fixed = delta.toFixed(digits);
  return delta > 0 ? `+${fixed}` : fixed;
}
