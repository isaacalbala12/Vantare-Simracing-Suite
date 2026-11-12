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
