import { recordingGroup, recordingZone } from "../app/analysis-dates";
export const analysisText = {
  title: "Análisis",
  recordings: "Grabaciones",
  laps: "Vueltas",
  openFirst: "Abre una grabación para ver sus vueltas",
  today: "Hoy",
  yesterday: "Ayer",
  week: "Esta semana",
  older: "Antes",
  open: "Abrir",
  map: "Mapa · Próximamente",
  intro: "Tus sesiones grabadas en este PC. Abre una para ver sus vueltas.",
  track: "Circuito sin identificar",
  car: "Coche sin identificar",
  dash: "—",
  search: "Buscar circuito o coche…",
  clear: "Borrar búsqueda",
  noResults: "Ninguna grabación coincide con la búsqueda",
  date: "Fecha",
  vehicle: "Circuito y coche",
  best: "Mejor vuelta",
  size: "Tamaño",
  state: "Estado",
  complete: "Completa",
  unconfirmed: "Cierre sin confirmar",
  locked: "Abierta por otro programa",
  incompatible: "De otra versión",
  unreadable: "No se puede leer",
  recording: "Grabando ahora",
  automatic: "Grabación automática",
  enabled: "Activada",
  disabled: "Desactivada",
  local: "Todo se guarda solo en tu PC.",
  idle: "Se graba sola cuando sales a pista con Le Mans Ultimate.",
  empty: "Todavía no hay grabaciones",
  emptyHelp:
    "Vantare graba tus vueltas solo cuando sales a pista con Le Mans Ultimate. Cuando termines la sesión, la verás aquí.",
  how: "Cómo funciona",
  steps: "Sales a pista → se graba sola → al terminar la abres aquí.",
  loading: "Buscando grabaciones…",
  retry: "Volver a intentar",
  back: "Volver a la lista",
  off: "La grabación automática está apagada",
  offHelp:
    "Actívala en Ajustes para que Vantare guarde tus vueltas al salir a pista. Todo se guarda solo en tu PC.",
  offExisting:
    "No se guardan sesiones nuevas. Tus grabaciones anteriores siguen aquí.",
  settings: "Activar en Ajustes",
  denied: "Análisis no está incluido en tu acceso",
  deniedHelp:
    "Tus grabaciones siguen guardadas en este PC: no se pierde nada. La grabación sigue funcionando según el interruptor de Ajustes.",
  account: "Ver mi cuenta",
  signIn: "Inicia sesión para usar Análisis",
  signInHelp:
    "Análisis necesita tu cuenta de Vantare verificada. Tus grabaciones siguen guardadas en este PC.",
  catalogTitle: "No se puede leer la carpeta de grabaciones",
  catalogHelp: "Vuelve a intentarlo.",
};
export function lapTime(ms: number | null | undefined) {
  if (ms == null) return analysisText.dash;
  const tenths = Math.round(ms / 100);
  return `≈${Math.floor(tenths / 600)}:${(Math.floor(tenths / 10) % 60).toString().padStart(2, "0")}.${tenths % 10}`;
}
export const decimal = (n: number) =>
  n.toLocaleString("es-ES", { maximumFractionDigits: 1 });
export const size = (bytes: number) => `${decimal(bytes / 1_000_000)} MB`;
export const date = (ms: number, timeZone = recordingZone()) =>
  new Date(ms).toLocaleString("es-ES", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  });
export function recordingDate(
  ms: number,
  nowMs: number,
  timeZone = recordingZone(),
) {
  const value = new Date(ms);
  const group = recordingGroup(ms, nowMs, timeZone);
  const year = new Intl.DateTimeFormat("es-ES", { timeZone, year: "numeric" });
  const otherYear = year.format(ms) !== year.format(nowMs);
  const time = value.toLocaleTimeString("es-ES", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  if (!otherYear && (group === "today" || group === "yesterday")) return time;
  const prefix = value
    .toLocaleDateString("es-ES", {
      timeZone,
      weekday: group === "week" && !otherYear ? "short" : undefined,
      day: "numeric",
      month: group === "week" && !otherYear ? undefined : "short",
      year: otherYear ? "numeric" : undefined,
    })
    .replaceAll(".", "");
  return `${prefix}, ${time}`;
}
