export interface CalendarRun {
  seriesId: string;
  circuit: string;
  at: number;
  position: number;
  safetyTenths: number;
  bestLap: string | null;
}
