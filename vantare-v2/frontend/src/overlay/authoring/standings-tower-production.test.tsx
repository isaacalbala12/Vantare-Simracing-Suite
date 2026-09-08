import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getOfficialDesign } from "../design-systems/official-designs";
import { applyWidgetDesign } from "../core/widget-design";
import { WidgetVisualViewport } from "../core/WidgetVisualViewport";
import { resolveStandingsRedlineFrameLayout } from "../widget-types/standings/standings-redline-layout";
import { StandingsEndurance } from "../design-systems/vantare-endurance/standings/StandingsEndurance";
import { buildStandingsViewModelV2 } from "../widget-types/standings/standings-view-model-v2";
import { standingsDefinition } from "../widget-types/standings/standings-definition";
import { StandingsContentInspector } from "../widget-types/standings/StandingsContentInspector";
import { createScenarioWidget, buildWorkshopFrameV2 } from "./fixtures/authoring-v2-workshop-frame";
import { REDLINE_TOWER_REFERENCE } from "./fixtures/redline-tower-reference";

afterEach(cleanup);
const settings = { templateId: "standings-redline", redlineTheme: "tower", redlineHeader: "current", redlineSelection: "glow", redlineSurfaceOpacity: .95 };
const original = () => createScenarioWidget({ widget: "standings", system: "vantare-endurance", variant: "default", designId: "standings-endurance-redline" });

describe("Redline Tower productive selection", () => {
  it("keeps row controls but explains unavailable column editing without changing content", () => {
    const widget = original();
    const content = structuredClone(widget.content);
    widget.visual.appearanceOverrides = settings;
    const { container, rerender } = render(<StandingsContentInspector widget={widget} />);
    expect(container.querySelector('[data-testid="studio-standings-row-count"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="studio-standings-tower-preview"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="studio-standings-columns"]')).toBeNull();
    expect(widget.content).toEqual(content);
    rerender(<StandingsContentInspector widget={original()} />);
    expect(container.querySelector('[data-testid="studio-standings-columns"]')).not.toBeNull();
  });
  it("offers an opt-in design without replacing the default or saved layout/content", () => {
    const design = getOfficialDesign("standings-endurance-redline-tower");
    expect(design?.visual).toMatchObject(settings);
    expect(design?.isDefault).not.toBe(true);
    expect(getOfficialDesign("standings-endurance-redline")?.isDefault).toBe(true);
    if (!design) throw new Error("Tower absent from catalog");
    const before = original();
    const after = applyWidgetDesign(before, design, "2026-09-08T19:00:00Z");
    expect(after.layout).toEqual(before.layout);
    expect(after.content).toEqual(before.content);
    expect(before.visual).not.toEqual(after.visual);
  });

  it.each([280, 340, 482, 650])("preserves a physical %ipx frame and all twelve complete rows", (width) => {
    const widget = original();
    widget.visual.appearanceOverrides = settings;
    widget.layout = { ...widget.layout, w: width, h: 1087 * width / 482 };
    expect(resolveStandingsRedlineFrameLayout(widget, widget.layout, 1920)).toEqual(widget.layout);
    const { container } = render(<WidgetVisualViewport widgetType="standings" visual={widget.visual} layout={widget.layout} testId="viewport">
      <StandingsEndurance model={REDLINE_TOWER_REFERENCE} settings={settings} layout={widget.layout} renderMode="desktop" />
    </WidgetVisualViewport>);
    const viewport = container.firstElementChild as HTMLElement;
    expect(viewport.style.width).toBe("482px");
    expect(Number.parseFloat(viewport.style.height)).toBeCloseTo(1087);
    expect(viewport.style.transform).toBe(`scale(${width / 482})`);
    expect(container.querySelectorAll("[data-standings-row]")).toHaveLength(12);
  });

  it("does not show a practice leader without a valid lap and uses only V2 metadata", () => {
    const runtime = buildWorkshopFrameV2({ widget: "standings", system: "vantare-endurance", variant: "default", session: "practice", location: "track", state: "ready" });
    const frame = runtime.overlayV2Frame!;
    frame.session.track = { q: "fresh", v: "MONZA" };
    frame.standings = frame.standings.map((row, i) => ({ ...row, number: i === 0 ? "007" : undefined, bestLap: { q: "missing" }, pit: "track" }));
    const model = buildStandingsViewModelV2(frame, { state: "live" }, standingsDefinition.parseContent({ rowCount: 2, classScope: "all-classes" }));
    expect(model.trackName).toBe("MONZA");
    expect(model.totalRows).toBe(frame.standings.length);
    expect(model.rows[0]?.driverNumber).toBe("007");
    expect(model.rows[0]?.classPosition).toBe(frame.standings[0]?.classPosition);
    expect(model.rows[1]?.driverNumber).toBe("");
    const { container } = render(<StandingsEndurance model={model} settings={settings} layout={{ ...original().layout, w: 482, h: 1087 }} renderMode="desktop" />);
    expect(container.querySelector(".ven-tower-gap")?.textContent).toBe("—");
    expect(container.querySelectorAll("[data-manufacturer]")).toHaveLength(0);
    expect(container.querySelector(".ven-tower-footer")?.textContent).toContain("MONZA");
  });
});
