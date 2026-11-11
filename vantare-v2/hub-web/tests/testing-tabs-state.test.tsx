// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { AccessView } from "../src/contract/generated/contract";
import { useTestingTabs } from "../src/renderer/screens/testing/TestingTabs";

afterEach(cleanup);
const tester: AccessView = {
  verified: true,
  blocked: false,
  tester: true,
  calendar: true,
  engineer: false,
  strategy: false,
};
it("starts testers on summary and verified contributors on reports", () => {
  const hook = renderHook(({ access }) => useTestingTabs(access), {
    initialProps: { access: tester },
  });
  expect(hook.result.current.active).toBe("summary");
  hook.rerender({ access: { ...tester, tester: false } });
  expect(hook.result.current.active).toBe("reports");
  act(() => hook.result.current.change("summary"));
  expect(hook.result.current.active).toBe("reports");
});
it("falls back from a tester-only selection when rights are revoked", () => {
  const hook = renderHook(({ access }) => useTestingTabs(access), {
    initialProps: { access: tester },
  });
  act(() => hook.result.current.change("community"));
  expect(hook.result.current.active).toBe("community");
  hook.rerender({ access: { ...tester, blocked: true } });
  expect(hook.result.current.active).toBe("reports");
  expect(hook.result.current.tabs.every((tab) => !tab.visible)).toBe(true);
});
