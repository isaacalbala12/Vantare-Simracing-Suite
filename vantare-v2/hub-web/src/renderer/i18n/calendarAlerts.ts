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
  subtitle: "Configura los avisos del Calendario antes de tu carrera.",
  close: "Cerrar (Esc)",
  lead: "Con cuánta antelación",
  leadScope:
    "Esta antelación gobierna la notificación de Windows y el recordatorio del calendario (.ics); no cambia los umbrales del aviso en pista del overlay.",
  where: "Dónde te llega",
  when: "Al avisar",
  what: "Qué se avisa",
  sample: "Así te llegará",
  yours: "Tus avisos",
  windows: "Notificación de Windows",
  windowsHint: "Un aviso de Windows mientras el Hub esté abierto.",
  track: "En pista, si ya estás conduciendo",
  trackHint: "Un aviso discreto en tus overlays, sin sonido.",
  sound: "Sonido",
  soundHint:
    "Sonido para los avisos de Windows fuera de pista, si el sistema lo permite.",
  deliveryScope:
    "Con el Hub abierto, recibes avisos según tus canales. En pista, las franjas se callan y las tandas explícitas pueden avisar en silencio.",
  previewScope:
    "Windows muestra el texto del aviso; los botones de esta muestra no están disponibles.",
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
  testHint:
    "Solicita un ejemplo fijo a Windows con el Hub abierto. Requiere derechos vigentes y avisos legibles; el sistema puede ocultarlo o silenciarlo.",
  testSending: "Solicitando el aviso de prueba…",
  testAccepted:
    "Prueba solicitada a Windows. Su configuración decide si se muestra o suena.",
  testUnavailable:
    "La prueba no está disponible o el sistema no ha aceptado la solicitud.",
  testBusy: "Espera cinco segundos antes de volver a probar el aviso.",
  testFailure:
    "No se pudo solicitar la prueba. Comprueba la conexión, tus derechos y el documento de avisos.",
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
  previewLabel: "Ejemplo de notificación de Windows",
};
