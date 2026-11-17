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
  opening: "Leyendo vueltas…",
  openingHelp:
    "Con grabaciones largas puede tardar unos segundos. Puedes seguir usando el resto de Vantare.",
  cancel: "Cancelar",
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
  recordingTitle: "Esta sesión se está grabando ahora",
  recordingHelp:
    "Podrás abrirla en cuanto salgas de pista o cierres el juego. Mientras tanto, puedes ver las grabaciones anteriores.",
  lockedTitle: "Otro programa tiene abierta esta grabación",
  lockedHelp:
    "Cierra el programa que la está usando (por ejemplo, una copia de seguridad) y vuelve a intentarlo.",
  unreadableTitle: "No se puede leer esta grabación",
  unreadableHelp:
    "El archivo parece dañado, quizá porque el PC se apagó mientras se grababa. No lo borramos: sigue en tu PC por si hace falta revisarlo.",
  incompatibleTitle: "Esta grabación es de otra versión de Vantare",
  incompatibleHelp:
    "Actualiza Vantare para abrirla. No se ha tocado el archivo.",
  updates: "Buscar actualizaciones",
  missingTitle: "Esta grabación ya no está",
  missingHelp: "Se ha borrado o movido (quizá por el borrado automático).",
  timeoutTitle: "El lector no responde",
  timeoutHelp: "Prueba otra vez cuando no estés en pista.",
  catalogTitle: "No se puede leer la carpeta de grabaciones",
  catalogHelp: "Vuelve a intentarlo.",
  changedTitle: "La grabación ha cambiado",
  changedHelp: "Vuelve a la lista y ábrela de nuevo",
  largeTitle: "Esta grabación es demasiado grande para abrirla",
  largeHelp: "Prueba con otra grabación",
  technical: "Detalle técnico de la grabación",
  watermark: "Marca de agua",
  attempted: "Intentadas",
  total: "Total",
  finished: "Cierre confirmado",
  yes: "Sí",
  no: "No",
  samples: "Muestras",
  lap: "Vuelta",
  time: "Tiempo",
  delta: "Δ mejor",
  speed: "Velocidad km/h",
  throttle: "Acelerador %",
  brake: "Freno %",
  data: "Datos",
  incomplete: "Incompleta",
  gap: "Con huecos",
  unsealed: "Sin cerrar",
  reliable: "Fiables",
  estimated: "Estimadas",
  stale: "Obsoletas",
  unavailable: "No disponibles",
  range: "mín. / media / máx.",
  mean: "Media",
  maxSpeed: "Velocidad máx.",
  kmh: "km/h",
  approximate: "Tiempos aproximados, no oficiales.",
  fastest: "mejor",
  speedMax: "Vel. máx.",
  speedMean: "Vel. media",
  throttleColumn: "Acelerador",
  brakeColumn: "Freno",
  circuit: "Circuito",
  carLabel: "Coche",
  thisRecording: "Esta grabación",
  chartTitle: "Diferencia con tu mejor vuelta",
  chartMissing: "sin barra = vuelta sin tiempo",
  estimatedData: "≈ parte estimada",
  lapNumber: (lap: number) => `vuelta ${lap}`,
  meanHelp: (count: number) => `de ${count} vueltas completas`,
  lapCounts: (complete: number, gaps: number, without: number) =>
    `${complete} completas · ${gaps} con huecos · ${without} sin tiempo`,
  chartHelp: (lap: number) =>
    `segundos más lenta que la vuelta ${lap} · sin barra = vuelta sin tiempo`,
  recordingGroup: "Grabación de vueltas",
  record: "Grabar mis vueltas",
  recordHelp:
    "Vantare guarda la velocidad, el acelerador, el freno, la distancia y el tiempo de cada vuelta para que puedas analizarlas en Análisis. Todo se guarda solo en tu PC: no se envía a ningún sitio.",
  when: "Cuándo cambia",
  restart:
    "Encender o apagar la grabación se aplica la próxima vez que arranque Vantare, para no interrumpir una sesión en pista.",
  restartBadge: "Al reiniciar",
  undo: "Deshacer",
  pendingOn: "Se encenderá la próxima vez que arranque Vantare",
  pendingOff: "Se apagará la próxima vez que arranque Vantare",
};
export function lapTime(ms: number | null | undefined) {
  if (ms == null) return analysisText.dash;
  const tenths = Math.round(ms / 100);
  return `≈${Math.floor(tenths / 600)}:${(Math.floor(tenths / 10) % 60).toString().padStart(2, "0")}.${tenths % 10}`;
}
export const decimal = (n: number) =>
  n.toLocaleString("es-ES", { maximumFractionDigits: 1 });
export const size = (bytes: number) => `${decimal(bytes / 1_000_000)} MB`;
export const deltaTime = (ms: number) =>
  `≈${ms >= 0 ? "+" : ""}${(ms / 1000).toFixed(1)}`;
export const percentage = (value: number) => `${decimal(value * 100)} %`;
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
export function recordingDateLabel(ms: number, nowMs: number) {
  const group = recordingGroup(ms, nowMs);
  return group === "today" || group === "yesterday"
    ? `${analysisText[group]}, ${recordingDate(ms, nowMs)}`
    : recordingDate(ms, nowMs);
}
