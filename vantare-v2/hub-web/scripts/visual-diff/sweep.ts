import { calendarScenes } from "./calendar-scenes.ts";
import { notificationScenes } from "./notifications.ts";
import type { VisualScene } from "./scenes.ts";
import { upcomingScenes } from "./upcoming.ts";
export const sweepScenes: Record<string, VisualScene> = {
  "strategy-proximamente": upcomingScenes["strategy-proximamente"],
  "engineer-base": upcomingScenes["engineer-base"],
  "notificaciones-completa": notificationScenes["notificaciones-completa"],
  "calendario-mes": {
    mock: "calendar-live-reference",
    async prepare(page) {
      await calendarScenes["calendario-r6-semana"].prepare(page);
      throw new Error(
        "Vista mensual no integrada: CalendarWeekView recibe onSpan undefined y Mes está deshabilitado",
      );
    },
  },
};
