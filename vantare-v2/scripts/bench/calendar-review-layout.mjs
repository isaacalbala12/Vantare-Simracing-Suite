// Run against an isolated Wails app with the Owner calendar review already open.
// Read-only: never saves a draft or publishes a schedule.
import { createRequire } from "node:module";
const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { chromium } = require("playwright");
const browser = await chromium.connectOverCDP(process.argv[2] ?? "http://127.0.0.1:10617");
try {
  const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes("/#/hub"));
  if (!page) throw new Error("Hub is not open");
  const source = page.getByTestId("orbit-settings-schedule-source");
  await source.waitFor();
  const result = await source.evaluate(element => {
    const body = element.parentElement;
    const card = body.parentElement;
    const sourceRect = element.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return {
      sourceHeight: element.clientHeight,
      bodyHeight: body.clientHeight,
      cardHeight: card.clientHeight,
      readOnly: element.readOnly,
      hasSource: element.value.length > 0,
      contained: sourceRect.bottom <= bodyRect.bottom + 1 && bodyRect.bottom <= cardRect.bottom + 1,
      fullWidth: sourceRect.width >= body.clientWidth - 50,
    };
  });
  console.log(JSON.stringify(result));
  if (!result.contained || !result.fullWidth || !result.readOnly || !result.hasSource) process.exitCode = 1;
} finally {
  await browser.close();
}
