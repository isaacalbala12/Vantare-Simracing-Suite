export const calendarEventsText = {
  empty: "Esta semana no hay eventos",
  emptyHelp:
    "Las series semanales y especiales aparecerán aquí cuando LMU las publique.",
  favorite: "Favorita",
  inFavorites: "En favoritas",
  next: "Siguiente:",
  nextTag: "siguiente",
  finished: "Terminado esta semana",
  today: "HOY",
  tomorrow: "MAÑANA",
  gone: (count: number) => `${count} ya salieron`,
  format: "Formato",
  team: "Equipos",
  individual: "Individual",
  race: "Carrera",
  safety: "Seguridad",
  splits: "Divisiones",
  upTo: (n: number) => `hasta ${n}`,
  choose: "Elige tanda",
  weekSlots: "Tandas de la semana",
  hint: (zone: string) => `Pulsa una hora para avisarte · ${zone}`,
  udpRequired: "Este evento pide +tracerudp=3 en las opciones de lanzamiento.",
  export: "Añadir tandas a mi calendario",
  detail: "Ficha",
  launch: (profile: string) => `Lanzar «${profile}»`,
  inMinutes: (minutes: number) =>
    minutes < 60
      ? `en ${minutes} min`
      : minutes < 1440
        ? `en ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`
        : `en ${Math.floor(minutes / 1440)} d ${Math.floor(minutes / 60) % 24} h`,
  separator: " · ",
  arrow: " → ",
  wecMark: "WEC",
  specialMark: "10H",
};
