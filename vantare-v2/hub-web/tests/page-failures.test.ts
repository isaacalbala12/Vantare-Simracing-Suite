import { EventEmitter } from "node:events";
import type { Page } from "playwright-core";
import { expect, it } from "vitest";
import {
  collectPageFailures,
  pageFailuresReport,
} from "../scripts/page-failures.ts";

/** Only the event subscription surface of a Playwright page is needed here. */
function fakePage() {
  const events = new EventEmitter();
  return { events, page: events as unknown as Pick<Page, "on"> };
}

it("keeps page errors and console errors or warnings, and ignores the rest", () => {
  const { events, page } = fakePage();
  const failures = collectPageFailures(page);
  events.emit("console", { type: () => "log", text: () => "quiet log" });
  events.emit("console", {
    type: () => "warning",
    text: () => "Warning: each child needs a unique key",
  });
  events.emit("pageerror", new Error("Cannot read properties of undefined"));
  events.emit("console", {
    type: () => "error",
    text: () => "Uncaught Error: Minified React error #418",
  });
  events.emit("requestfailed", {
    url: () => "http://127.0.0.1/assets/index.js",
    failure: () => ({ errorText: "net::ERR_FAILED" }),
  });
  expect(failures).toEqual([
    "console.warning: Warning: each child needs a unique key",
    "pageerror: Cannot read properties of undefined",
    "console.error: Uncaught Error: Minified React error #418",
    "requestfailed: http://127.0.0.1/assets/index.js (net::ERR_FAILED)",
  ]);
});

it("prints the collected failures so a failed run shows why the page did not mount", () => {
  const report = pageFailuresReport([
    "pageerror: TypeError: cannot read 'length' of undefined",
    "console.error: Uncaught Error: Minified React error #418",
  ]);
  expect(report).toContain(
    "pageerror: TypeError: cannot read 'length' of undefined",
  );
  expect(report).toContain(
    "console.error: Uncaught Error: Minified React error #418",
  );
  expect(pageFailuresReport([])).toContain("(none recorded)");
});
