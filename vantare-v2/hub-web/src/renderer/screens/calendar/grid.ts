import { civilDay } from "../../ui/calendarDate";
export function weekDates(now: number, utc: boolean) {
  const date = new Date(now);
  const back = (date.getUTCDay() + 5) % 7;
  const tuesday = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - back,
    ),
  );
  const first = utc
    ? tuesday.getTime()
    : new Date(
        tuesday.getUTCFullYear(),
        tuesday.getUTCMonth(),
        tuesday.getUTCDate(),
      ).getTime();
  return Array.from({ length: 7 }, (_, offset) => civilDay(first, offset, utc));
}
