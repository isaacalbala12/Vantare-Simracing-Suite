// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type OverlayInstance,
  studioWidgetDefaults,
  type WidgetSettings,
} from "../src/contract/generated/studio";
import { useDrivingContent } from "../src/renderer/screens/studio/driving-content";

const state = vi.hoisted(() => ({
  view: { state: "ready", plan: "free", revision: "a".repeat(64) },
  pending: false,
  execute: vi.fn(),
}));
vi.mock("../src/renderer/screens/studio/state", () => ({
  useStudio: () => state,
}));
beforeEach(() => {
  state.view = { state: "ready", plan: "free", revision: "a".repeat(64) };
  state.pending = false;
  state.execute.mockReset();
});
afterEach(cleanup);
function instance(kind: "delta" | "pedals" = "delta"): OverlayInstance {
  return {
    id: "widget-1",
    kind,
    settings: structuredClone(studioWidgetDefaults[kind]) as WidgetSettings,
    visible: true,
    locked: false,
    opacity: 100,
    showIn: { practice: true, qualifying: true, race: true },
    offTrack: "inherit",
    size: { width: 400, height: 300 },
  };
}
function expectPatch(value: object) {
  expect(state.execute).toHaveBeenCalledExactlyOnceWith({
    method: "studio.instance",
    id: "widget-1",
    baseRevision: state.view.revision,
    patch: { field: "settings", value },
  });
}
it.each(["best", "optimal", "leader"] as const)(
  "writes only reference=%s",
  (reference) => {
    const item = instance();
    const { result } = renderHook(() => useDrivingContent(item));
    act(() => result.current.setReference(reference));
    expectPatch({ kind: "delta", reference });
  },
);
it.each(["pill", "bar", "expanded"] as const)(
  "allows sectors only for expanded (size=%s)",
  (size) => {
    const item = instance();
    if (item.settings?.kind !== "delta") throw Error("Delta fixture");
    item.settings.size = size;
    const { result } = renderHook(() => useDrivingContent(item));
    expect(result.current.sectors).toBe(size === "expanded");
    act(() => result.current.setSectors(false));
    if (size === "expanded") expectPatch({ kind: "delta", showSectors: false });
    else expect(state.execute).not.toHaveBeenCalled();
  },
);
it.each(["eficiencia", "vantare"] as const)(
  "allows brake peak only with Vantare (%s)",
  (look) => {
    const item = instance("pedals");
    if (!item.settings) throw Error("Fixture");
    item.settings.designSystem = look;
    const { result } = renderHook(() => useDrivingContent(item));
    expect(result.current.brake).toBe(look === "vantare");
    act(() => result.current.setBrakePeak(false));
    if (look === "vantare")
      expectPatch({ kind: "pedals", showBrakePeak: false });
    else expect(state.execute).not.toHaveBeenCalled();
  },
);
it("does not offer Delta Content with Eficiencia", () => {
  const item = instance();
  if (!item.settings) throw Error("Fixture");
  item.settings.designSystem = "eficiencia";
  const { result } = renderHook(() => useDrivingContent(item));
  expect(result.current.delta).toBe(false);
  act(() => {
    result.current.setReference("leader");
    result.current.setSectors(true);
  });
  expect(state.execute).not.toHaveBeenCalled();
});
it.each([0, 12, 2.7])(
  "saves gap %s with native bounds and without rounding",
  (gap) => {
    const item = instance("pedals");
    const { result } = renderHook(() => useDrivingContent(item));
    act(() => result.current.editGap(String(gap)));
    act(() => result.current.commitGap());
    expectPatch({ kind: "pedals", gap });
    expect(result.current.gap).toBe("2");
  },
);
it.each(["", "-1", "13", "NaN", "Infinity"])(
  "rejects invalid gap %s",
  (gap) => {
    const item = instance("pedals");
    const { result } = renderHook(() => useDrivingContent(item));
    act(() => result.current.editGap(gap));
    act(() => result.current.commitGap());
    expect(result.current.gapError).toBe(true);
    expect(state.execute).not.toHaveBeenCalled();
  },
);
it("keeps a fractional saved value and sends nothing on unchanged commit", () => {
  const item = instance("pedals");
  if (item.settings?.kind !== "pedals") throw Error("Fixture");
  item.settings.gap = 2.7;
  const { result } = renderHook(() => useDrivingContent(item));
  expect(result.current.gap).toBe("2.7");
  act(() => result.current.commitGap());
  expect(state.execute).not.toHaveBeenCalled();
});
it("does not carry a gap draft to another widget with the same saved value", () => {
  const item = instance("pedals");
  const { result, rerender } = renderHook(
    ({ item }) => useDrivingContent(item),
    { initialProps: { item } },
  );
  act(() => result.current.editGap(""));
  rerender({ item: { ...item, id: "widget-2" } });
  expect(result.current.gap).toBe("2");
  expect(result.current.gapError).toBe(false);
  expect(state.execute).not.toHaveBeenCalled();
});
it.each(["protected", "missing"])(
  "does not present defaults or write with %s",
  (status) => {
    state.view.state = status;
    const { result } = renderHook(() => useDrivingContent(instance()));
    expect(result.current.settings).toBeNull();
    act(() => result.current.setReference("leader"));
    expect(state.execute).not.toHaveBeenCalled();
  },
);
it.each(["locked", "unverified", "pending"])(
  "blocks all writes when %s",
  (reason) => {
    const item = instance("pedals");
    item.locked = reason === "locked";
    state.pending = reason === "pending";
    if (reason === "unverified") state.view.plan = "unverified";
    const { result } = renderHook(() => useDrivingContent(item));
    act(() => {
      result.current.editGap("12");
      result.current.setBrakePeak(false);
    });
    act(() => result.current.commitGap());
    expect(state.execute).not.toHaveBeenCalled();
  },
);
it("does not write automatically when a fresh conflict view arrives", () => {
  const { result, rerender } = renderHook(() => useDrivingContent(instance()));
  state.view.revision = "f".repeat(64);
  rerender();
  expect(state.execute).not.toHaveBeenCalled();
  act(() => result.current.setReference("leader"));
  expectPatch({ kind: "delta", reference: "leader" });
});
it("does not expose mismatched settings", () => {
  const item = instance();
  item.settings = instance("pedals").settings;
  const { result } = renderHook(() => useDrivingContent(item));
  expect(result.current.settings).toBeNull();
});
