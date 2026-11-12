import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const native = (file: string) =>
  readFileSync(
    new URL(
      `../../native/hub-host/src/protocol/modules/calendar/${file}`,
      import.meta.url,
    ),
    "utf8",
  );
/** Architecture gate: editable desktop preferences require the production delivery chain.
 * Behavioral CAS, protection and presentation are exercised by the companion suites.
 */
it("keeps an emitter connected for the active Windows, sound and new-week preferences", () => {
  const tick = native("tick.rs"),
    scheduler = native("notice.rs");
  expect(tick).toMatch(/\.notice_tick\s*\(/u);
  expect(tick).toContain("Event::CalendarNotice");
  for (const field of ["channels.windows", "channels.sound", "notify_week"])
    expect(scheduler).toContain(field);
  const main = readFileSync(
    new URL("../src/main/index.ts", import.meta.url),
    "utf8",
  );
  expect(main).toContain('message.event.topic === "calendarNotice"');
  expect(main).toContain("calendarNotices.receive(message.event.value)");
});
