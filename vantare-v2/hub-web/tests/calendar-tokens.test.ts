import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { calendarTokens, detailGradient } from "../scripts/calendar-tokens";

it("keeps scoped calendar colors generated from the frozen GPUI source", async () => {
  const source = await readFile("../native/hub/src/calendar/chrome.rs", "utf8");
  const filters = await readFile(
    "../native/hub/src/calendar/ui/proximas.rs",
    "utf8",
  );
  const generated = await readFile(
    "src/renderer/design/generated/calendar-tokens.css",
    "utf8",
  );
  expect(generated).toBe(calendarTokens(source, filters));
  expect(generated).not.toMatch(/:root\s*\{/u);
});

it("rejects a detail gradient whose rotation no longer matches the native ramp", () => {
  expect(() => detailGradient("linear-gradient(90deg, #000, #fff)")).toThrow(
    "rotation missing",
  );
  expect(detailGradient("linear-gradient(145deg, #000, #fff)")).toContain(
    "180deg",
  );
});

it("preserves the native upcoming hero end stop and wash instead of the generic hero", async () => {
  const source = await readFile("../native/hub/src/calendar/chrome.rs", "utf8");
  const filters = await readFile(
    "../native/hub/src/calendar/ui/proximas.rs",
    "utf8",
  );
  const css = calendarTokens(source, filters);
  expect(css).toContain(
    "--calendar-proximas-hero: linear-gradient(110deg, #5c1720 0%, #1e1517 78%)",
  );
  expect(css).toContain("--calendar-proximas-wash-from: #ff525c42");
  expect(() =>
    calendarTokens(
      source.replaceAll("s.hero_wash.from", "s.removed_wash.from"),
      filters,
    ),
  ).toThrow("hero wash missing");
});

it("treats native stripe tint colors as RGB even when the literal starts with 00", async () => {
  const source = await readFile("../native/hub/src/calendar/chrome.rs", "utf8");
  const filters = await readFile(
    "../native/hub/src/calendar/ui/proximas.rs",
    "utf8",
  );
  const css = calendarTokens(source, filters);
  expect(css).toContain(
    "--calendar-month-stripe: color-mix(in srgb, #ffffff 3.5%, transparent)",
  );
  expect(css).toContain(
    "--calendar-month-stripe: color-mix(in srgb, #3c1920 4.5%, transparent)",
  );
});
