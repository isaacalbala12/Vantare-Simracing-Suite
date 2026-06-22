import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import type { ProfileConfig } from "../../lib/profile";
import { WidgetSettingsPanel } from "./WidgetSettingsPanel";

afterEach(() => {
  cleanup();
});

const profile: ProfileConfig = {
  schemaVersion: 2,
  id: "test-profile",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [
    {
      id: "relative",
      type: "relative",
      variantId: "variant-relative-default",
      enabled: true,
      updateHz: 15,
      position: { x: 40, y: 40, w: 300, h: 250 },
      props: { rangeAhead: 3, rangeBehind: 3 },
    },
  ],
  variants: [
    {
      id: "variant-relative-default",
      widgetType: "relative",
      templateId: "relative-vantare-default",
      filters: { rangeAhead: 3, rangeBehind: 4, includePlayer: true, rowHeightMode: "compact" },
    },
  ],
};

describe("WidgetSettingsPanel", () => {
  it("keeps relative controls accessible inside a scrolling settings panel", () => {
    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={profile.widgets[0]}
        onChangeProfile={vi.fn()}
      />,
    );

    const panel = screen.getByTestId("widget-settings-panel");
    expect(panel.className).toContain("overflow-y-auto");
    expect(screen.getByText("COLUMNAS RELATIVE")).toBeTruthy();
    expect(screen.getByText("Filtros")).toBeTruthy();
  });
});
