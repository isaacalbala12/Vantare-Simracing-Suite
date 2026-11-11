import type { CalendarSeries } from "../../../contract/generated/calendar";
import { calendarText } from "../../i18n/calendar";
import { calendarSeriesText as text } from "../../i18n/calendarSeries";
import { civilDay, datePart } from "../../ui/calendarDate";
import { leadMinutes, raceMinutes } from "./rows";

export type { CalendarRun } from "./CalendarRun";

import type { CalendarRun } from "./CalendarRun";
export function seriesHistory(
  runs: readonly CalendarRun[],
  seriesId: string,
  from: number,
  until: number,
) {
  const mine = runs.filter(
    (run) => run.seriesId === seriesId && run.at >= from && run.at < until,
  );
  if (!mine.length) return { count: text.none, best: "—", mean: "—" };
  const best =
    mine.flatMap((run) => (run.bestLap ? [run.bestLap] : [])).sort()[0] ?? "—";
  const mean = Math.floor(
    mine.reduce((n, run) => n + run.position, 0) / mine.length,
  );
  const sr = Math.trunc(mine.reduce((n, run) => n + run.safetyTenths, 0) / 10);
  return {
    count: text.races(mine.length),
    best,
    mean: `P${mean} · ${sr >= 0 ? "+" : ""}${sr} SR`,
  };
}
export function seriesRules(series: CalendarSeries) {
  const practice =
    series.sessions.find((s) => s.name === "practice")?.durationMin ?? 3;
  const lead = leadMinutes(series);
  return [
    [
      text.license,
      series.licenseLabel
        .replaceAll("Bronze", text.bronze)
        .replaceAll("Silver", text.silver) || text.noRequirement,
    ],
    [
      text.security,
      series.safetyRating.replace("Player SR ", "SR ") || text.noRequirement,
    ],
    [
      text.setup,
      series.setup === "fixed"
        ? text.fixed
        : series.setup === "open"
          ? text.open
          : series.setup || "—",
    ],
    [
      text.assists,
      series.assists === "High assists allowed"
        ? text.highAssists
        : series.assists === "Low assists allowed"
          ? text.lowAssists
          : text.noAssists,
    ],
    [text.warmers, series.tyreWarmers ? text.yes : text.no],
    [text.tyres, String(series.tyres ?? "—")],
    [
      text.sessions,
      `P ${practice}′ · Q ${lead - practice}′ · R ${calendarText.minutes(raceMinutes(series))}`,
    ],
    [text.splits, series.splits === null ? "—" : text.upto(series.splits)],
    [
      text.cars,
      series.classes
        .map((c) => (c.name.includes("McLaren") ? "McLaren 720S" : c.name))
        .join(" · ") || series.vehicleClass,
    ],
    [
      text.content,
      /Silverstone|Road Atlanta/u.test(series.track) ? text.dlc : text.included,
    ],
  ];
}

export function relativeDay(day: number, now: number, utc: boolean) {
  return day === civilDay(now, 0, utc)
    ? calendarText.today
    : day === civilDay(now, 1, utc)
      ? calendarText.tomorrowRelative
      : `${datePart(day, "weekday", utc)} ${datePart(day, "day", utc)}`;
}
export function slotGroups(
  times: readonly number[],
  now: number,
  utc: boolean,
) {
  const groups: { day: number; label: string; starts: number[] }[] = [];
  for (const at of times) {
    const date = new Date(at),
      hour = utc ? date.getUTCHours() : date.getHours();
    const day = civilDay(at, hour < 3 ? -1 : 0, utc);
    const last = groups.at(-1);
    if (last?.day === day) last.starts.push(at);
    else groups.push({ day, label: relativeDay(day, now, utc), starts: [at] });
  }
  return groups;
}
