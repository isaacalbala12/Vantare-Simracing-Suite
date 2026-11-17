import { decimal, deltaTime, lapTime, analysisText as t } from "./analysis.es";
export const comparisonText = {
  tab: "Comparar",
  title: "Comparar vueltas",
  compare: "Comparar A y B",
  selectFirst: "Elige A y B en Vueltas para compararlas",
  choices: "Comparar",
  a: "A",
  b: "B",
  swap: "Intercambiar A y B",
  swapSymbol: "⇅",
  select: (side: string, lap: number) => `Seleccionar ${side}: vuelta ${lap}`,
  unavailable: "Esta vuelta está incompleta o sin cerrar",
  quick: "Mi mejor contra la segunda mejor",
  quickInfo:
    "A es la vuelta que quieres mejorar; B, la referencia. Lo normal es poner tu mejor vuelta como B.",
  selectionHelp:
    "Marca A (la que analizas) y B (la referencia) y pulsa Comparar",
  quickHelp:
    "Necesitas dos vueltas completas con tiempo para usar esta comparación",
  back: "Volver a Vueltas",
  reopen: "Reabrir y comparar",
  incomparable: "Estas vueltas no se pueden comparar",
  incomparableHelp: "Elige otras dos vueltas de esta grabación",
  cancelled: "La comparación se ha cancelado",
  cancelledHelp: "Reabre la grabación para volver a comparar estas vueltas",
  timeout: "La comparación ha tardado demasiado",
  timeoutHelp: "Reabre la grabación para volver a intentarlo",
  loading: "Comparando vueltas…",
  updating: "Actualizando la comparación…",
  distance: "Distancia",
  time: "Tiempo",
  axis: "Eje de las gráficas",
  speed: "Velocidad",
  throttle: "Acelerador",
  brake: "Freno",
  delta: "Diferencia A−B",
  positive: "s · + A pierde",
  noData: "sin datos",
  noDelta: "Diferencia no disponible",
  gapInA:
    "La vuelta A tiene huecos sin datos. Puedes ver sus trazas, pero no cuánto tiempo pierde.",
  gapInB:
    "La vuelta B tiene huecos sin datos. Puedes ver sus trazas, pero no cuánto tiempo pierde.",
  noCommonRange:
    "Estas vueltas no tienen un tramo común con tiempo. Puedes ver sus trazas.",
  common: "Tramo común",
  honesty: "En los tramos sin datos la línea se corta: no se inventa nada.",
  direction: "Por encima de 0, A pierde tiempo frente a B; por debajo, gana.",
  table: "Ver valores en tabla (cada 1 000 m)",
  tableHelp:
    "Valores de la vuelta entera cada 1 000 m. — significa sin datos; no se extrapola ni se unen segmentos distintos.",
  cursor: "Explorar todos los valores de A y B",
  cursorHelp: "Usa las flechas izquierda y derecha para recorrer las trazas.",
  changes: "Dónde cambia más",
  whole: "Ver vuelta entera",
  changesHelp:
    "Tramos de 250 m con más diferencia. Pulsa uno para centrar las trazas. Los nombres de curva llegarán con el mapa.",
  summary: "Resumen",
  difference: "Diferencia",
  slower: "A es más lenta que B.",
  faster: "A es más rápida que B.",
  equal: "A y B tienen el mismo tiempo aproximado.",
  how: "Cómo leerlo",
  legend:
    "Línea continua carmín: A. Línea discontinua gris: B. Las dos se alinean por la distancia recorrida en la vuelta.",
  timeHelp:
    "«Tiempo» pone las trazas sobre el tiempo de cada vuelta; la diferencia se sigue calculando por distancia.",
  line: (side: string, lap?: number) => `${side} · vuelta ${lap ?? t.dash}`,
  lapOption: (
    lap: number,
    ms: number | null,
    gap: boolean,
    delta: number | null,
  ) =>
    `Vuelta ${lap}${gap ? "\nsin tiempo · con huecos" : ` · ${lapTime(ms)}${delta === 0 ? "\ntu mejor vuelta" : delta === null ? "" : `\n${deltaTime(delta)}`}`}`,
};
export const metres = (n: number) =>
  `${n.toLocaleString("es-ES", { maximumFractionDigits: 0, useGrouping: "always" }).replaceAll(".", " ")} m`;
export const axisLabel = (n: number, time: boolean) =>
  time ? `${decimal(n)} s` : n >= 1000 ? `${decimal(n / 1000)} km` : metres(n);
export const seconds = (n: number | null | undefined) =>
  n == null ? t.dash : `${n >= 0 ? "+" : ""}${n.toFixed(3)} s`;
export const compareValue = (n: number | null | undefined, unit: string) =>
  n == null ? t.dash : `${decimal(n)} ${unit}`;
export const distanceInterval = (from: number, to: number) =>
  `${(from / 1000).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} – ${(to / 1000).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
