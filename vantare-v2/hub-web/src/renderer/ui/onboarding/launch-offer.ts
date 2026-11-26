// Instante en que acaba el precio de lanzamiento. Es el mismo con el que deja de
// aplicarlo el cobro (`launch_windows.production.ends_at` en
// supabase/functions/scripts/polar-launch-prices.json): un test comprueba que
// coinciden. De aquí salen el banner, «PRIMER MES» y los precios rebajados.
export const launchEndsAt = "2026-11-26T18:00:00Z";

const shortDate = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  day: "numeric",
  month: "short",
});

/** Día que anuncia el banner («26 NOV»), o null si la oferta ya ha acabado. */
export function launchBannerDay(now: Date, endsAt: string) {
  const end = new Date(endsAt);
  if (now >= end) return null;
  // El día del último instante válido: un final a medianoche no anuncia el siguiente.
  return shortDate.format(end.getTime() - 1).toUpperCase();
}
