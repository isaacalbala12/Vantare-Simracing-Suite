import { calendarText as text } from "../i18n/calendar";
export function zoneLabel(at: number, long = false) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const city =
    text.cities[zone as keyof typeof text.cities] ??
    (long ? text.yourTime : text.local);
  const minutes = -new Date(at).getTimezoneOffset(),
    absolute = Math.abs(minutes);
  const offset = `${minutes < 0 ? "-" : "+"}${Math.floor(absolute / 60)}${absolute % 60 ? `:${String(absolute % 60).padStart(2, "0")}` : ""}`;
  return long ? `${city} · UTC${offset}` : `${city} ${offset}`;
}
