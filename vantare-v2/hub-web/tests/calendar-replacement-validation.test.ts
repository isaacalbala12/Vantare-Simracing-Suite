import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { expect, it } from "vitest";
import { isReply, isRequest } from "../src/contract/modules/calendar";
import { calendarExportQa } from "../src/main/calendar-export-qa";
import { calendarReferenceNow } from "../src/mock/calendar-reference";

it("accepts only the closed confirmation shape and never a renderer path", () => {
  const request = {
    method: "calendar.icsReplace",
    confirmationId: "a".repeat(64),
    replace: true,
  };
  expect(isRequest(request)).toBe(true);
  for (const confirmationId of [
    "",
    "a".repeat(63),
    "A".repeat(64),
    "b".repeat(65),
    null,
  ])
    expect(isRequest({ ...request, confirmationId })).toBe(false);
  expect(isRequest({ ...request, path: "C:/private.ics" })).toBe(false);
  expect(isRequest({ ...request, replace: 1 })).toBe(false);
  for (const method of ["calendar.icsExport", "calendar.icsReplace"]) {
    const reply = {
      method,
      status: "replacementRequired",
      confirmationId: "b".repeat(64),
    };
    expect(isReply(reply)).toBe(true);
    expect(isReply({ method, status: "replacementRequired" })).toBe(false);
    expect(isReply({ ...reply, path: "C:/private.ics" })).toBe(false);
    expect(isReply({ ...reply, status: "saved" })).toBe(false);
    expect(isReply({ method, status: "saved" })).toBe(true);
  }
});
it("never enables the file picker double outside the exact trusted QA scene", () => {
  for (const [qa, host, scene] of [
    [false, "mock", "visual-dark:calendar-ics-replace-reference"],
    [true, "real", "visual-dark:calendar-ics-replace-reference"],
    [true, "mock", "calendar-ics-replace-reference"],
    [true, "mock", "visual-dark:calendar-live-reference"],
  ] as const)
    expect(calendarExportQa(qa, host, scene, "C:/unused")).toBeUndefined();
  expect(
    calendarExportQa(
      true,
      "mock",
      "visual-light:calendar-ics-replace-reference",
      "C:/unused",
    ),
  ).toBeDefined();
});

it("keeps the QA clock aligned without importing mocks or JSON into main", () => {
  const qa = calendarExportQa(
    true,
    "mock",
    "visual-dark:calendar-ics-replace-reference",
    "C:/unused",
  );
  expect(qa?.now()).toBe(calendarReferenceNow);
  const source = readFileSync(
    new URL("../src/main/calendar-export-qa.ts", import.meta.url),
    "utf8",
  );
  expect(source).not.toMatch(
    /(?:from\s*|import\s*\()["'][^"']*(?:mock|\.json)/,
  );
});

it("bundles the QA picker without the mock graph or its calendar corpus", async () => {
  const bundle = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      ssr: fileURLToPath(
        new URL("../src/main/calendar-export-qa.ts", import.meta.url),
      ),
      write: false,
    },
  });
  if (Array.isArray(bundle) || !("output" in bundle))
    throw new Error("Expected one bundle");
  const chunks = bundle.output.filter((item) => item.type === "chunk");
  expect(chunks.length).toBeGreaterThan(0);
  const modules = chunks.flatMap((chunk) => chunk.moduleIds);
  expect(
    modules.some((id) => /[\\/]src[\\/]mock[\\/]|[\\/]corpus[\\/]/.test(id)),
  ).toBe(false);
  expect(
    chunks.some((chunk) => chunk.code.includes("beginner-lmp3-fixed")),
  ).toBe(false);
});
