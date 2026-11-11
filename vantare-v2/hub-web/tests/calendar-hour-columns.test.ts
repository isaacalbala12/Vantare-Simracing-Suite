import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("represents the missing spring hour and both repeated autumn hours in Madrid", () => {
  const source = pathToFileURL(resolve("src/renderer/ui/calendarDate.ts")).href;
  const script = `import {hourColumns} from ${JSON.stringify(source)}; console.log(JSON.stringify(['2026-03-29T12:00:00Z','2026-10-25T12:00:00Z'].map(date=>hourColumns(Date.parse(date),false).map(column=>column.length))));`;
  const data = JSON.parse(
    execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", script],
      { encoding: "utf8", env: { ...process.env, TZ: "Europe/Madrid" } },
    ),
  );
  expect(data[0]).toHaveLength(24);
  expect(data[0][2]).toBe(0);
  expect(data[0].reduce((a: number, b: number) => a + b, 0)).toBe(23);
  expect(data[1]).toHaveLength(24);
  expect(data[1][2]).toBe(2);
  expect(data[1].reduce((a: number, b: number) => a + b, 0)).toBe(25);
});
