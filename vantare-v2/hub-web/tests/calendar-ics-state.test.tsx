// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HostFailure } from "../src/renderer/bridge/client";
import { useCalendarIcs } from "../src/renderer/screens/calendar/CalendarIcsState";

const host = vi.hoisted(() => ({ client: { request: vi.fn() } }));
vi.mock("../src/renderer/app/Host", () => ({ useHost: () => host }));
afterEach(() => {
  cleanup();
  host.client = { request: vi.fn() };
});
const value = {
  calendar: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
  preparedHash: "a".repeat(64),
  entries: [],
  total: 0,
  validUntil: "2026-10-13T00:00:00Z",
};
const reply = { method: "calendar.icsPrepare", value };
it("prepares the native default and drops the visible snapshot before changed options finish", async () => {
  host.client.request.mockResolvedValueOnce(reply);
  const hook = renderHook(() => useCalendarIcs(true, true));
  await act(async () => {});
  expect(host.client.request).toHaveBeenLastCalledWith({
    method: "calendar.icsPrepare",
    scope: "favs",
    alarm: true,
  });
  expect(hook.result.current.view).toEqual(value);
  let finish!: (value: unknown) => void;
  host.client.request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  act(() => {
    hook.result.current.setScope("events");
    void hook.result.current.download();
  });
  expect(hook.result.current.view).toBeUndefined();
  expect(host.client.request).toHaveBeenCalledTimes(2);
  await act(async () => {
    finish(reply);
  });
  expect(hook.result.current.view).toEqual(value);
});
it("locks a double export, uses the displayed hash and re-prepares after cancellation", async () => {
  host.client.request.mockResolvedValueOnce(reply);
  const hook = renderHook(() => useCalendarIcs(true, true));
  await act(async () => {});
  let finish!: (value: unknown) => void;
  host.client.request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  let pending!: Promise<boolean>;
  act(() => {
    pending = hook.result.current.download();
    void hook.result.current.download();
  });
  expect(host.client.request).toHaveBeenCalledTimes(2);
  expect(host.client.request).toHaveBeenLastCalledWith({
    method: "calendar.icsExport",
    preparedHash: value.preparedHash,
  });
  host.client.request.mockResolvedValueOnce(reply);
  await act(async () => {
    finish({ method: "calendar.icsExport", status: "cancelled" });
    await pending;
  });
  expect(host.client.request).toHaveBeenCalledTimes(3);
  expect(hook.result.current.status).toBe("cancelled");
  expect(hook.result.current.view).toEqual(value);
});
it("ignores late preparation after access loss and clears busy", async () => {
  let finish!: (value: unknown) => void;
  host.client.request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const hook = renderHook(({ allowed }) => useCalendarIcs(true, allowed), {
    initialProps: { allowed: true },
  });
  hook.rerender({ allowed: false });
  await act(async () => {
    finish(reply);
  });
  expect(hook.result.current.view).toBeUndefined();
  expect(hook.result.current.busy).toBe(false);
  await act(async () => {
    await hook.result.current.download();
  });
  expect(host.client.request).toHaveBeenCalledTimes(1);
});
it("clears a failed prepare and retries only on explicit request", async () => {
  host.client.request.mockRejectedValueOnce(new Error("local failure"));
  const hook = renderHook(() => useCalendarIcs(true, true));
  await act(async () => {});
  expect(hook.result.current.view).toBeUndefined();
  expect(hook.result.current.failure).toBe("coreUnavailable");
  host.client.request.mockResolvedValueOnce(reply);
  act(() => hook.result.current.retry());
  await act(async () => {});
  expect(hook.result.current.view).toEqual(value);
  expect(hook.result.current.failure).toBeUndefined();
});

it("drops a preparation rejected by main and only prepares again on explicit retry", async () => {
  host.client.request.mockResolvedValueOnce(reply);
  const hook = renderHook(() => useCalendarIcs(true, true));
  await act(async () => {});
  host.client.request.mockRejectedValueOnce(
    new HostFailure({ kind: "rejected" }),
  );
  await act(async () => {
    await hook.result.current.download();
  });
  expect(hook.result.current.failure).toBe("rejected");
  expect(hook.result.current.view).toBeUndefined();
  await act(async () => {
    await hook.result.current.download();
  });
  expect(host.client.request).toHaveBeenCalledTimes(2);
  host.client.request.mockResolvedValueOnce(reply);
  act(() => hook.result.current.retry());
  await act(async () => {});
  expect(hook.result.current.view).toEqual(value);
  expect(host.client.request).toHaveBeenLastCalledWith({
    method: "calendar.icsPrepare",
    scope: "favs",
    alarm: true,
  });
});

it("keeps the latest preparation when two requests resolve in reverse order", async () => {
  const resolve: ((value: unknown) => void)[] = [];
  host.client.request.mockImplementation(
    () => new Promise((r) => resolve.push(r)),
  );
  const hook = renderHook(() => useCalendarIcs(true, true));
  act(() => hook.result.current.setScope("events"));
  expect(resolve).toHaveLength(2);
  const latest = { ...value, preparedHash: "b".repeat(64) };
  await act(async () => resolve[1]({ ...reply, value: latest }));
  expect(hook.result.current.view).toEqual(latest);
  await act(async () => resolve[0](reply));
  expect(hook.result.current.view).toEqual(latest);
  expect(hook.result.current.busy).toBe(false);
});
it("prepares again after a name conflict and keeps its explanation", async () => {
  const next = { ...value, preparedHash: "c".repeat(64) };
  host.client.request
    .mockResolvedValueOnce(reply)
    .mockResolvedValueOnce({ method: "calendar.icsExport", status: "conflict" })
    .mockResolvedValueOnce({ ...reply, value: next });
  const hook = renderHook(() => useCalendarIcs(true, true));
  await act(async () => {});
  await act(async () => {
    expect(await hook.result.current.download()).toBe(false);
  });
  expect(hook.result.current.status).toBe("conflict");
  expect(hook.result.current.view).toEqual(next);
  expect(host.client.request).toHaveBeenCalledTimes(3);
});
it.each(["io", "calendarExportTooLarge", "denied"] as const)(
  "reports export %s and consumes its preparation",
  async (kind) => {
    host.client.request
      .mockResolvedValueOnce(reply)
      .mockRejectedValueOnce(new HostFailure({ kind }));
    const hook = renderHook(() => useCalendarIcs(true, true));
    await act(async () => {});
    await act(async () => {
      expect(await hook.result.current.download()).toBe(false);
    });
    expect(hook.result.current.failure).toBe(kind);
    expect(hook.result.current.view).toBeUndefined();
    expect(hook.result.current.exporting).toBe(false);
  },
);
it.each(["closed", "rights", "client"] as const)(
  "keeps a live export locked across %s and acknowledges its eventual saved result",
  async (transition) => {
    let finish!: (value: unknown) => void;
    const original = host.client;
    original.request.mockResolvedValueOnce(reply).mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    const hook = renderHook(
      ({ open, allowed }) => useCalendarIcs(open, allowed),
      { initialProps: { open: true, allowed: true } },
    );
    await act(async () => {});
    let pending!: Promise<boolean>;
    act(() => {
      pending = hook.result.current.download();
    });
    if (transition === "client") host.client = { request: vi.fn() };
    hook.rerender({
      open: transition !== "closed",
      allowed: transition !== "rights",
    });
    expect(hook.result.current.exporting).toBe(true);
    expect(hook.result.current.canClose()).toBe(false);
    hook.rerender({ open: true, allowed: true });
    await act(async () => {
      expect(await hook.result.current.download()).toBe(false);
    });
    expect(original.request).toHaveBeenCalledTimes(2);
    if (transition === "client")
      expect(host.client.request).not.toHaveBeenCalled();
    await act(async () => {
      finish({ method: "calendar.icsExport", status: "saved" });
      expect(await pending).toBe(true);
    });
    expect(hook.result.current.status).toBe("saved");
    expect(hook.result.current.exporting).toBe(false);
    expect(hook.result.current.canClose()).toBe(true);
  },
);
