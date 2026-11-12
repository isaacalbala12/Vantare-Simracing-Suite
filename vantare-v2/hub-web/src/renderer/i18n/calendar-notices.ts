import type { CalendarNotice } from "../../contract/generated/calendar";
export function calendarNoticeText(value: CalendarNotice, now: number) {
  switch (value.kind) {
    case "test": return { title: "Calendario · Aviso de prueba", body: "Así recibirás los avisos del Calendario mientras el Hub esté abierto." };
    case "week": return { title: "Calendario · Nueva semana", body: "Ya está disponible el horario de una nueva semana." };
    case "start": return { title: value.series, body: `${value.track} · Sale en ${Math.max(0, Math.ceil((value.at - now) / 60000))} min${value.raceMinutes ? ` · Carrera de ${value.raceMinutes} min` : ""}` };
  }
}
