import type { AuthoringFixtureWidget } from "./authoring-fixtures";

/**
 * A single car's state for one frame of a scene. Anything omitted keeps the
 * value the baseline field already has.
 */
export type SceneOverride = {
  place?: number;
  timeBehindLeader?: number;
  inPits?: boolean;
  tireCompound?: string;
  bestLapTime?: number;
  /** Drops the car from the field entirely (retirement / rejoin frames). */
  absent?: boolean;
};

export type SceneFrame = {
  /** Per-driver state for this frame, keyed by driver name. */
  cars?: Record<string, SceneOverride>;
  /** Session clock for this frame, when the animation depends on it. */
  remainingSeconds?: number;
  /** Shown under the transport so it is clear what this frame is doing. */
  caption: string;
};

export type AnimationScene = {
  id: string;
  widget: AuthoringFixtureWidget;
  label: string;
  /** What to look at, so a scene is self-explanatory without reading the code. */
  watchFor: string;
  /** Milliseconds per frame. A battle needs room to breathe; a flash does not. */
  frameMs: number;
  frames: readonly SceneFrame[];
  /**
   * Telemetry field this animation needs, when the live projection does not
   * deliver it. The mock supplies it, so the scene plays here and never in a
   * real race — which is exactly the kind of thing a catalog should say out
   * loud. Kept in sync with UNSUPPORTED_FIELDS in overlay-projection-adapter.
   */
  unsupportedSignal?: string;
};

/**
 * The GT3 pair the scenes lean on. Bovy runs ninth with Bruni right behind, far
 * enough down the order that the class block has rows above and below to move.
 */
const BOVY_BASE = 19.35;

/** Best lap of the overall session-best holder in the baseline field. */
const ALLEN_BEST = 86.408;

const OVERTAKE_SCENE: AnimationScene = {
  id: "standings-overtake",
  widget: "standings",
  label: "Adelantamiento",
  watchFor:
    "Las dos filas se intercambian deslizándose (FLIP) y destellan: verde quien gana, rojo quien pierde. El chip de delta de la fila que sube cuenta una posición.",
  frameMs: 1200,
  frames: [
    { caption: "Bruni rueda a 0,6 s de Bovy", cars: { "Gianmaria Bruni": { timeBehindLeader: BOVY_BASE + 0.6 } } },
    { caption: "Se pega: 0,15 s", cars: { "Gianmaria Bruni": { timeBehindLeader: BOVY_BASE + 0.15 } } },
    {
      caption: "Adelantamiento consumado",
      cars: {
        "Gianmaria Bruni": { place: 9, timeBehindLeader: BOVY_BASE - 0.05 },
        "Sarah Bovy": { place: 10, timeBehindLeader: BOVY_BASE + 0.2 },
      },
    },
    {
      caption: "Bruni se escapa",
      cars: {
        "Gianmaria Bruni": { place: 9, timeBehindLeader: BOVY_BASE - 0.1 },
        "Sarah Bovy": { place: 10, timeBehindLeader: BOVY_BASE + 1.3 },
      },
    },
  ],
};

const BATTLE_SCENE: AnimationScene = {
  id: "standings-battle",
  widget: "standings",
  label: "Batalla",
  watchFor:
    "Bajo 0,8 s aparece la costura de luz entre las dos filas; si el duelo se sostiene, cristaliza en caja con el intervalo centrado, y la celda del gap del perseguidor se llena de carmín conforme cierra. Al romperse, la caja se disuelve. La cristalización depende de un temporizador de 2,5 s, así que hay que dejar correr la escena: avanzando a mano no llega a caja.",
  frameMs: 1600,
  frames: [
    { caption: "Separados: 2,4 s", cars: { "Gianmaria Bruni": { timeBehindLeader: BOVY_BASE + 2.4 } } },
    { caption: "Entra en rango: 0,7 s — costura", cars: { "Gianmaria Bruni": { timeBehindLeader: BOVY_BASE + 0.7 } } },
    { caption: "Duelo sostenido: 0,5 s", cars: { "Gianmaria Bruni": { timeBehindLeader: BOVY_BASE + 0.5 } } },
    { caption: "Sostenido: cristaliza en caja", cars: { "Gianmaria Bruni": { timeBehindLeader: BOVY_BASE + 0.4 } } },
    { caption: "Aguanta la caja", cars: { "Gianmaria Bruni": { timeBehindLeader: BOVY_BASE + 0.45 } } },
    { caption: "Se rompe: la caja se disuelve", cars: { "Gianmaria Bruni": { timeBehindLeader: BOVY_BASE + 2.6 } } },
  ],
};

const FASTEST_LAP_SCENE: AnimationScene = {
  id: "standings-fastest-lap",
  widget: "standings",
  label: "Vuelta rápida y traspaso de corona",
  watchFor:
    "El glifo morado vuela desde la fila del dueño anterior hasta la nueva, y la fila que arrebata la vuelta se enciende.",
  frameMs: 1600,
  frames: [
    { caption: "Allen tiene la vuelta rápida (1:26.408)" },
    {
      caption: "Hanley la arrebata (1:25.902) — la corona vuela",
      cars: { "Ben Hanley": { bestLapTime: 85.902 } },
    },
    { caption: "Hanley la conserva", cars: { "Ben Hanley": { bestLapTime: 85.902 } } },
    {
      caption: "Albuquerque se la quita (1:25.402)",
      cars: { "Ben Hanley": { bestLapTime: 85.902 }, "Filipe Albuquerque": { bestLapTime: 85.402 } },
    },
  ],
};

const TIRE_CHANGE_SCENE: AnimationScene = {
  id: "standings-tire-change",
  widget: "standings",
  label: "Parada y cambio de neumático",
  watchFor:
    "La fila pasa a modo pit y, al salir, aparece el disco del compuesto junto al dorsal (S rojo, M amarillo, H blanco) antes de replegarse.",
  unsupportedSignal: "scoring[].tireCompound",
  frameMs: 1800,
  // The compound has to differ across the stop, or the engine correctly reports
  // no change and the disc never appears.
  frames: [
    { caption: "Cameron rueda con medias", cars: { "Duncan Cameron": { tireCompound: "M" } } },
    { caption: "Entra a boxes", cars: { "Duncan Cameron": { tireCompound: "M", inPits: true } } },
    { caption: "Sigue parado", cars: { "Duncan Cameron": { tireCompound: "M", inPits: true } } },
    {
      caption: "Sale con blandas — disco S",
      cars: { "Duncan Cameron": { tireCompound: "S", timeBehindLeader: 24.5 } },
    },
    { caption: "El disco se repliega", cars: { "Duncan Cameron": { tireCompound: "S", timeBehindLeader: 24.5 } } },
  ],
};

const DELTA_CHIP_SCENE: AnimationScene = {
  id: "standings-delta-chip",
  widget: "standings",
  label: "Chip de delta vivo",
  watchFor:
    "El contador de posiciones ganadas no salta: cuenta +1, +2, +3 con un tick por posición, aunque el ascenso ocurra de golpe.",
  frameMs: 1600,
  frames: [
    { caption: "Bruni décimo, sin delta" },
    {
      caption: "Sube tres plazas de una vez — el chip cuenta +1 → +2 → +3",
      cars: {
        "Gianmaria Bruni": { place: 7, timeBehindLeader: BOVY_BASE - 2.2 },
        "Sarah Bovy": { place: 10, timeBehindLeader: BOVY_BASE + 0.4 },
        "Michael Birch": { place: 9, timeBehindLeader: BOVY_BASE + 0.1 },
        "Martin Berry": { place: 8, timeBehindLeader: BOVY_BASE - 0.2 },
      },
    },
    {
      caption: "Mantiene la séptima",
      cars: {
        "Gianmaria Bruni": { place: 7, timeBehindLeader: BOVY_BASE - 2.3 },
        "Sarah Bovy": { place: 10, timeBehindLeader: BOVY_BASE + 0.4 },
        "Michael Birch": { place: 9, timeBehindLeader: BOVY_BASE + 0.1 },
        "Martin Berry": { place: 8, timeBehindLeader: BOVY_BASE - 0.2 },
      },
    },
  ],
};

const CAR_ENTERS_SCENE: AnimationScene = {
  id: "standings-car-enters",
  widget: "standings",
  label: "Entrada de coche",
  watchFor: "La fila del coche que reaparece se despliega deslizándose desde la izquierda en lugar de aparecer de golpe.",
  frameMs: 1600,
  frames: [
    { caption: "Laursen no está en la lista", cars: { "Conrad Laursen": { absent: true } } },
    { caption: "Laursen reaparece — la fila entra deslizándose" },
    { caption: "Ya asentado" },
  ],
};

const RETIREMENT_SCENE: AnimationScene = {
  id: "standings-retirement",
  widget: "standings",
  label: "Abandono",
  watchFor: "La fila del coche que abandona se queda como fantasma en su sitio y se desvanece, en vez de desaparecer de golpe.",
  frameMs: 1600,
  frames: [
    { caption: "Laursen rueda con normalidad" },
    { caption: "Abandona — la fila queda como fantasma", cars: { "Conrad Laursen": { absent: true } } },
    { caption: "El fantasma se ha ido", cars: { "Conrad Laursen": { absent: true } } },
  ],
};

const FINAL_MINUTES_SCENE: AnimationScene = {
  id: "standings-final-minutes",
  widget: "standings",
  label: "Últimos minutos",
  watchFor: "Al bajar de cinco minutos, el slot de sesión pasa a carmín y respira.",
  frameMs: 1600,
  frames: [
    { caption: "Quedan 12 minutos — slot en gris", remainingSeconds: 720 },
    { caption: "Quedan 6 minutos — aún en gris", remainingSeconds: 360 },
    { caption: "Bajo cinco minutos — el slot se enciende", remainingSeconds: 280 },
    { caption: "Un minuto para el final", remainingSeconds: 60 },
  ],
};

/** The original ten-frame timeline, kept as one scene so nothing regresses. */
const FULL_SEQUENCE_SCENE: AnimationScene = {
  id: "standings-full",
  widget: "standings",
  label: "Secuencia completa",
  watchFor: "Encadena batalla, adelantamiento, parada con cambio de goma, vuelta rápida, abandono y reentrada.",
  frameMs: 1400,
  frames: [
    { caption: "Base" },
    { caption: "Bruni se acerca", cars: { "Gianmaria Bruni": { timeBehindLeader: BOVY_BASE + 0.6 } } },
    { caption: "Batalla", cars: { "Gianmaria Bruni": { timeBehindLeader: BOVY_BASE + 0.35 } } },
    { caption: "Al límite", cars: { "Gianmaria Bruni": { timeBehindLeader: BOVY_BASE + 0.15 } } },
    {
      caption: "Adelantamiento",
      cars: {
        "Gianmaria Bruni": { place: 9, timeBehindLeader: BOVY_BASE - 0.05 },
        "Sarah Bovy": { place: 10, timeBehindLeader: BOVY_BASE + 0.2 },
      },
    },
    {
      caption: "Se escapa",
      cars: {
        "Gianmaria Bruni": { place: 9, timeBehindLeader: BOVY_BASE - 0.1 },
        "Sarah Bovy": { place: 10, timeBehindLeader: BOVY_BASE + 1.3 },
      },
    },
    {
      caption: "Cameron entra a boxes",
      cars: {
        "Gianmaria Bruni": { place: 9, timeBehindLeader: BOVY_BASE - 0.1 },
        "Sarah Bovy": { place: 10, timeBehindLeader: BOVY_BASE + 1.3 },
        "Duncan Cameron": { inPits: true },
      },
    },
    {
      caption: "Sale con blandas; Hanley marca la vuelta rápida",
      cars: {
        "Gianmaria Bruni": { place: 9, timeBehindLeader: BOVY_BASE - 0.1 },
        "Sarah Bovy": { place: 10, timeBehindLeader: BOVY_BASE + 1.3 },
        "Duncan Cameron": { tireCompound: "S", timeBehindLeader: 24.5 },
        "Ben Hanley": { bestLapTime: 85.902 },
      },
    },
    {
      caption: "Laursen abandona",
      cars: {
        "Gianmaria Bruni": { place: 9, timeBehindLeader: BOVY_BASE - 0.1 },
        "Sarah Bovy": { place: 10, timeBehindLeader: BOVY_BASE + 1.3 },
        "Duncan Cameron": { tireCompound: "S", timeBehindLeader: 24.5 },
        "Ben Hanley": { bestLapTime: 85.902 },
        "Conrad Laursen": { absent: true },
      },
    },
    { caption: "Sigue fuera; el frame 0 juega su reentrada", cars: { "Conrad Laursen": { absent: true } } },
  ],
};

export const ANIMATION_SCENES: readonly AnimationScene[] = [
  OVERTAKE_SCENE,
  BATTLE_SCENE,
  FASTEST_LAP_SCENE,
  TIRE_CHANGE_SCENE,
  DELTA_CHIP_SCENE,
  CAR_ENTERS_SCENE,
  RETIREMENT_SCENE,
  FINAL_MINUTES_SCENE,
  FULL_SEQUENCE_SCENE,
];

export const ANIMATION_SCENE_IDS: readonly string[] = ANIMATION_SCENES.map((scene) => scene.id);

export function isAnimationSceneId(value: unknown): value is string {
  return typeof value === "string" && ANIMATION_SCENE_IDS.includes(value);
}

export function getAnimationScene(id: string): AnimationScene | undefined {
  return ANIMATION_SCENES.find((scene) => scene.id === id);
}

export function listAnimationScenes(widget: AuthoringFixtureWidget): readonly AnimationScene[] {
  return ANIMATION_SCENES.filter((scene) => scene.widget === widget);
}

/** Wraps so the transport can loop and step backwards past zero. */
export function sceneFrameAt(scene: AnimationScene, frame: number): SceneFrame {
  const count = scene.frames.length;
  return scene.frames[((frame % count) + count) % count];
}

/** Unused constant kept meaningful: the session-best baseline the scenes assume. */
export const SCENE_BASELINE_BEST_LAP = ALLEN_BEST;
