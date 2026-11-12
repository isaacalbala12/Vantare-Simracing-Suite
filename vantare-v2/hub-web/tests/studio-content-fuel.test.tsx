// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type OverlayInstance,
  studioWidgetDefaults,
  studioWidgetOptions,
} from "../src/contract/generated/studio";
import { useFuelContent } from "../src/renderer/screens/studio/fuel-content";

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
function instance(): OverlayInstance {
  return {
    id: "widget-1",
    kind: "fuel-strategy",
    settings: {
      ...structuredClone(studioWidgetDefaults["fuel-strategy"]),
      designSystem: "eficiencia",
      historyRows: 4,
      showProjection: true,
    },
    visible: true,
    locked: false,
    opacity: 100,
    showIn: { practice: true, qualifying: true, race: true },
    offTrack: "inherit",
    size: { width: 300, height: 200 },
  };
}
function expectPatch(value: object) {
  expect(state.execute).toHaveBeenCalledExactlyOnceWith({
    method: "studio.instance",
    id: "widget-1",
    baseRevision: state.view.revision,
    patch: { field: "settings", value: { kind: "fuel-strategy", ...value } },
  });
}
it.each([1, 2, 3, 4, 5, 6, 7, 8])(
  "sends only historyRows=%s with the observed revision",
  (historyRows) => {
    const { result } = renderHook(() => useFuelContent(instance()));
    act(() => result.current.setRows(historyRows));
    expectPatch({ historyRows });
  },
);
it("projects the saved values and native allowed rows without writing", () => {
  const { result } = renderHook(() => useFuelContent(instance()));
  const { historyMin, historyMax, historyStep } = studioWidgetOptions.fuel;
  expect(result.current.rows).toEqual(
    Array.from(
      { length: (historyMax - historyMin) / historyStep + 1 },
      (_, index) => historyMin + index * historyStep,
    ),
  );
  expect(result.current.settings?.historyRows).toBe(4);
  expect(result.current.settings?.showProjection).toBe(true);
  expect(state.execute).not.toHaveBeenCalled();
});
it.each([true, false])("sends only showProjection=%s", (showProjection) => {
  const { result } = renderHook(() => useFuelContent(instance()));
  act(() => result.current.setProjection(showProjection));
  expectPatch({ showProjection });
});
it.each([0, 9, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects invalid row choice %s",
  (value) => {
    const { result } = renderHook(() => useFuelContent(instance()));
    act(() => result.current.setRows(value));
    expect(state.execute).not.toHaveBeenCalled();
  },
);
it.each(["protected", "missing"])(
  "has no user values or writes for %s",
  (status) => {
    state.view.state = status;
    const { result } = renderHook(() => useFuelContent(instance()));
    expect(result.current.settings).toBeNull();
    act(() => {
      result.current.setRows(8);
      result.current.setProjection(false);
    });
    expect(state.execute).not.toHaveBeenCalled();
  },
);
it.each(["locked", "unverified", "pending", "vantare"])(
  "blocks mutations when %s",
  (reason) => {
    const item = instance();
    item.locked = reason === "locked";
    state.pending = reason === "pending";
    if (reason === "unverified") state.view.plan = "unverified";
    if (reason === "vantare" && item.settings)
      item.settings.designSystem = "vantare";
    const { result } = renderHook(() => useFuelContent(item));
    act(() => {
      result.current.setRows(8);
      result.current.setProjection(false);
    });
    expect(state.execute).not.toHaveBeenCalled();
  },
);
it("uses a new view revision after the shared state receives a conflict", () => {
  const { result, rerender } = renderHook(() => useFuelContent(instance()));
  state.view.revision = "f".repeat(64);
  rerender();
  expect(state.execute).not.toHaveBeenCalled();
  act(() => result.current.setProjection(false));
  expectPatch({ showProjection: false });
});
it("does not project mismatched settings", () => {
  const item = instance();
  item.kind = "delta";
  const { result } = renderHook(() => useFuelContent(item));
  expect(result.current.settings).toBeNull();
});
