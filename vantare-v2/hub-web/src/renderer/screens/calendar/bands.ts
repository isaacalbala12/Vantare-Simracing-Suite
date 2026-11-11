import type { CalendarBand } from "../../../contract/generated/calendar";
// GPUI Band::covers paints the local hour window; notification eligibility is
// evaluated separately by alertAt (including days and first/each).
export function bandCovers(band: CalendarBand, at: number) {
  const date = new Date(at),
    minute = date.getHours() * 60 + date.getMinutes();
  return minute >= band.from && minute < band.to;
}
export function shiftBand(
  band: CalendarBand,
  end: boolean,
  step: number,
  dayMinutes: number,
): CalendarBand {
  if (end)
    return {
      ...band,
      to:
        band.to >= dayMinutes
          ? band.from + step
          : Math.min(dayMinutes, band.to + step),
    };
  return {
    ...band,
    from: band.from + 2 * step > band.to ? 0 : band.from + step,
  };
}
