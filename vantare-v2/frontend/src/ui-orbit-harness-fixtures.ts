/* Datos de banco de pruebas del grupo 4 del harness. Son fixtures del harness,
   no del kit: los componentes de visualización reciben todo ya calculado (`13`). */

import type { AvailRange, DriverView, TyreView, WidgetDoc } from "./ui/orbit";

export interface HarnessCorner {
  name: string;
  /** Posición 0–1 en la vuelta. */
  pos: number;
  /** Delta contra la referencia, en segundos. */
  delta: number;
}

export const HARNESS_CORNERS: HarnessCorner[] = [
  { name: "T1", pos: 0.06, delta: 0.11 },
  { name: "T4", pos: 0.22, delta: -0.05 },
  { name: "T7", pos: 0.38, delta: 0.19 },
  { name: "T10", pos: 0.55, delta: 0.02 },
  { name: "T13", pos: 0.71, delta: -0.07 },
  { name: "T17", pos: 0.89, delta: 0.16 },
];

const SAMPLES = 240;

function gaussianAt(x: number, center: number, width: number): number {
  const d = x - center;
  return Math.exp(-(d * d) / (2 * width * width));
}

/** Canales sintéticos deterministas: cerca de cada curva cae la velocidad. */
function channels(mine: boolean) {
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
    HARNESS_CORNERS.forEach((corner, position) => {
      const g = gaussianAt(x, corner.pos, 0.035);
      if (g < 0.001) return;
      const depth = 70 + 22 * (position % 4);
      v -= depth * g * (mine ? 1 + corner.delta * 0.6 : 1);
      thr = Math.min(thr, 100 - 100 * g);
      brk = Math.max(brk, 95 * gaussianAt(x, corner.pos - 0.02, 0.018));
      str = Math.max(Math.abs(str), 95 * g) * (position % 2 === 0 ? 1 : -1);
    });
    speed.push(Math.max(60, v));
    throttle.push(Math.max(0, thr));
    brake.push(Math.min(100, brk));
    steer.push(str);
  }
  return { speed, throttle, brake, steer };
}

export const HARNESS_MINE = channels(true);
export const HARNESS_REF = channels(false);

/** Delta acumulado: se suma la pérdida de cada curva al pasar por ella. */
export const HARNESS_DELTA: number[] = (() => {
  const out: number[] = [];
  let accumulated = 0;
  const seen = new Set<number>();
  for (let index = 0; index < SAMPLES; index += 1) {
    const x = index / SAMPLES;
    HARNESS_CORNERS.forEach((corner, position) => {
      if (!seen.has(position) && x >= corner.pos) {
        seen.add(position);
        accumulated += corner.delta;
      }
    });
    out.push(accumulated);
  }
  return out;
})();

export const HARNESS_BANDS = HARNESS_CORNERS.map((corner) => ({
  at: corner.pos,
  label: corner.name,
}));

const TRACK_ANCHORS: [number, number][] = [
  [60, 150], [70, 90], [110, 60], [170, 50], [230, 58], [280, 45], [330, 55],
  [360, 90], [355, 135], [320, 160], [300, 200], [330, 240], [300, 270],
  [240, 265], [190, 245], [150, 255], [110, 240], [80, 205], [62, 180],
];

/** Catmull-Rom cerrado, igual que el prototipo. */
function catmull(points: [number, number][], resolution = 12): [number, number][] {
  const out: [number, number][] = [];
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
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

export const HARNESS_TRACK = catmull(TRACK_ANCHORS);

export const HARNESS_SEGMENTS = HARNESS_CORNERS.map((corner) => ({
  id: corner.name,
  from: corner.pos - 0.045,
  to: corner.pos + 0.045,
  delta: corner.delta,
  label: corner.name,
}));

export const HARNESS_TYRES: TyreView[] = [
  { id: "SET-01", compound: "soft", condition: 98, label: "Juego nuevo · seco" },
  { id: "SET-02", compound: "medium", condition: 76 },
  { id: "SET-03", compound: "hard", condition: 54 },
];

export const HARNESS_DRIVERS: DriverView[] = [
  { id: "isaac", name: "Isaac", color: "#f04755" },
  { id: "sol", name: "Sol", color: "#78d68b" },
  { id: "fable", name: "Fable", color: "#5ccbd5" },
];

export const HARNESS_RANGES: Record<string, AvailRange[]> = {
  isaac: [
    { from: 13, to: 15.5, state: "ok" },
    { from: 15.5, to: 16.5, state: "maybe" },
    { from: 16.5, to: 18.5, state: "ok" },
  ],
  sol: [
    { from: 13, to: 14, state: "no" },
    { from: 14, to: 17, state: "ok" },
    { from: 17, to: 18.5, state: "maybe" },
  ],
  fable: [
    { from: 13.5, to: 16, state: "maybe" },
    { from: 16, to: 18.5, state: "ok" },
  ],
};

export const HARNESS_WIDGETS: WidgetDoc[] = [
  { id: "standings", name: "Standings", system: "crystal", design: "glass", state: "activo", x: 64, y: 86, w: 518, h: 470 },
  { id: "delta", name: "Delta", system: "crystal", design: "glass", state: "activo", x: 820, y: 96, w: 280, h: 190 },
  { id: "relative", name: "Relative", system: "crystal", design: "glass", state: "activo", x: 1427, y: 367, w: 430, h: 300 },
  { id: "pedals", name: "Pedals", system: "crystal", design: "glass", state: "oculto", x: 828, y: 780, w: 264, h: 190, hidden: true },
];
