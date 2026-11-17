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
  unavailable:
    "Esta vuelta no está sellada o no tiene tiempo ni huecos comparables",
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
