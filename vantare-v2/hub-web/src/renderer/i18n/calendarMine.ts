export const calendarMineText = {
  races: (n: number) => `${n} carrera${n === 1 ? "" : "s"}`,
  best: (lap: string, circuit: string) => `mejor: ${lap} en ${circuit}`,
  alreadyRan: "Ya corriste esta semana",
  yesterday: "ayer",
  fromTelemetry: (circuit: string) => `${circuit} · desde tu telemetría`,
  openSession: "Abrir sesión",
  favoriteWithoutAlert: "Favorita · sin aviso",
  every: (minutes: number) => `sale cada ${minutes} min`,
  bandDepartures: (n: number, minutes: number, first: string, last: string) =>
    `${n} salidas, cada ${minutes} min · ${first} → ${last}`,
  runSummary: (position: number, safety: number, lap: string | null) =>
    `P${position} · ${safety < 0 ? "−" : "+"}${Math.floor(Math.abs(safety) / 10)},${Math.abs(safety) % 10} SR${lap ? ` · ${lap}` : ""}`,
  separator: " · ",
  emptyTitle: "Aquí aparecerán tus carreras",
  emptyHelp:
    "Marca series con ★ y pon avisos: verás tu semana en una sola lista, ordenada por hora, con lo que ya corriste.",
  seeSeries: "Ver series",
  seeUpcoming: "Ver Próximas",
  yourNext: "Tu próxima",
  nonePending: "nada pendiente",
  activeBands: "Franjas activas",
  ran: "Corriste",
  none: "Ninguna",
  noRecordings: "sin sesiones grabadas",
  calendar: "En tu calendario",
  download: "descarga tus favoritas cuando quieras",
  week: "Tu semana",
  subtitle: "favoritas, franjas y tandas con aviso",
  all: "Todo",
  alerted: "Con aviso",
  export: "Exportar",
  today: "Hoy",
  tomorrow: "Mañana",
  favorite: "Favorita",
  band: "Franja",
  each: "cada salida",
  noDepartures: "No hay salidas de tus series lo que queda de semana.",
  entries: (n: number) => `· ${n} entrada${n === 1 ? "" : "s"}`,
  inMinutes: (n: number) =>
    n < 60
      ? `en ${n} min`
      : n < 1440
        ? `en ${Math.floor(n / 60)} h ${String(n % 60).padStart(2, "0")} min`
        : `en ${Math.floor(n / 1440)} d ${Math.floor((n % 1440) / 60)} h`,
  bandLabel: (from: string, to: string) => `Franja ${from}–${to}`,
  departures: (count: number) => `${count} salidas`,
  launch: "Lanzar",
  detail: "Ficha",
  alert: "Configurar aviso",
  minutes: (n: number) => `${n} min`,
  race: (duration: string) => `carrera ${duration}`,
};
