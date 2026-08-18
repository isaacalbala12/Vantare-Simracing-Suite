/* Tipos de datos de los componentes de visualización.
   `12-contratos-componentes.md` los nombra (`WidgetDoc`, `TyreView`, `DriverView`,
   `AvailRange`) y remite a `13-modelo-y-algoritmos.md`, donde solo `WidgetDoc`
   está escrito. Los otros tres se fijan aquí con la forma mínima que el CSS del
   prototipo necesita para pintar (ver `00-decisiones.md`, D-24). */

/** `13 · WidgetDoc`. `x/y/w/h` en el lienzo lógico de 1920×1080. */
export interface WidgetDoc {
  id: string;
  name: string;
  system: string;
  design: string;
  state: "activo" | "oculto";
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: boolean;
}

export type TyreCompound = "soft" | "medium" | "hard";

/** Neumático del inventario de Estrategia (`04 · .tyre-item`, `.corner-slot`). */
export interface TyreView {
  id: string;
  compound: TyreCompound;
  /** Detalle secundario de la fila ("Juego 3 · seco"). */
  label?: string;
  /** Condición en porcentaje, ya calculada por el dominio. */
  condition: number;
}

/** Piloto del tablero de disponibilidad (`04 · .avail-*`). */
export interface DriverView {
  id: string;
  name: string;
  /** Color del piloto, ya resuelto por el dominio. */
  color: string;
}

export type AvailState = "ok" | "maybe" | "no";

/** Tramo de disponibilidad en horas decimales (13.5 = 13:30). */
export interface AvailRange {
  from: number;
  to: number;
  state: AvailState;
}

/** `13:30` a partir de horas decimales. */
export function formatHour(hour: number): string {
  const total = Math.round(hour * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Lienzo lógico del sistema V3 en el que se sitúan los `WidgetDoc`. */
export const MINI_STAGE_WIDTH = 1920;
export const MINI_STAGE_HEIGHT = 1080;

/** `04`: la condición del neumático pasa a ámbar por encima de dos usos. */
export const TYRE_WARN_USES = 2;

/** `13`: `frac = clamp(restante / ventana)`; el arco usa `pathLength 100`. */
export function dialFraction(target: Date, intervalMin: number, now: Date): number {
  const window = (intervalMin || 180) * 60_000;
  if (window <= 0) return 0;
  const remaining = target.getTime() - now.getTime();
  return Math.min(1, Math.max(0, remaining / window));
}

/** `mm:ss`, o `h m` cuando queda una hora o más (`13`). */
export function formatCountdown(target: Date, now: Date): string {
  const remaining = Math.max(0, target.getTime() - now.getTime());
  const totalSeconds = Math.floor(remaining / 1000);
  if (totalSeconds >= 3600) {
    return `${Math.floor(totalSeconds / 3600)} h ${Math.floor((totalSeconds % 3600) / 60)} m`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** `04`: los tramos del mapa se colorean por delta (pierde / gana / neutro). */
export function segmentTone(delta: number): "loss" | "gain" | "flat" {
  if (delta > 0.04) return "loss";
  if (delta < -0.02) return "gain";
  return "flat";
}
