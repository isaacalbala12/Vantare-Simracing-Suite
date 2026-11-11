import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("keeps both repeated local hours and omits the missing hour during DST", () => {
  const source = new URL("../src/renderer/ui/calendarDate.ts", import.meta.url)
    .href;
  const script = `import {dayHours} from ${JSON.stringify(source)};
 const spring=dayHours(Date.parse("2026-03-29T12:00Z"),false),fall=dayHours(Date.parse("2026-10-25T12:00Z"),false);
 process.stdout.write(JSON.stringify({spring:spring.map(h=>h.hour),fall:fall.map(h=>h.hour),distinct:new Set(fall.map(h=>h.from)).size}));`;
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", script],
      {
        env: { ...process.env, TZ: "Europe/Madrid" },
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
      },
    ),
  );
  expect(result.spring).toHaveLength(23);
  expect(result.spring).not.toContain(2);
  expect(result.fall).toHaveLength(25);
  expect(result.fall.filter((hour: number) => hour === 2)).toHaveLength(2);
  expect(result.distinct).toBe(25);
});
