import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProfileConfig, WidgetConfig } from "../lib/profile";
import { WidgetHost } from "./WidgetHost";
import { getWidgetBaseSize } from "./widgets/widget-base-size";

afterEach(() => cleanup());

function widget(overrides: Partial<WidgetConfig> = {}): WidgetConfig {
  return {
    id: "rel",
    type: "relative",
    enabled: true,
    updateHz: 15,
    position: { x: 10, y: 20, w: 300, h: 200 },
    ...overrides,
  };
}

function profileWith(widget: WidgetConfig): ProfileConfig {
  return { id: "p", name: "P", displayMode: "racing", monitorIndex: 0, widgets: [widget] };
}

describe("WidgetHost", () => {
  it("renders children directly for unsupported widget types (no scaler)", () => {
    const w = widget({ id: "d", type: "delta" });
    render(
      <WidgetHost id="d" position={{ x: 10, y: 20, w: 400, h: 48 }} widget={w} profile={profileWith(w)}>
        <div data-testid="child" />
      </WidgetHost>,
    );
    expect(screen.queryByTestId("widget-host-scaler")).toBeNull();
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("wraps relative children with a transform scale wrapper", () => {
    const w = widget();
    render(
      <WidgetHost id="rel" position={w.position} widget={w} profile={profileWith(w)}>
        <div data-testid="child" />
      </WidgetHost>,
    );
    const scaler = screen.getByTestId("widget-host-scaler");
    expect(scaler).toBeTruthy();
    const style = scaler.style;
    expect(style.transform).toContain("scale(");
    expect(style.transformOrigin).toBe("top left");
  });

  it("wraps standings children with a transform scale wrapper", () => {
    const w = widget({ id: "st", type: "standings" });
    render(
      <WidgetHost id="st" position={w.position} widget={w} profile={profileWith(w)}>
        <div data-testid="child" />
      </WidgetHost>,
    );
    expect(screen.getByTestId("widget-host-scaler")).toBeTruthy();
  });

  it("normalizes standings height when position is deformed", () => {
    const w = widget({ id: "st", type: "standings", position: { x: 10, y: 20, w: 400, h: 100 } });
    const profile = profileWith(w);
    const baseSize = getWidgetBaseSize("standings", w, profile);
    expect(baseSize).not.toBeNull();
    const expectedH = Math.round(400 * baseSize!.height / baseSize!.width);

    render(
      <WidgetHost id="st" position={w.position} widget={w} profile={profile}>
        <div data-testid="child" />
      </WidgetHost>,
    );

    const scaler = screen.getByTestId("widget-host-scaler");
    const hostDiv = scaler.parentElement;
    expect(parseInt(hostDiv!.style.height, 10)).toBe(expectedH);
  });

  it("keeps original height for unsupported widget types", () => {
    const w = widget({ id: "d", type: "delta", position: { x: 10, y: 20, w: 400, h: 48 } });
    render(
      <WidgetHost id="d" position={w.position} widget={w} profile={profileWith(w)}>
        <div data-testid="child" />
      </WidgetHost>,
    );

    const child = screen.getByTestId("child");
    const hostDiv = child.parentElement;
    expect(parseInt(hostDiv!.style.height, 10)).toBe(48);
  });
});
