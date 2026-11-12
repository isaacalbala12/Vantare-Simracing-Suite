import { afterEach, expect, it, vi } from "vitest";
import { createMockHost } from "../src/mock/host";

afterEach(() => vi.restoreAllMocks());
it("prepares the fixed bank scene in main even when the system date is outside October", () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2027-01-01T00:00:00Z"));
  const host = createMockHost("visual-dark:calendar-live-reference");
  const result = host({
    kind: "request",
    id: 41,
    request: { method: "calendar.icsPrepare", scope: "favs", alarm: true },
  });
  if (
    result?.kind !== "response" ||
    result.result.method !== "calendar.icsPrepare"
  )
    throw new Error("visual ICS unavailable");
  expect(result.result.value.total).toBe(75);
  expect(result.result.value.entries).toHaveLength(4);
});
it("keeps the actual clock for the ordinary reference mock", () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2027-01-01T00:00:00Z"));
  const host = createMockHost("calendar-live-reference");
  expect(
    host({
      kind: "request",
      id: 42,
      request: { method: "calendar.icsPrepare", scope: "favs", alarm: true },
    }),
  ).toEqual({
    kind: "failure",
    id: 42,
    error: { kind: "calendarScheduleUnavailable" },
  });
});

it("keeps mock replacement ids private, single use and invalidates them on another preparation", () => {
  const host = createMockHost("visual-dark:calendar-ics-replace-reference");
  function prepareAndExport(id: number) {
    const view = host({
      kind: "request",
      id,
      request: { method: "calendar.icsPrepare", scope: "favs", alarm: true },
    });
    if (
      view?.kind !== "response" ||
      view.result.method !== "calendar.icsPrepare"
    )
      throw new Error("missing fixture");
    const result = host({
      kind: "request",
      id: id + 1,
      request: {
        method: "calendar.icsExport",
        preparedHash: view.result.value.preparedHash,
      },
    });
    if (
      result?.kind !== "response" ||
      result.result.method !== "calendar.icsExport" ||
      result.result.status !== "replacementRequired" ||
      !result.result.confirmationId
    )
      throw new Error("missing confirmation");
    return result.result.confirmationId;
  }
  const first = prepareAndExport(1);
  expect(
    host({
      kind: "request",
      id: 3,
      request: {
        method: "calendar.icsReplace",
        confirmationId: first,
        replace: false,
      },
    }),
  ).toEqual({
    kind: "response",
    id: 3,
    result: { method: "calendar.icsReplace", status: "cancelled" },
  });
  expect(
    host({
      kind: "request",
      id: 4,
      request: {
        method: "calendar.icsReplace",
        confirmationId: first,
        replace: true,
      },
    }),
  ).toEqual({ kind: "failure", id: 4, error: { kind: "rejected" } });
  const second = prepareAndExport(5);
  expect(second).not.toBe(first);
  const third = prepareAndExport(7);
  expect(
    host({
      kind: "request",
      id: 9,
      request: {
        method: "calendar.icsReplace",
        confirmationId: second,
        replace: true,
      },
    }),
  ).toEqual({ kind: "failure", id: 9, error: { kind: "rejected" } });
  expect(
    host({
      kind: "request",
      id: 10,
      request: {
        method: "calendar.icsReplace",
        confirmationId: third,
        replace: true,
      },
    }),
  ).toEqual({
    kind: "response",
    id: 10,
    result: { method: "calendar.icsReplace", status: "saved" },
  });
});
