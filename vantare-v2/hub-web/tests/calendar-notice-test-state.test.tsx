// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HostFailure } from "../src/renderer/bridge/client";
import { useCalendarNoticeTest } from "../src/renderer/screens/calendar/CalendarNoticeTest";

const host = vi.hoisted(() => ({ client: { request: vi.fn() } }));
vi.mock("../src/renderer/app/Host", () => ({ useHost: () => host }));
afterEach(() => {
  cleanup();
  host.client = { request: vi.fn() };
});
it.each([true, false])(
  "requests only the fixed example and reports accepted=%s honestly",
  async (accepted) => {
    host.client.request.mockResolvedValue({
      method: "calendar.noticeTest",
      accepted,
    });
    const hook = renderHook(() => useCalendarNoticeTest(true));
    expect(host.client.request).not.toHaveBeenCalled();
    await act(async () => {
      await hook.result.current.test();
    });
    expect(host.client.request).toHaveBeenCalledExactlyOnceWith({
      method: "calendar.noticeTest",
    });
    expect(hook.result.current.status).toBe(
      accepted ? "accepted" : "unavailable",
    );
    expect(hook.result.current.busy).toBe(false);
  },
);
it("ignores duplicate clicks in the same render", async () => {
  let finish!: (v: unknown) => void;
  host.client.request.mockImplementation(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const hook = renderHook(() => useCalendarNoticeTest(true));
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.test();
    void hook.result.current.test();
  });
  expect(host.client.request).toHaveBeenCalledTimes(1);
  expect(hook.result.current.busy).toBe(true);
  await act(async () => {
    finish({ method: "calendar.noticeTest", accepted: true });
    await pending;
  });
  expect(hook.result.current.status).toBe("accepted");
});
it.each(["busy", "denied", "coreUnavailable", "protected"] as const)(
  "shows the closed %s failure",
  async (kind) => {
    host.client.request.mockRejectedValue(new HostFailure({ kind }));
    const hook = renderHook(() => useCalendarNoticeTest(true));
    await act(async () => {
      await hook.result.current.test();
    });
    expect(hook.result.current.failure).toBe(kind);
    expect(hook.result.current.busy).toBe(false);
  },
);
it("drops a late answer after rights loss and does not send without rights", async () => {
  let finish!: (v: unknown) => void;
  host.client.request.mockImplementation(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const hook = renderHook(({ allowed }) => useCalendarNoticeTest(allowed), {
    initialProps: { allowed: true },
  });
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.test();
  });
  hook.rerender({ allowed: false });
  await act(async () => {
    finish({ method: "calendar.noticeTest", accepted: true });
    await pending;
    await hook.result.current.test();
  });
  expect(host.client.request).toHaveBeenCalledTimes(1);
  expect(hook.result.current.status).toBeUndefined();
  expect(hook.result.current.busy).toBe(false);
});
it("keeps the new client result when the old client resolves later", async () => {
  let finish!: (v: unknown) => void;
  host.client.request.mockImplementation(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const hook = renderHook(() => useCalendarNoticeTest(true));
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.test();
  });
  host.client = {
    request: vi
      .fn()
      .mockResolvedValue({ method: "calendar.noticeTest", accepted: false }),
  };
  hook.rerender();
  await act(async () => {
    await hook.result.current.test();
    finish({ method: "calendar.noticeTest", accepted: true });
    await pending;
  });
  expect(hook.result.current.status).toBe("unavailable");
});
