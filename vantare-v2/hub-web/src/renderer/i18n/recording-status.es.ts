import { analysisText as a, decimal, size } from "./analysis.es";

export const gigabytes = (bytes: number) => decimal(bytes / 1_000_000_000);
export const recordingStatusText = {
  idle: a.enabled,
  recording: a.recording,
  degraded: "Grabando con pérdidas",
  stopped: "Detenida por un error",
  limit: "Grabando · al límite de espacio",
  disabled: a.disabled,
  pendingOff: "Se apagará al reiniciar",
  pendingOn: a.pendingOn,
  unavailable: "Estado de grabación no disponible",
  idleHelp: a.idle,
  recordingHelp: "Podrás abrirla cuando termines la sesión.",
  started: (time: string) => `Empezó a las ${time}.`,
  degradedHelp: "La grabación sigue activa y puede faltar información.",
  pruneIncompleteHelp:
    "No se pudieron borrar todas las grabaciones antiguas. La grabación sigue activa.",
  stoppedHelp:
    "La grabación se ha detenido. Se volverá a intentar la próxima vez que arranque Vantare.",
  limitHelp:
    "Para seguir grabando, Vantare borra las grabaciones más antiguas.",
  disabledHelp:
    "No se guardan vueltas nuevas. Tus grabaciones anteriores siguen aquí.",
  pendingOffHelp:
    "Has apagado la grabación. Se aplica la próxima vez que arranque Vantare; hasta entonces se sigue grabando.",
  pendingOnHelp: a.restart,
  unavailableHelp: "Las grabaciones guardadas siguen disponibles.",
  space: "Espacio",
  count: (count: number, max: number) => `${count} de ${max}`,
  bytes: (bytes: number, max: number) =>
    `${gigabytes(bytes)} de ${gigabytes(max)} GB`,
  usage: (count: number, max: number, bytes: number) =>
    `${count} de ${max} · ${gigabytes(bytes)} GB`,
  quota: (count: number, bytes: number) =>
    `Al llegar a ${count} grabaciones o ${gigabytes(bytes)} GB, se borran solas las más antiguas.`,
  catalogUsage: (count: number, bytes: number) =>
    `${count === 1 ? "1 grabación" : `${count} grabaciones`} · ${gigabytes(bytes)} GB`,
  prune: "Borradas automáticamente",
  pruneTitle: (count: number) =>
    count === 1
      ? "Se ha borrado una grabación antigua para dejar sitio"
      : `Se han borrado ${count} grabaciones antiguas para dejar sitio`,
  pruneSummary: (when: string, bytes: number) =>
    `${when} · ${size(bytes)} liberados.`,
  pruneList: (when: string, count: number) =>
    `${when} · ${count === 1 ? "1 grabación" : `${count} grabaciones`} para dejar sitio`,
  seePrune: "Ver cuáles",
  acknowledge: "Entendido",
  notification: "Análisis · espacio",
  notice: (count: number) =>
    count === 1
      ? "Se borró una grabación antigua para seguir grabando."
      : `Se borraron ${count} grabaciones antiguas para seguir grabando.`,
};
