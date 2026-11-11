const day = 86_400_000;
export function civilDay(at: number, offset: number, utc: boolean) {
  const d = new Date(at);
  if (utc) {
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + offset);
  } else {
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset);
  }
  return d.getTime();
}
export function datePart(
  at: number,
  part: "day" | "month" | "weekday",
  utc: boolean,
) {
  const value = new Intl.DateTimeFormat("es", {
    [part]: part === "day" ? "numeric" : "short",
    ...(utc ? { timeZone: "UTC" } : {}),
  }).format(at);
  return value.replace(/\.$/u, "").replace(/^sept$/u, "sep");
}
export function weekTitle(at: number, utc: boolean) {
  const last = civilDay(at, 6, utc);
  const firstMonth = datePart(at, "month", utc),
    lastMonth = datePart(last, "month", utc);
  const first = `${datePart(at, "day", utc)}${firstMonth === lastMonth ? "" : ` ${firstMonth}`}`;
  return `${first}–${datePart(last, "day", utc)} ${lastMonth}`;
}
export function clock(at: number, utc: boolean) {
  return new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(utc ? { timeZone: "UTC" } : {}),
  }).format(at);
}
export function elapsedDays(from: number, until: number) {
  return Math.max(0, Math.floor((until - from) / day));
}

export function weekDays(start: number, utc: boolean) {
  const date = new Date(start);
  const first = utc
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    : new Date(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
      ).getTime();
  return Array.from({ length: 7 }, (_, i) => civilDay(first, i, utc));
}
export function weekLongTitle(start: number) {
  const days = weekDays(start, true),
    last = days[6];
  return `${datePart(start, "weekday", true)} ${datePart(start, "day", true)} – ${datePart(last, "weekday", true)} ${datePart(last, "day", true)} ${datePart(last, "month", true)}`;
}

export function dayHours(at: number, utc: boolean) {
  const from = civilDay(at, 0, utc),
    until = civilDay(at, 1, utc);
  const hours: { from: number; until: number; hour: number }[] = [];
  for (let cursor = from; cursor < until; cursor += 3600000) {
    const date = new Date(cursor);
    hours.push({
      from: cursor,
      until: Math.min(cursor + 3600000, until),
      hour: utc ? date.getUTCHours() : date.getHours(),
    });
  }
  return hours;
}

export function hourColumns(at: number, utc: boolean) {
  const columns = Array.from(
    { length: 24 },
    () => [] as ReturnType<typeof dayHours>,
  );
  for (const hour of dayHours(at, utc)) columns[hour.hour].push(hour);
  return columns;
}
