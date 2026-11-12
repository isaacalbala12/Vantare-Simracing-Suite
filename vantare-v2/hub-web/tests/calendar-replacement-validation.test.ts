import { expect, it } from "vitest";
import { isReply, isRequest } from "../src/contract/modules/calendar";
import { calendarExportQa } from "../src/main/calendar-export-qa";

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
