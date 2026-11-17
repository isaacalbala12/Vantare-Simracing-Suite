import type { Page } from "playwright-core";

const reported = new Set(["error", "warning"]);

/**
 * Records the page's own failures from the moment it opens, so a browser run
 * that dies on a timeout can print the real cause.
 */
export function collectPageFailures(page: Pick<Page, "on">) {
  const failures: string[] = [];
  page.on("pageerror", (error) => {
    failures.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (!reported.has(message.type())) return;
    failures.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    failures.push(
      `requestfailed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`,
    );
  });
  return failures;
}

export function pageFailuresReport(failures: readonly string[]) {
  return [
    "Page failures since the page opened:",
    ...(failures.length > 0 ? failures : ["(none recorded)"]),
  ].join("\n");
}
