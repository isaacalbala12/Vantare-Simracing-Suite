import { describe, expect, it } from "vitest";
import { isCalendarHistory } from "../src/contract/calendar-history-validation";
import {
  calendarHistoryWeeksLimit,
  calendarSeriesLimit,
  calendarTextLimit,
  calendarTimestampLimit,
} from "../src/contract/generated/calendar";
import { isReply, isRequest } from "../src/contract/modules/calendar";

const sample = () => ({
  weeks: [
    {
      from: 1791244800,
      until: 1791849600,
      seenAt: 1791187200,
      tracks: [
        { seriesId: "weekly-wec-weekly", name: "WEC Weekly", track: "Sebring" },
      ],
    },
  ],
  invalidCache: false,
});
describe("closed local calendar history", () => {
  it("accepts a bounded projection, missing data and a preserved invalid document", () => {
    expect(isCalendarHistory(sample())).toBe(true);
    expect(isCalendarHistory({ weeks: [], invalidCache: false })).toBe(true);
    expect(isCalendarHistory({ weeks: [], invalidCache: true })).toBe(true);
    expect(isRequest({ method: "calendar.historyLoad" })).toBe(true);
    expect(
      isRequest({ method: "calendar.historyLoad", path: "arbitrary" }),
    ).toBe(false);
    expect(isReply({ method: "calendar.historyLoad", value: sample() })).toBe(
      true,
    );
  });
  it("rejects excess, duplicate, unordered, unknown and out-of-range fields", () => {
    const source = sample();
    const bad: unknown[] = [
      { ...source, extra: true },
      {
        ...source,
        weeks: Array(calendarHistoryWeeksLimit + 1).fill(source.weeks[0]),
      },
      { ...source, weeks: [source.weeks[0], source.weeks[0]] },
      { ...source, invalidCache: "true" },
    ];
    for (const changes of [
      { from: -1 },
      { until: 0 },
      { seenAt: calendarTimestampLimit + 1 },
      { seenAt: 0.5 },
      { extra: true },
      {
        tracks: Array(calendarSeriesLimit + 1).fill(source.weeks[0].tracks[0]),
      },
      { tracks: [source.weeks[0].tracks[0], source.weeks[0].tracks[0]] },
    ])
      bad.push({ ...source, weeks: [{ ...source.weeks[0], ...changes }] });
    for (const seriesId of [
      " ",
      "\uFEFF",
      "bad\u0000id",
      "x".repeat(calendarTextLimit + 1),
    ])
      bad.push({
        ...source,
        weeks: [
          {
            ...source.weeks[0],
            tracks: [{ ...source.weeks[0].tracks[0], seriesId }],
          },
        ],
      });
    bad.push({
      ...source,
      weeks: [
        { ...source.weeks[0], from: source.weeks[0].from + 1 },
        source.weeks[0],
      ],
    });
    for (const value of bad) expect(isCalendarHistory(value)).toBe(false);
  });
});
