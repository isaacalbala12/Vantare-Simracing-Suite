import type { RaceEvent, RaceSeries } from "./calendar-types";

export type CalendarDayCell = {
  date: Date;
  inCurrentMonth: boolean;
  isToday: boolean;
};

export type CalendarOccurrence = {
  seriesId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  durationMin: number;
};

export type DailyPatternSummary = {
  tier: string;
  label: string;
  count: number;
};

/**
 * Devuelve la fecha local a las 00:00:00.000.
 */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Compara si dos fechas corresponden al mismo día local.
 */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Devuelve un grid de 42 celdas (6 semanas x 7 días) correspondiente al mes de la fecha 'anchor'.
 * La semana empieza en lunes.
 */
export function buildMonthGrid(anchor: Date): CalendarDayCell[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  // Primer día del mes actual
  const firstDayOfMonth = new Date(year, month, 1);

  // getDay() de JS: 0 = Domingo, 1 = Lunes, ..., 6 = Sábado.
  // Queremos que Lunes sea index 0, Martes 1, ..., Domingo 6.
  const jsDay = firstDayOfMonth.getDay();
  const daysBefore = (jsDay + 6) % 7;

  // Fecha de inicio del grid de 42 celdas
  const gridStart = new Date(year, month, 1 - daysBefore);
  const startMidnight = startOfLocalDay(gridStart);

  const today = new Date();
  const cells: CalendarDayCell[] = [];

  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(startMidnight.getTime());
    cellDate.setDate(startMidnight.getDate() + i);

    const inCurrentMonth = cellDate.getMonth() === month && cellDate.getFullYear() === year;
    const isToday = isSameLocalDay(cellDate, today);

    cells.push({
      date: cellDate,
      inCurrentMonth,
      isToday,
    });
  }

  return cells;
}

/**
 * Devuelve un array de 7 días (de lunes a domingo) correspondiente a la semana de la fecha 'anchor'.
 */
export function buildWeekRange(anchor: Date): Date[] {
  const midnight = startOfLocalDay(anchor);
  const jsDay = midnight.getDay();
  const daysBefore = (jsDay + 6) % 7;

  const monday = new Date(midnight.getTime());
  monday.setDate(midnight.getDate() - daysBefore);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday.getTime());
    day.setDate(monday.getDate() + i);
    days.push(day);
  }

  return days;
}

const SPANISH_MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/**
 * Formatea una fecha para mostrar el título del mes en español (ej: "Julio 2026").
 */
export function formatMonthTitle(date: Date): string {
  const monthName = SPANISH_MONTH_NAMES[date.getMonth()];
  return `${monthName} ${date.getFullYear()}`;
}

export const SPANISH_MONTHS_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export const SPANISH_WEEKDAYS_FULL = [
  "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
];

/**
 * Determina si la serie se repite por intervalos de tiempo.
 */
export function isIntervalSeries(series: RaceSeries): boolean {
  return series.recurrence?.kind === "interval";
}

/**
 * Determina si la serie corresponde a slots semanales específicos.
 */
export function isWeeklySlotsSeries(series: RaceSeries): boolean {
  return series.recurrence?.kind === "weekly-slots";
}

const DAYS_MAP = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Expande las series de tipo weekly-slots en ocurrencias individuales de calendario dentro del rango [from, to).
 * Solo para recurrence.kind === "weekly-slots".
 */
export function expandWeeklySlots(series: RaceSeries, from: Date, to: Date): CalendarOccurrence[] {
  if (!isWeeklySlotsSeries(series)) {
    return [];
  }

  const days = series.recurrence.days;
  const timesUTC = series.recurrence.timesUTC;

  if (!days || !timesUTC || days.length === 0 || timesUTC.length === 0) {
    return [];
  }

  const occurrences: CalendarOccurrence[] = [];
  const fromTime = from.getTime();
  const toTime = to.getTime();

  // Para cubrir adecuadamente las fronteras de zonas horarias cuando UTC cruza a local,
  // iniciamos la búsqueda desde 1 día antes del día UTC de 'from' y terminamos hasta 1 día después de 'to'.
  const startDayUTC = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() - 1));
  const endLimitTime = toTime + 86400000; // 1 día en ms después de 'to'

  const currentDayUTC = new Date(startDayUTC.getTime());

  while (currentDayUTC.getTime() < endLimitTime) {
    const dayIndex = currentDayUTC.getUTCDay();
    const currentDayStr = DAYS_MAP[dayIndex];

    if (days.includes(currentDayStr)) {
      for (const timeStr of timesUTC) {
        const parts = timeStr.split(":");
        if (parts.length !== 2) continue;

        if (!/^\d{1,2}:\d{2}$/.test(timeStr)) continue;

        const hour = parseInt(parts[0], 10);
        const min = parseInt(parts[1], 10);
        if (Number.isNaN(hour) || Number.isNaN(min)) continue;
        if (hour < 0 || hour > 23 || min < 0 || min > 59) continue;

        const occurrenceTimeUTC = Date.UTC(
          currentDayUTC.getUTCFullYear(),
          currentDayUTC.getUTCMonth(),
          currentDayUTC.getUTCDate(),
          hour,
          min
        );

        const startTime = new Date(occurrenceTimeUTC);
        const startTimeMs = startTime.getTime();

        if (startTimeMs >= fromTime && startTimeMs < toTime) {
          const duration = series.durationMin > 0 ? series.durationMin : 0;
          const endTime = new Date(startTimeMs + duration * 60_000);

          occurrences.push({
            seriesId: series.id,
            title: series.name,
            startTime,
            endTime,
            durationMin: duration,
          });
        }
      }
    }

    // Avanzar 1 día UTC
    currentDayUTC.setUTCDate(currentDayUTC.getUTCDate() + 1);
  }

  // Ordenar ocurrencias por startTime
  return occurrences.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

/**
 * Expande interval series para un día local específico (ventana de 24h).
 * Cada serie daily genera una salida por hora en su minuto fijo (startOffsetMinute).
 * Usa eventDurationMin como duración visual si está disponible, o durationMin + 11 como fallback.
 * Solo para recurrence.kind === "interval".
 * No materializa más allá de 24h — seguro para MonthView/WeekView.
 *
 * NOTA: esta función solo se usa en la DayView cuando un filtro de tier está
 * activo y el usuario quiere ver franjas; el grid principal NUNCA materializa
 * las series de intervalo (ver calendar-filter / las vistas).
 */
export function expandDailyIntervalSeries(
  series: RaceSeries[],
  dayStart: Date,
  dayEnd: Date,
  tierFilter?: string,
): CalendarOccurrence[] {
  const occurrences: CalendarOccurrence[] = [];
  const fromMs = dayStart.getTime();
  const toMs = dayEnd.getTime();

  for (const s of series) {
    if (!isIntervalSeries(s)) continue;
    if (tierFilter && s.tier !== tierFilter) continue;

    const interval = s.recurrence?.intervalMinutes ?? 60;
    const offset = s.startOffsetMinute ?? 0;
    const visualDuration = s.eventDurationMin ?? s.durationMin + 11;

    // Generate occurrences at the actual interval frequency
    for (let minutesFromMidnight = offset; minutesFromMidnight < 24 * 60; minutesFromMidnight += interval) {
      const startTime = new Date(dayStart.getTime());
      startTime.setHours(0, minutesFromMidnight, 0, 0);
      const startMs = startTime.getTime();

      if (startMs < fromMs || startMs >= toMs) continue;

      const endTime = new Date(startMs + visualDuration * 60_000);

      occurrences.push({
        seriesId: s.id,
        title: s.name,
        startTime,
        endTime,
        durationMin: visualDuration,
      });
    }
  }

  return occurrences.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

/**
 * Agrupa las interval series por tier, sin materializar horarios concretos.
 * Devuelve tier + label + count.
 */
export function getDailyPatternSummary(series: RaceSeries[]): DailyPatternSummary[] {
  const intervalSeries = series.filter(isIntervalSeries);

  const groups = new Map<string, RaceSeries[]>();
  for (const s of intervalSeries) {
    const list = groups.get(s.tier) ?? [];
    list.push(s);
    groups.set(s.tier, list);
  }

  const summaries: DailyPatternSummary[] = [];

  for (const [tier, tierSeries] of groups.entries()) {
    // Obtenemos los intervalos únicos en este tier
    const intervals = Array.from(
      new Set(tierSeries.map((s) => s.recurrence.intervalMinutes).filter((v): v is number => typeof v === "number" && v > 0))
    );
    intervals.sort((a, b) => a - b);

    let label = "Horario pendiente";
    if (intervals.length > 0) {
      label = `Cada ${intervals[0]} min`;
    }

    summaries.push({
      tier,
      label,
      count: tierSeries.length,
    });
  }

  const tierOrder = ["beginner", "intermediate", "advanced", "weekly"];

  summaries.sort((a, b) => {
    const indexA = tierOrder.indexOf(a.tier);
    const indexB = tierOrder.indexOf(b.tier);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.tier.localeCompare(b.tier);
  });

  return summaries;
}

/**
 * Agrupa una lista de ocurrencias de calendario por su día local en formato YYYY-MM-DD.
 */
export function groupEventsByDay(events: RaceEvent[]): Map<string, RaceEvent[]> {
  const map = new Map<string, RaceEvent[]>();

  for (const ev of events) {
    const date = new Date(ev.startTime);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const key = `${year}-${month}-${day}`;

    const list = map.get(key) ?? [];
    list.push(ev);
    map.set(key, list);
  }

  return map;
}

/**
 * Indexa un array de series por su id para búsqueda O(1).
 * No muta el array original.
 */
export function indexSeriesById(series: RaceSeries[]): Map<string, RaceSeries> {
  const map = new Map<string, RaceSeries>();

  for (const s of series) {
    map.set(s.id, s);
  }

  return map;
}
