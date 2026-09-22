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
  it("registers an Efficiency-only premium widget and accepts it in a saved profile", () => {
    const entry = deriveStudioCatalog().find(item => item.type === "fastest-lap");
    expect(entry?.requiredFeature).toBe("overlays.advanced");
    expect(entry?.compatibleSystems.map(system => system.systemId)).toEqual(["vantare-functional"]);
    const document = {
      schemaVersion: 3, id: "lap-profile", name: "Lap profile", displayMode: "racing",
      monitorIndex: 0, layouts: { general: { type: "general", widgets: [widget] } },
    };
    expect(parseProfileDocumentV3(JSON.parse(JSON.stringify(document))).layouts.general.widgets).toEqual([widget]);
  });
});
