import type { WidgetType } from "../../core/profile-document";
import type { OverlayQualityV2 } from "../../../generated/telemetry";

/**
 * A single car's state for one frame of a scene. Anything omitted keeps the
 * value the baseline field already has.
 */
export type SceneOverride = {
  place?: number;
  timeBehindLeader?: number;
  /** Signed gap to the player, which is what the relative is built around. */
  timeGapToPlayer?: number;
  inPits?: boolean;
  tireCompound?: string;
  bestLapTime?: number;
  /** Drops the car from the field entirely (retirement / rejoin frames). */
  absent?: boolean;
  /** Workshop-only override for canonical lap difference; never inferred from position or gaps. */
  lapDelta?: number;
  lapDeltaQuality?: OverlayQualityV2;
};

/** Player-owned values, for widgets that read the driver rather than the field. */
export type ScenePlayerOverride = {
  deltaSeconds?: number;
  bestLapSeconds?: number;
  throttle?: number;
  brake?: number;
  clutch?: number;
};

export type SceneFrame = {
  /** Per-driver state for this frame, keyed by driver name. */
  cars?: Record<string, SceneOverride>;
  /** The player's own telemetry for this frame. */
  player?: ScenePlayerOverride;
  /** Session clock for this frame, when the animation depends on it. */
  remainingSeconds?: number;
  /** Shown under the transport so it is clear what this frame is doing. */
  caption: string;
};

export type AnimationScene = {
  id: string;
  widget: WidgetType;
  label: string;
  /** What to look at, so a scene is self-explanatory without reading the code. */
  watchFor: string;
  /** Milliseconds per frame. A battle needs room to breathe; a flash does not. */
  frameMs: number;
  frames: readonly SceneFrame[];
  /**
   * Telemetry field this animation needs, when the live projection does not
   * deliver it. Workshop keeps the value absent, so the catalog cannot suggest
   * a behaviour that a real race will not reproduce. Kept in sync with the
   * typed V2 presentation-gap catalog.
   */
  unsupportedSignal?: string;
};

/**
 * The same-class Hypercar pair the scenes lean on. Bovy starts seventh and
 * Bruni tenth, with enough rows around them to make position changes visible.
 */
const BOVY_BASE = 7.404;

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
        "Gianmaria Bruni": { place: 7, timeBehindLeader: BOVY_BASE - 0.05 },
        "Sarah Bovy": { place: 10, timeBehindLeader: BOVY_BASE + 0.2 },
      },
    },
    {
      caption: "Bruni se escapa",
      cars: {
        "Gianmaria Bruni": { place: 7, timeBehindLeader: BOVY_BASE - 0.1 },
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

/**
 * Same-class battle inside a visible block: Birch (GTE, P9) closes on Pier
 * Guidi (GTE, P6), the box crystallises, and the overtake swaps the two rows
 * while the wrapper is alive — the block↔battle remount the FLIP memory
 * exists for. Tuned on the golden grid's GTE gaps (Pier Guidi +6.2, Birch
 * +9.9); on the single-class study grid the seats 6↔9 resolve by fallback.
 */
const CLASS_BATTLE_SCENE: AnimationScene = {
  id: "standings-class-battle",
  widget: "standings",
  label: "Batalla y adelantamiento en clase",
  watchFor:
    "Birch se pega a Pier Guidi dentro del bloque GTE, la costura cristaliza en caja, y el adelantamiento intercambia las filas con la caja viva: deslizan sin saltar aunque React las remonte entre contenedor normal y caja. La batalla solo existe si la fila del jugador cabe en el widget — con la altura oficial (~620 px) el bloque Hypercar queda recortado; pruébalo con height=940 en la URL.",
  frameMs: 1400,
  frames: [
    { caption: "Birch a 3,7 s de Pier Guidi (GTE)" },
    { caption: "Se pega: 0,4 s — costura", cars: { "Michael Birch": { timeBehindLeader: 6.6 } } },
    { caption: "Duelo sostenido: 0,3 s — la caja cristaliza", cars: { "Michael Birch": { timeBehindLeader: 6.5 } } },
    // La caja necesita 2,5 s sostenidos: este fotograma la mantiene viva el
    // tiempo suficiente para que el adelantamiento llegue con la caja puesta.
    { caption: "Sigue en el rebufo: 0,2 s — caja cristalizada", cars: { "Michael Birch": { timeBehindLeader: 6.4 } } },
    {
      caption: "Adelanta con la caja viva — las filas se intercambian deslizándose",
      cars: {
        "Michael Birch": { place: 6, timeBehindLeader: 6.05 },
        "Alessandro Pier Guidi": { place: 9, timeBehindLeader: 6.4 },
      },
    },
    {
      caption: "Consolida; la caja se disuelve",
      cars: {
        "Michael Birch": { place: 6, timeBehindLeader: 5.9 },
        "Alessandro Pier Guidi": { place: 9, timeBehindLeader: 7.1 },
      },
    },
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
    "La fila pasa a modo pit y vuelve a pista; el compuesto permanece vacío porque OverlayFrame V2 todavía no lo entrega.",
  unsupportedSignal: "rows[].tireCompound",
  frameMs: 1800,
  // The requested compounds document the desired transition. The V2 Workshop
  // path deliberately ignores them until canonical telemetry can supply them.
  frames: [
    { caption: "Cameron rueda; compuesto no disponible", cars: { "Duncan Cameron": { tireCompound: "M" } } },
    { caption: "Entra a boxes", cars: { "Duncan Cameron": { tireCompound: "M", inPits: true } } },
    { caption: "Sigue parado", cars: { "Duncan Cameron": { tireCompound: "M", inPits: true } } },
    {
      caption: "Sale a pista; compuesto sigue no disponible",
      cars: { "Duncan Cameron": { tireCompound: "S", timeBehindLeader: 24.5 } },
    },
    { caption: "Fila asentada sin compuesto", cars: { "Duncan Cameron": { tireCompound: "S", timeBehindLeader: 24.5 } } },
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
  watchFor: "Encadena batalla, adelantamiento, parada y salida sin compuesto inventado, vuelta rápida, abandono y reentrada.",
  unsupportedSignal: "rows[].tireCompound",
  frameMs: 1400,
  frames: [
    { caption: "Base" },
    { caption: "Bruni se acerca", cars: { "Gianmaria Bruni": { timeBehindLeader: BOVY_BASE + 0.6 } } },
    { caption: "Batalla", cars: { "Gianmaria Bruni": { timeBehindLeader: BOVY_BASE + 0.35 } } },
    { caption: "Al límite", cars: { "Gianmaria Bruni": { timeBehindLeader: BOVY_BASE + 0.15 } } },
    {
      caption: "Adelantamiento",
      cars: {
        "Gianmaria Bruni": { place: 7, timeBehindLeader: BOVY_BASE - 0.05 },
        "Sarah Bovy": { place: 10, timeBehindLeader: BOVY_BASE + 0.2 },
      },
    },
    {
      caption: "Se escapa",
      cars: {
        "Gianmaria Bruni": { place: 7, timeBehindLeader: BOVY_BASE - 0.1 },
        "Sarah Bovy": { place: 10, timeBehindLeader: BOVY_BASE + 1.3 },
      },
    },
    {
      caption: "Cameron entra a boxes",
      cars: {
        "Gianmaria Bruni": { place: 7, timeBehindLeader: BOVY_BASE - 0.1 },
        "Sarah Bovy": { place: 10, timeBehindLeader: BOVY_BASE + 1.3 },
        "Duncan Cameron": { inPits: true },
      },
    },
    {
      caption: "Sale sin compuesto disponible; Hanley marca la vuelta rápida",
      cars: {
        "Gianmaria Bruni": { place: 7, timeBehindLeader: BOVY_BASE - 0.1 },
        "Sarah Bovy": { place: 10, timeBehindLeader: BOVY_BASE + 1.3 },
        "Duncan Cameron": { tireCompound: "S", timeBehindLeader: 24.5 },
        "Ben Hanley": { bestLapTime: 85.902 },
      },
    },
    {
      caption: "Laursen abandona",
      cars: {
        "Gianmaria Bruni": { place: 7, timeBehindLeader: BOVY_BASE - 0.1 },
        "Sarah Bovy": { place: 10, timeBehindLeader: BOVY_BASE + 1.3 },
        "Duncan Cameron": { tireCompound: "S", timeBehindLeader: 24.5 },
        "Ben Hanley": { bestLapTime: 85.902 },
        "Conrad Laursen": { absent: true },
      },
    },
    { caption: "Sigue fuera; el frame 0 juega su reentrada", cars: { "Conrad Laursen": { absent: true } } },
  ],
};

/**
 * Relative scenes run on the multiclass traffic fixture, where the player is a
 * GT3 mid-pack with a same-class fight either side and quicker prototypes
 * closing to lap them.
 */
const RELATIVE_CROSS_SCENE: AnimationScene = {
  id: "relative-cross",
  widget: "relative",
  label: "Te adelantan / adelantas",
  watchFor:
    "La fila que cruza al jugador se desliza al otro lado y se lava de color: rojo si te ha pasado, verde si le has pasado tú.",
  frameMs: 1400,
  frames: [
    { caption: "Bruni te sigue a 0,3 s", cars: { "Gianmaria Bruni": { timeGapToPlayer: -0.3 } } },
    { caption: "Te pasa: cruza al otro lado y se lava en rojo", cars: { "Gianmaria Bruni": { timeGapToPlayer: 0.5 } } },
    { caption: "Se va: 1,4 s por delante", cars: { "Gianmaria Bruni": { timeGapToPlayer: 1.4 } } },
    { caption: "Lo recuperas: cruza de vuelta en verde", cars: { "Gianmaria Bruni": { timeGapToPlayer: -0.4 } } },
  ],
};

const RELATIVE_ENTER_SCENE: AnimationScene = {
  id: "relative-enter",
  widget: "relative",
  label: "Entrada de coche",
  watchFor: "La fila del coche que aparece se despliega desde altura cero en vez de parpadear dentro de la lista.",
  frameMs: 1500,
  frames: [
    { caption: "Birch fuera de la ventana", cars: { "Michael Birch": { absent: true } } },
    { caption: "Aparece por detrás: la fila se despliega", cars: { "Michael Birch": {} } },
    { caption: "Ya asentado", cars: { "Michael Birch": {} } },
  ],
};

const RELATIVE_FUNCTIONAL_CROSS_AHEAD_SCENE: AnimationScene = {
  id: "relative-functional-cross-ahead",
  widget: "relative",
  label: "Cruce detrás → delante",
  watchFor:
    "Sigue al mismo rival y deja fijo al jugador: la fila cruza de detrás a delante cuando el gap cambia de signo, con un acento de color muy tenue solo en el cruce y cifras quietas.",
  frameMs: 1200,
  frames: [
    { caption: "Nico Pino detrás del jugador: −0,65 s", cars: { "Nico Pino": { timeGapToPlayer: -0.65 } } },
    { caption: "Se acerca: −0,12 s", cars: { "Nico Pino": { timeGapToPlayer: -0.12 } } },
    { caption: "Cruza hacia delante: +0,12 s", cars: { "Nico Pino": { timeGapToPlayer: 0.12 } } },
    { caption: "Se aleja delante: +0,65 s", cars: { "Nico Pino": { timeGapToPlayer: 0.65 } } },
  ],
};

const RELATIVE_FUNCTIONAL_CROSS_BEHIND_SCENE: AnimationScene = {
  id: "relative-functional-cross-behind",
  widget: "relative",
  label: "Cruce delante → detrás",
  watchFor:
    "Sigue al mismo rival y deja fijo al jugador: la fila cruza de delante a detrás cuando el gap cambia de signo, con un acento de color muy tenue solo en el cruce y cifras quietas.",
  frameMs: 1200,
  frames: [
    { caption: "Nico Pino delante del jugador: +0,65 s", cars: { "Nico Pino": { timeGapToPlayer: 0.65 } } },
    { caption: "Se acerca: +0,12 s", cars: { "Nico Pino": { timeGapToPlayer: 0.12 } } },
    { caption: "Cruza hacia detrás: −0,12 s", cars: { "Nico Pino": { timeGapToPlayer: -0.12 } } },
    { caption: "Se aleja detrás: −0,65 s", cars: { "Nico Pino": { timeGapToPlayer: -0.65 } } },
  ],
};

const RELATIVE_FUNCTIONAL_WINDOW_SCENE: AnimationScene = {
  id: "relative-functional-window-cycle",
  widget: "relative",
  label: "Entrada, salida y reentrada",
  watchFor:
    "Mikkel Jensen sale y reentra con la misma identidad mientras la fila del jugador conserva su ID y posición. Revisa entrada y salida por opacidad, alrededor de 120 ms, y confirma que las cifras no pulsan.",
  frameMs: 1200,
  frames: [
    { caption: "Mikkel Jensen aún fuera de la ventana", cars: { "Mikkel Jensen": { absent: true } } },
    { caption: "Entra en la ventana: gap estable de −2,6 s", cars: { "Mikkel Jensen": { timeGapToPlayer: -2.6 } } },
    { caption: "Mikkel Jensen ya asentado; las cifras siguen iguales", cars: { "Mikkel Jensen": { timeGapToPlayer: -2.6 } } },
    { caption: "Sale de la ventana visible", cars: { "Mikkel Jensen": { absent: true } } },
    { caption: "Continúa fuera", cars: { "Mikkel Jensen": { absent: true } } },
    { caption: "Reentra con la misma fila y el mismo gap", cars: { "Mikkel Jensen": { timeGapToPlayer: -2.6 } } },
    { caption: "Reentrada asentada: −2,6 s", cars: { "Mikkel Jensen": { timeGapToPlayer: -2.6 } } },
  ],
};

const RELATIVE_FUNCTIONAL_FAST_REVERSAL_SCENE: AnimationScene = {
  id: "relative-functional-fast-reversal",
  widget: "relative",
  label: "Inversión rápida · 180 ms",
  watchFor:
    "Escena de estrés: el mismo rival cambia de lado cada 180 ms (<300 ms). Comprueba que no se pierde la fila ni el jugador y que el acento tenue solo aparece en cada cruce real.",
  frameMs: 180,
  frames: [
    { caption: "Nico Pino detrás: −0,14 s", cars: { "Nico Pino": { timeGapToPlayer: -0.14 } } },
    { caption: "Cruza delante en 180 ms: +0,14 s", cars: { "Nico Pino": { timeGapToPlayer: 0.14 } } },
    { caption: "Invierte y vuelve detrás en 180 ms: −0,14 s", cars: { "Nico Pino": { timeGapToPlayer: -0.14 } } },
    { caption: "Cruza delante otra vez en 180 ms: +0,14 s", cars: { "Nico Pino": { timeGapToPlayer: 0.14 } } },
  ],
};

const RELATIVE_FUNCTIONAL_STABLE_SCENE: AnimationScene = {
  id: "relative-functional-stable-values",
  widget: "relative",
  label: "Datos cambian, filas quietas",
  watchFor:
    "Las distancias cambian sin cruzar al jugador ni alterar el orden visible. Revisa que los números se actualicen sin mover las filas ni reiniciar transiciones.",
  frameMs: 1200,
  frames: [
    {
      caption: "Muestra 1: Nico Pino −0,30 s; Mikkel Jensen −2,6 s",
      cars: {
        "Nico Pino": { timeGapToPlayer: -0.3 },
        "Mikkel Jensen": { timeGapToPlayer: -2.6 },
      },
    },
    {
      caption: "Muestra 2: Nico Pino −0,27 s; Mikkel Jensen −2,5 s",
      cars: {
        "Nico Pino": { timeGapToPlayer: -0.27 },
        "Mikkel Jensen": { timeGapToPlayer: -2.5 },
      },
    },
    {
      caption: "Muestra 3: Nico Pino −0,24 s; Mikkel Jensen −2,4 s",
      cars: {
        "Nico Pino": { timeGapToPlayer: -0.24 },
        "Mikkel Jensen": { timeGapToPlayer: -2.4 },
      },
    },
  ],
};

const RELATIVE_FUNCTIONAL_SEQUENCE_SCENE: AnimationScene = {
  id: "relative-functional-sequence",
  widget: "relative",
  label: "Secuencia completa",
  watchFor:
    "Usa Reproducir o el deslizador: cruce en ambos sentidos, entrada y salida de Mikkel Jensen y distancias que cambian sin mover filas. En carrera, Antonio Giovinazzi P4 aparece delante con −1 V respecto al jugador.",
  frameMs: 900,
  frames: [
    {
      caption: "Inicio: Nico Pino detrás (−0,45 s); Giovinazzi P4 delante con −1 V; Mikkel Jensen fuera de la ventana",
      cars: {
        "Nico Pino": { timeGapToPlayer: -0.45 },
        "Antonio Giovinazzi": { lapDelta: -1 },
        "Mikkel Jensen": { absent: true },
      },
    },
    {
      caption: "Nico Pino se acerca: −0,12 s",
      cars: {
        "Nico Pino": { timeGapToPlayer: -0.12 },
        "Mikkel Jensen": { absent: true },
      },
    },
    {
      caption: "Primer cruce: Nico Pino queda delante (+0,12 s); Mikkel Jensen entra",
      cars: {
        "Nico Pino": { timeGapToPlayer: 0.12 },
        "Mikkel Jensen": { timeGapToPlayer: -2.6 },
      },
    },
    {
      caption: "Mikkel Jensen asentado en la ventana; Nico Pino mantiene +0,45 s",
      cars: {
        "Nico Pino": { timeGapToPlayer: 0.45 },
        "Mikkel Jensen": { timeGapToPlayer: -2.6 },
      },
    },
    {
      caption: "Mikkel Jensen sale de la ventana; Nico Pino sigue delante",
      cars: {
        "Nico Pino": { timeGapToPlayer: 0.45 },
        "Mikkel Jensen": { absent: true },
      },
    },
    {
      caption: "Mikkel Jensen reentra con el mismo gap: −2,6 s",
      cars: {
        "Nico Pino": { timeGapToPlayer: 0.45 },
        "Mikkel Jensen": { timeGapToPlayer: -2.6 },
      },
    },
    {
      caption: "Nico Pino se acerca desde delante: +0,12 s",
      cars: {
        "Nico Pino": { timeGapToPlayer: 0.12 },
        "Mikkel Jensen": { timeGapToPlayer: -2.6 },
      },
    },
    {
      caption: "Segundo cruce: Nico Pino vuelve detrás (−0,12 s)",
      cars: {
        "Nico Pino": { timeGapToPlayer: -0.12 },
        "Mikkel Jensen": { timeGapToPlayer: -2.6 },
      },
    },
    {
      caption: "Cierre estable: Nico Pino −0,45 s; Mikkel Jensen −2,6 s",
      cars: {
        "Nico Pino": { timeGapToPlayer: -0.45 },
        "Mikkel Jensen": { timeGapToPlayer: -2.6 },
      },
    },
  ],
};

const RELATIVE_FUNCTIONAL_LAP_DIFFERENCE_SCENE: AnimationScene = {
  id: "relative-functional-lap-difference",
  widget: "relative",
  label: "Diferencia de vueltas",
  watchFor:
    "Escena solo de carrera. Compara la vuelta del rival con la tuya: el signo marca más o menos vueltas, no la posición física ni la clasificación. El jugador conserva su fila; cero y datos ausentes no llevan etiqueta.",
  frameMs: 1400,
  frames: [
    {
      caption: "Carrera: Antonio Giovinazzi P4 delante, −1 V; Kévin Estre en la misma vuelta; Ben Hanley +1 V; Mikkel Jensen +2 V; Nico Pino −2 V",
      cars: {
        "Antonio Giovinazzi": { lapDelta: -1 },
        "Kévin Estre": { lapDelta: 0 },
        "Ben Hanley": { lapDelta: 1 },
        "Mikkel Jensen": { lapDelta: 2 },
        "Nico Pino": { lapDelta: -2 },
        "Maro Engel": { lapDeltaQuality: "missing" },
      },
    },
    {
      caption: "Diferencias de dos vueltas a ambos lados; Estre sigue en la misma vuelta",
      cars: {
        "Antonio Giovinazzi": { lapDelta: -2 },
        "Kévin Estre": { lapDelta: 0 },
        "Ben Hanley": { lapDelta: 2 },
        "Mikkel Jensen": { lapDelta: 1 },
        "Nico Pino": { lapDelta: -1 },
        "Maro Engel": { lapDeltaQuality: "missing" },
      },
    },
  ],
};

/**
 * The delta reads the player, not the field, so its scenes drive the player's
 * own delta and best lap rather than anyone's position.
 */
const DELTA_CROSS_SCENE: AnimationScene = {
  id: "delta-cross-zero",
  widget: "delta",
  label: "Cruce del cero",
  watchFor:
    "El ancla del centro late en el sentido tomado —verde al pasar a ganar, rojo al pasar a perder— y el relleno crece hacia el lado nuevo.",
  frameMs: 1300,
  frames: [
    { caption: "Perdiendo 0,45 s", player: { deltaSeconds: 0.45 } },
    { caption: "Perdiendo 0,12 s", player: { deltaSeconds: 0.12 } },
    { caption: "Cruza a ganar: el ancla late en verde", player: { deltaSeconds: -0.28 } },
    { caption: "Ganando 0,7 s", player: { deltaSeconds: -0.7 } },
    { caption: "Vuelve a perder: el ancla late en rojo", player: { deltaSeconds: 0.3 } },
  ],
};

const DELTA_NEW_BEST_SCENE: AnimationScene = {
  id: "delta-new-best",
  widget: "delta",
  label: "Nueva vuelta de referencia",
  watchFor:
    "La nueva mejor vuelta dispara un aviso personal a la izquierda y mantiene la última vuelta a la derecha.",
  frameMs: 1500,
  frames: [
    { caption: "Referencia personal 1:38.031", player: { bestLapSeconds: 98.031 } },
    { caption: "Nueva vuelta personal: aparece el aviso a la izquierda", player: { bestLapSeconds: 97.402 } },
    { caption: "El aviso permanece hasta retirarse", player: { bestLapSeconds: 97.402 } },
  ],
};

/**
 * Pedals has no discrete events: the widget states three values and the two
 * marks it can derive from a single frame. These scenes exercise a lap's worth
 * of inputs so the rails, the engaged labels and the saturation halo can be
 * judged in motion rather than from a still.
 */
const PEDALS_LAP_SCENE: AnimationScene = {
  id: "pedals-lap",
  widget: "pedals",
  label: "Frenada y aceleración",
  watchFor:
    "Los carriles siguen a cada pedal, la etiqueta pasa de gris a blanco al dejar el reposo, y el carril se ilumina al llegar al 100%.",
  frameMs: 700,
  frames: [
    { caption: "Recta: gas a fondo", player: { throttle: 1, brake: 0, clutch: 0 } },
    { caption: "Levanta", player: { throttle: 0.35, brake: 0, clutch: 0 } },
    { caption: "Frenada fuerte", player: { throttle: 0, brake: 1, clutch: 0 } },
    { caption: "Suelta el freno progresivamente", player: { throttle: 0, brake: 0.55, clutch: 0 } },
    { caption: "Trail braking: solapan freno y gas", player: { throttle: 0.3, brake: 0.2, clutch: 0 } },
    { caption: "Sale acelerando", player: { throttle: 0.85, brake: 0, clutch: 0 } },
    { caption: "Otra vez a fondo", player: { throttle: 1, brake: 0, clutch: 0 } },
  ],
};

const PEDALS_CLUTCH_SCENE: AnimationScene = {
  id: "pedals-clutch",
  widget: "pedals",
  label: "Salida con embrague",
  watchFor: "El carril del embrague se llena y se suelta; los tres carriles pueden estar activos a la vez sin pisarse.",
  frameMs: 800,
  frames: [
    { caption: "Parado: embrague a fondo", player: { throttle: 0, brake: 1, clutch: 1 } },
    { caption: "Gas y embrague", player: { throttle: 0.6, brake: 0, clutch: 1 } },
    { caption: "Suelta embrague", player: { throttle: 0.8, brake: 0, clutch: 0.4 } },
    { caption: "Embragado del todo", player: { throttle: 1, brake: 0, clutch: 0 } },
  ],
};

export const ANIMATION_SCENES: readonly AnimationScene[] = [
  OVERTAKE_SCENE,
  BATTLE_SCENE,
  CLASS_BATTLE_SCENE,
  FASTEST_LAP_SCENE,
  TIRE_CHANGE_SCENE,
  DELTA_CHIP_SCENE,
  CAR_ENTERS_SCENE,
  RETIREMENT_SCENE,
  FINAL_MINUTES_SCENE,
  FULL_SEQUENCE_SCENE,
  RELATIVE_CROSS_SCENE,
  RELATIVE_ENTER_SCENE,
  RELATIVE_FUNCTIONAL_CROSS_AHEAD_SCENE,
  RELATIVE_FUNCTIONAL_CROSS_BEHIND_SCENE,
  RELATIVE_FUNCTIONAL_WINDOW_SCENE,
  RELATIVE_FUNCTIONAL_FAST_REVERSAL_SCENE,
  RELATIVE_FUNCTIONAL_STABLE_SCENE,
  RELATIVE_FUNCTIONAL_SEQUENCE_SCENE,
  RELATIVE_FUNCTIONAL_LAP_DIFFERENCE_SCENE,
  DELTA_CROSS_SCENE,
  DELTA_NEW_BEST_SCENE,
  PEDALS_LAP_SCENE,
  PEDALS_CLUTCH_SCENE,
];

export const ANIMATION_SCENE_IDS: readonly string[] = ANIMATION_SCENES.map((scene) => scene.id);

export function isAnimationSceneId(value: unknown): value is string {
  return typeof value === "string" && ANIMATION_SCENE_IDS.includes(value);
}

export function getAnimationScene(id: string): AnimationScene | undefined {
  return ANIMATION_SCENES.find((scene) => scene.id === id);
}

export function listAnimationScenes(widget: WidgetType, system?: string): readonly AnimationScene[] {
  return ANIMATION_SCENES.filter((scene) => scene.widget === widget && (system !== "vantare-functional" || (scene.id !== "relative-cross" && scene.id !== "relative-enter")));
}

/** Wraps so the transport can loop and step backwards past zero. */
export function sceneFrameAt(scene: AnimationScene, frame: number): SceneFrame {
  const count = scene.frames.length;
  return scene.frames[((frame % count) + count) % count];
}

/** Unused constant kept meaningful: the session-best baseline the scenes assume. */
export const SCENE_BASELINE_BEST_LAP = ALLEN_BEST;
