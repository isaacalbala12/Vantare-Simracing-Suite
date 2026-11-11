export const calendarIcsText = {
  title: "Añadir a mi calendario",
  subtitle:
    "Tus carreras en Google Calendar, Apple Calendar u Outlook, con la hora de tu zona.",
  close: "Cerrar (Esc)",
  what: "Qué añadir",
  how: "Cómo",
  scopes: [
    {
      id: "favs",
      label: "Mis favoritas",
      hint: "Semanales y especiales: cada tanda. Diarias: solo las salidas con aviso (las de cada 15 min llenarían tu calendario).",
    },
    {
      id: "events",
      label: "Solo eventos semanales y especiales",
      hint: "Todas las tandas de los eventos de la semana.",
    },
    {
      id: "all",
      label: "Todas las series",
      hint: "Eventos con todas sus tandas y las diarias que caen en tus avisos.",
    },
  ] as const,
  alarm: "Incluir recordatorio del calendario",
  alarmHint: (lead: number) =>
    `${lead} min antes, además del aviso de Vantare.`,
  subscription: "Suscripción · próximamente",
  subscriptionHint:
    "Se actualizaría sola cada semana; necesita servidor y cuenta.",
  file: "Descargar archivo .ics",
  fileHint: "Una sola vez; no se actualiza.",
  preview: (n: number) =>
    `Vista previa · ${n} evento${n === 1 ? "" : "s"} esta semana`,
  day: (label: string) => `${label} · `,
  destination: "Elige dónde guardar el archivo .ics.",
  cancel: "Cancelar",
  download: "Descargar .ics",
  preparing: "Preparando calendario…",
  retry: "Reintentar",
  cancelled: "Descarga cancelada.",
  conflict:
    "Ya existe un archivo con ese nombre. Elige otro nombre al descargar.",
  error: (kind: string) =>
    kind === "calendarExportTooLarge"
      ? "El calendario supera el tamaño permitido. Prueba con tus favoritas o solo con eventos."
      : kind === "calendarScheduleUnavailable"
        ? "Descarga un horario vigente antes de exportar."
        : kind === "protected"
          ? "No se pudieron leer tus preferencias de calendario. Los originales se conservan."
          : kind === "denied"
            ? "No tienes acceso al Calendario."
            : kind === "busy"
              ? "Hay otra operación en curso. Inténtalo de nuevo."
              : "No se pudo preparar o guardar el calendario. Puedes reintentarlo.",
};
