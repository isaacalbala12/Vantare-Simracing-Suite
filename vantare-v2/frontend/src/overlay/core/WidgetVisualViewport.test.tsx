import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WidgetVisualV3 } from "./profile-document";
import { WidgetVisualViewport } from "./WidgetVisualViewport";

afterEach(cleanup);

function visual(
  systemId: WidgetVisualV3["systemId"],
  templateId?: string,
): WidgetVisualV3 {
  return {
    systemId,
    systemVersion: 1,
    configVersion: 1,
    baseSettings: templateId ? { templateId } : {},
    appearanceOverrides: {},
  };
}

describe("WidgetVisualViewport", () => {
  it("gives Endurance Redline real CSS width when the standings widget widens", () => {
    render(
      <WidgetVisualViewport
        widgetType="standings"
        visual={visual("vantare-endurance", "standings-redline")}
        layout={{ w: 760, h: 560 }}
        testId="viewport"
      >
        <div />
      </WidgetVisualViewport>,
    );

    const viewport = screen.getByTestId("viewport");
    expect(viewport.dataset.widgetVisualBaseWidth).toBe("760");
    expect(viewport.style.width).toBe("760px");
    expect(viewport.style.transform).toBe("scale(1)");
  });

  it.each([
    ["Original", visual("vantare-original")],
    ["otro Endurance", visual("vantare-endurance", "standings-wec")],
  ])("keeps the fixed standings viewport for %s", (_label, selection) => {
    render(
      <WidgetVisualViewport
        widgetType="standings"
        visual={selection}
        layout={{ w: 780, h: 560 }}
        testId="viewport"
      >
        <div />
      </WidgetVisualViewport>,
    );

    const viewport = screen.getByTestId("viewport");
    expect(viewport.dataset.widgetVisualBaseWidth).toBe("520");
    expect(viewport.style.width).toBe("520px");
    expect(viewport.style.transform).toBe("scale(1.5)");
  });
});
