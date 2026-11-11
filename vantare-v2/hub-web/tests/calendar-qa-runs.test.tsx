// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useCalendarQARuns } from "../src/renderer/screens/calendar/CalendarQARuns";

afterEach(cleanup);
it("loads public capture history only for an enabled demo and clears it on access loss", async () => {
  const hook = renderHook(({ allowed }) => useCalendarQARuns(allowed), {
    initialProps: { allowed: false },
  });
  expect(hook.result.current).toEqual([]);
  hook.rerender({ allowed: true });
  await waitFor(() => expect(hook.result.current).toHaveLength(10));
  hook.rerender({ allowed: false });
  await act(async () => {});
  expect(hook.result.current).toEqual([]);
});
