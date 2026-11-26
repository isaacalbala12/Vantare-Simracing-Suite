// Último día, en hora peninsular española, del precio de lanzamiento. Para
// alargarlo basta con cambiar esta fecha: el banner y su texto salen de aquí.
export const launchLastDay = "2026-11-26";

const spainDate = new Intl.DateTimeFormat("en", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
// El último día ya es una fecha de calendario: en UTC no cambia al formatearlo.
const shortDate = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

/** Día que anuncia el banner («26 NOV»), o null si el plazo ya ha pasado. */
export function launchBannerDay(now: Date, lastDay: string) {
  const today = Object.fromEntries(
    spainDate.formatToParts(now).map(({ type, value }) => [type, value]),
  );
  if (`${today.year}-${today.month}-${today.day}` > lastDay) return null;
  return shortDate.format(new Date(lastDay)).toUpperCase();
}
