import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import {
  reportCloseMethods,
  reportCloseTimeoutMs,
} from "../src/renderer/bridge/report-close";

it("keeps the close-time request list closed to the report draft save", () => {
  expect(reportCloseMethods).toEqual(["draft.save"]);
  expect(reportCloseTimeoutMs).toBe(5000);
  const source = readFileSync(
    new URL("../src/renderer/bridge/client.ts", import.meta.url),
    "utf8",
  );
  const phase = source.slice(
    source.indexOf("private beginClose("),
    source.indexOf("private finishClose("),
  );
  expect(source.match(/this\.issue\(/gu)).toHaveLength(2);
  expect(phase.match(/this\.issue\(/gu)).toHaveLength(1);
  expect(phase).toContain("{ method: reportCloseMethods[0], fields }");
  expect(phase).not.toContain("this.request(");
});
it("registers close preparation only from the report draft owner", () => {
  const root = new URL("../src/renderer/", import.meta.url);
  const registrations: string[] = [];
  function visit(path: string) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (
        /\.tsx?$/u.test(file) &&
        /\.setReportClosePreparation\(/u.test(readFileSync(file, "utf8"))
      )
        registrations.push(entry.name);
    }
  }
  visit(fileURLToPath(root));
  expect(registrations).toEqual(["ReportsState.tsx"]);
});
