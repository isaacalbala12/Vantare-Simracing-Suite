import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import type { ProfileConfig } from "../../lib/profile";
import { WidgetSettingsPanel } from "./WidgetSettingsPanel";

vi.mock("@wailsio/runtime", () => ({
  Events: {
    Emit: vi.fn(),
    On: vi.fn().mockReturnValue(() => {}),
  },
}));

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
    expect(screen.getByText("Columnas relative")).toBeTruthy();
    expect(screen.getByText("Filtros")).toBeTruthy();
  });

  it("keeps standings controls accessible inside a scrolling settings panel", () => {
    const standingsProfile: ProfileConfig = {
      ...profile,
      widgets: [
        {
          id: "standings",
          type: "standings",
          variantId: "variant-standings-default",
          enabled: true,
          updateHz: 15,
          position: { x: 40, y: 80, w: 360, h: 300 },
        },
      ],
      variants: [
        {
          id: "variant-standings-default",
          widgetType: "standings",
          templateId: "standings-vantare-default",
        },
      ],
    };

    render(
      <WidgetSettingsPanel
        profile={standingsProfile}
        widget={standingsProfile.widgets[0]}
        onChangeProfile={vi.fn()}
      />,
    );

    const panel = screen.getByTestId("widget-settings-panel");
    expect(panel.className).toContain("overflow-y-auto");
    expect(screen.getByText("Columnas standings")).toBeTruthy();
    expect(screen.getByLabelText("Mostrar mejor vuelta standings")).toBeTruthy();
  });

  it("renders a sticky widget header with name, type and enabled status", () => {
    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={profile.widgets[0]}
        onChangeProfile={vi.fn()}
      />,
    );

    const header = screen.getByTestId("widget-settings-header");
    expect(header.className).toContain("sticky");
    expect(header.textContent).toContain("relative");
    expect(header.textContent).toContain("Activo");
  });

  it("does not render a sticky widget header when no widget is selected", () => {
    render(
      <WidgetSettingsPanel
        profile={profile}
        widget={null}
        onChangeProfile={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("widget-settings-header")).toBeNull();
  });

  it("shows pedals settings section for a pedals widget", () => {
    const pedalsProfile: ProfileConfig = {
      ...profile,
      widgets: [
        {
          id: "pedals",
          type: "pedals",
          enabled: true,
          updateHz: 30,
          position: { x: 40, y: 760, w: 90, h: 100 },
        },
      ],
    };

    render(
      <WidgetSettingsPanel
        profile={pedalsProfile}
        widget={pedalsProfile.widgets[0]}
        onChangeProfile={vi.fn()}
      />,
    );

    const panel = screen.getByTestId("widget-settings-panel");
    expect(panel.className).toContain("overflow-y-auto");
    expect(screen.getByText("Pedales")).toBeTruthy();
    expect(screen.getByLabelText("Acelerador (throttle)")).toBeTruthy();
  });
});
