export const analysisText = {
  title: "Análisis",
  recordings: "Grabaciones",
  laps: "Vueltas",
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
export const date = (ms: number) =>
  new Date(ms).toLocaleString("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  });
export const day = (ms: number) =>
  new Date(ms).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
