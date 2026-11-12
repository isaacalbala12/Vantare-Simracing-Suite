export const calendarAlertsText = {
  reading: "Leyendo tus avisos…",
  protected: "Tus avisos están protegidos; no se ha modificado nada.",
  unavailable: "Tus avisos no se han podido leer; no se ha modificado nada.",
  saving: "Guardando avisos; espera a que termine para cambiar otro control.",
  conflict: "Se ha actualizado desde otro sitio; revisa y repite el cambio.",
  duplicates:
    "Quita primero los avisos antiguos o duplicados antes de cambiar antelación o canales.",
  bandsLimit: (n: number) =>
    `Puedes guardar hasta ${n} franjas. Quita una antes de añadir otra.`,
  slotsLimit: (n: number) =>
    `Puedes guardar hasta ${n} tandas. Quita una antes de añadir otra.`,
  defaultProfile: "Perfil",
  title: "Avisos",
  subtitle: "Configura los avisos en pista antes de tu carrera.",
  close: "Cerrar (Esc)",
  lead: "Con cuánta antelación",
  leadScope:
    "Esta antelación se añade al recordatorio del calendario (.ics). El aviso en pista usa los umbrales configurados en el overlay.",
  where: "Dónde te llega",
  when: "Al avisar",
  what: "Qué se avisa",
  sample: "Ejemplo de notificación futura",
  yours: "Tus avisos",
  windows: "Notificación de Windows",
  windowsHint:
    "Preferencia conservada, de solo lectura: este Hub aún no emite notificaciones de Windows del Calendario.",
  track: "En pista, si ya estás conduciendo",
  trackHint: "Un aviso discreto en tus overlays, sin sonido.",
  sound: "Sonido",
  soundHint:
    "Preferencia conservada, de solo lectura: este Hub aún no emite sonido para los avisos del Calendario.",
  deliveryPending:
    "Los avisos en pista funcionan. La notificación de Windows y el sonido aún no están disponibles en este Hub; tus preferencias guardadas se conservan.",
  previewPending:
    "Esta muestra es ilustrativa: aún no se envía una notificación de Windows ni funcionan sus botones.",
  autoLegacyHint:
    "El lanzamiento automático no está disponible aquí; puedes desactivarlo.",
  autoHint:
    "Los avisos se guardan; el lanzamiento automático aún no está disponible.",
  daily: "Series diarias:",
  dailyHelp:
    "por franja horaria («de 20:00 a 23:00»), desde su ficha o su página.",
  events: "Eventos semanales y especiales:",
  eventsHelp: "tanda a tanda.",
  save: "Guardar",
  test: "Probar aviso",
  testPending: "La prueba de notificación aún no está disponible.",
  edit: "Editar",
  endEdit: "Cerrar",
  removeBand: "Quitar franja",
  removeSlot: "Quitar aviso",
  missing: (id: string) => `${id} (ya no está)`,
  count: (bands: number, slots: number) =>
    `${bands} franja${bands === 1 ? "" : "s"} · ${slots} tanda${slots === 1 ? "" : "s"}`,
  band: (from: string, to: string, days: string, mode: string) =>
    `Franja ${from}–${to} · ${days} · ${mode}`,
  fromLess: "Empieza −30",
  fromMore: "+30",
  toLess: "Termina −30",
  toMore: "+30",
  starts: "Inicio de la franja",
  ends: "Fin de la franja",
  add: "Añadir franja 20:00–23:00",
  empty:
    "Aún no tienes avisos. Marca una serie diaria como favorita para añadir su franja, o pulsa la campana de una tanda.",
  slot: (day: string, time: string, notice: string) =>
    `${day} ${time} · aviso a las ${notice}`,
  minute: (n: number) => `${n} min`,
  auto: (profile: string) => `Lanzar «${profile}» automáticamente`,
  previewApp: "Vantare · Calendario",
  now: "ahora",
  previewTitle: (name: string, time: string) => `${name} sale a las ${time}`,
  previewBand: (from: string, to: string) => ` · tu franja ${from}–${to}`,
  previewBody: (
    track: string,
    race: number,
    band: string,
    next: string | undefined,
  ) =>
    `${track} · carrera ${race} min${band}. ${next ? `Si no llegas, la siguiente sale a las ${next}.` : "Si no llegas, la siguiente sale unos minutos después."}`,
  launch: "Lanzar perfil",
  detail: "Ver ficha",
  snooze: "Posponer 5′",
  legacy:
    "Hay avisos antiguos que debes revisar antes de guardarlos. Puedes quitar los avisos que ya no necesites.",
  invalidSlot: "Fecha no válida · puedes quitar este aviso.",
  previewLabel: "Ejemplo ilustrativo de futura notificación de Windows",
};
