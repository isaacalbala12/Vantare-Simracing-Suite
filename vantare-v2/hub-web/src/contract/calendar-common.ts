import { calendarMinuteLimit, calendarTextLimit } from "./generated/calendar";
export const text = (v: unknown): v is string =>
  typeof v === "string" &&
  new TextEncoder().encode(v).length <= calendarTextLimit &&
  Array.from(v).every((c) => {
    const n = c.codePointAt(0) ?? 0;
    return n >= 32 && (n < 127 || n > 159);
  });
export const number = (v: unknown, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
export const list = (
  v: unknown,
  max: number,
  test: (item: unknown) => boolean,
): v is unknown[] => Array.isArray(v) && v.length <= max && v.every(test);
export const strings = (v: unknown, max: number): v is string[] =>
  list(v, max, text) &&
  v.every((s) => typeof s === "string" && s.trim().length > 0) &&
  new Set(v).size === v.length;
export const duration = (v: unknown) =>
  v === null || number(v, calendarMinuteLimit);
