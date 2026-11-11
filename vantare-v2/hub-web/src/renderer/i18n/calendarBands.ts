export const calendarBandText = {
  enabled: (from: string, to: string) =>
    `Te avisamos de las salidas de ${from}–${to}`,
  disabled: "Avisarme por franja horaria",
  disabledHelp: "Elige de qué hora a qué hora quieres que te avisemos.",
  toggle: "Avisar por franja horaria",
  hint: (days: string, count: number) =>
    `${days} · ${count} salidas por día · se calla si ya estás en pista`,
  from: "Entre",
  to: "y",
  notify: "Avisar",
  before: "Antes",
  start: "Inicio de la franja",
  end: "Fin de la franja",
  lead: (minutes: number) => `${minutes} min antes`,
  days: { all: "Todos", weekdays: "Lun–vie", weekend: "Finde" },
  daysLong: {
    all: "Todos los días",
    weekdays: "Lunes a viernes",
    weekend: "Fin de semana",
  },
  modes: { each: "Cada salida", first: "Solo la primera" },
};
