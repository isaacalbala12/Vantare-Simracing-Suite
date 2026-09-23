import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WidgetVisualHost } from "../../core/WidgetVisualHost";
import { buildAuthoringV2ScenarioRuntime } from "../../authoring/fixtures/authoring-v2-scenario-fixture";
import { fastestLapDefinition } from "./fastest-lap-definition";
import { deriveStudioCatalog } from "../../../hub/overlay-studio/catalog/studio-catalog";
import { parseProfileDocumentV3 } from "../../core/profile-document";

const widget = fastestLapDefinition.createDefault("lap-notice");
const seed = buildAuthoringV2ScenarioRuntime({ widget: "fastest-lap", system: "vantare-functional", state: "ready", session: "race", location: "track", variant: "default" });
function runtime(sequence: number, best: number) {
  const frame = seed.overlayV2Frame!;
  return { ...seed, overlayV2Frame: { ...frame, sequence, standings: frame.standings.map(row => ({
    ...row, driver: row.id === frame.player.id ? "Isaac Albala" : row.driver,
    bestLap: { q: "fresh" as const, v: row.id === frame.player.id ? best : 120 },
  })) } };
}
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

describe("fastest lap through the shared host", () => {
  it.each(["desktop", "obs"] as const)("shows a new record in %s, hides on expiry and cleans up in StrictMode", renderMode => {
    vi.useFakeTimers();
    const draw = (sequence: number, best: number) => <StrictMode><WidgetVisualHost widget={widget} renderMode={renderMode} runtime={runtime(sequence, best)} /></StrictMode>;
    const view = render(draw(1, 90));
    expect(view.queryByRole("status")).toBeNull();
    view.rerender(draw(2, 89));
    expect(view.getByRole("status").textContent).toContain("1:29.000");
    expect(view.getByRole("status").textContent).toContain("Isaac Albala");
    act(() => vi.advanceTimersByTime(6000));
    expect(view.queryByRole("status")).toBeNull();
    view.rerender(draw(3, 88));
    expect(view.getByRole("status").textContent).toContain("1:28.000");
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("allows positioning the current record in Studio without creating a live alert", () => {
    const view = render(<WidgetVisualHost widget={widget} renderMode="studio" runtime={runtime(1, 90)} />);
    expect(view.getByRole("status").getAttribute("aria-live")).toBe("off");
    expect(view.getByRole("status").textContent).toContain("1:30.000");
  });
  it("restarts the entry on consecutive records, and exposes an exit phase before removal", () => {
    vi.useFakeTimers();
    const draw = (sequence: number, best: number) => <WidgetVisualHost widget={widget} renderMode="desktop" runtime={runtime(sequence, best)} />;
    const view = render(draw(1, 90));
    view.rerender(draw(2, 89));
    const first = view.getByRole("status");
    view.rerender(draw(3, 88));
    const second = view.getByRole("status");
    expect(second).not.toBe(first);
    expect(second.dataset.noticePhase).toBe("visible");
    act(() => vi.advanceTimersByTime(5780));
    expect(view.getByRole("status")).toBe(second);
    expect(second.dataset.noticePhase).toBe("leaving");
    act(() => vi.advanceTimersByTime(220));
    expect(view.queryByRole("status")).toBeNull();
  });
  it("lets the Workshop replay transient notices in Studio and return to a static design", () => {
    vi.useFakeTimers();
    const draw = (sequence: number, best: number, authoringPlayback: boolean) => <WidgetVisualHost widget={widget} renderMode="studio" authoringPlayback={authoringPlayback} runtime={runtime(sequence, best)} />;
    const view = render(draw(1, 90, false));
    expect(view.getByRole("status").dataset.preview).toBe("true");
    view.rerender(draw(1, 90, true));
    expect(view.queryByRole("status")).toBeNull();
    view.rerender(draw(2, 89, true));
    expect(view.getByRole("status").dataset.preview).toBeUndefined();
    act(() => vi.advanceTimersByTime(6000));
    expect(view.queryByRole("status")).toBeNull();
    view.rerender(draw(2, 89, false));
    expect(view.getByRole("status").textContent).toContain("1:29.000");
  });
  it("registers an Efficiency-only premium widget and accepts it in a saved profile", () => {
    const entry = deriveStudioCatalog().find(item => item.type === "fastest-lap");
    expect(entry?.requiredFeature).toBe("overlays.advanced");
    expect(entry?.compatibleSystems.map(system => system.systemId)).toEqual(["vantare-functional"]);
    const resized = { ...widget, layout: { ...widget.layout, w: 360, h: 80, aspectLocked: false } };
    const document = {
      schemaVersion: 3, id: "lap-profile", name: "Lap profile", displayMode: "racing",
      monitorIndex: 0, layouts: { general: { type: "general", widgets: [resized] } },
    };
    expect(parseProfileDocumentV3(JSON.parse(JSON.stringify(document))).layouts.general.widgets).toEqual([resized]);
  });
});
