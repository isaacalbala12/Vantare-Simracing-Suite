import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { calendarTokens } from "../scripts/calendar-tokens";

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
