import type { CalendarNotice } from "../../contract/generated/calendar";

const months = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
function duration(minutes: number) {
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  return hours ? `${hours} h${rest ? ` ${rest} min` : ""}` : `${rest} min`;
}
function week(from: number) {
  const first = new Date(from),
    last = new Date(from + 6 * 86400000);
  const a = first.getUTCDate(),
    b = last.getUTCDate();
  return first.getUTCMonth() === last.getUTCMonth()
    ? `${a}–${b} ${months[last.getUTCMonth()]}`
    : `${a} ${months[first.getUTCMonth()]}–${b} ${months[last.getUTCMonth()]}`;
}
/** Text equivalent to frozen calendar.rs::check_alerts; no interactive OS actions. */
export function calendarNoticeText(value: CalendarNotice, now: number) {
  switch (value.kind) {
    case "test":
      return {
        title: "Aviso de prueba del calendario",
        body: "Así te avisaremos antes de cada salida.",
      };
    case "week":
      return {
        title: `Ya está el horario de la semana ${week(value.from)}`,
        body: "Tus favoritas y tus avisos pasan solos a la semana nueva.",
      };
    case "start": {
      const time = new Intl.DateTimeFormat("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value.at));
      const minutes = Math.floor(
        (Math.max(0, Math.floor((value.at - now) / 1000)) + 59) / 60,
      );
      return {
        title: `${value.series} sale a las ${time}`,
        body: `${value.track.split(" (")[0]} · carrera ${duration(value.raceMinutes)} · en ${minutes} min`,
      };
    }
  }
}
