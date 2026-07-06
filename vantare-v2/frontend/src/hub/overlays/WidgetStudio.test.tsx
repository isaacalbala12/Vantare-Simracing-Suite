import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WidgetStudio } from "./WidgetStudio";
import type { ProfileConfig } from "../../lib/profile";

vi.mock("@wailsio/runtime", () => ({
  Events: {
    Emit: vi.fn(),
    On: vi.fn().mockReturnValue(() => {}),
  },
}));
vi.mock("../../lib/access", () => ({
  useAccess: () => ({
    planLabel: "free",
    planStatus: "free",
    roles: [],
    isBlocked: false,
    isUnconfigured: false,
  }),
}));

afterEach(() => {
  cleanup();
});

const profile: ProfileConfig = {
  id: "default-racing",
  name: "Default Racing",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [
    { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
    { id: "relative", type: "relative", enabled: false, updateHz: 15, position: { x: 40, y: 600, w: 320, h: 280 } },
  ],
};

describe("WidgetStudio", () => {
  it("renders the Widget Studio view", () => {
    render(
      <WidgetStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("heading", { name: "Widgets" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Sin cambios")).toBeTruthy();
    expect(screen.getAllByText("delta").length).toBeGreaterThan(0);
  });

  it("calls onBack from the back button", () => {
    const onBack = vi.fn();
    render(
      <WidgetStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={onBack}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Overlays Studio/i }));

    expect(onBack).toHaveBeenCalled();
  });

  it("calls onSave from manual save button", () => {
    const onSave = vi.fn();
    render(
      <WidgetStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={true}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={onSave}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("widget-studio-save-btn"));

    expect(onSave).toHaveBeenCalled();
  });

  it("does not expose profile placement controls in Widget Studio", () => {
    render(
      <WidgetStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.queryByText("POSICIÓN Y TAMAÑO")).toBeNull();
    expect(screen.queryByLabelText("X (px)")).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
  });

  it("passes selected widget variants to the widget preview", async () => {
    const relativeProfile: ProfileConfig = {
      ...profile,
      schemaVersion: 2,
      widgets: [
        {
          id: "relative",
          type: "relative",
          variantId: "variant-relative-default",
          enabled: true,
          updateHz: 15,
          position: { x: 40, y: 600, w: 420, h: 280 },
        },
      ],
      variants: [
        {
          id: "variant-relative-default",
          widgetType: "relative",
          templateId: "relative-vantare-default",
          columns: [
            { id: "driverName", metricId: "driverName", enabled: true },
            { id: "bestLap", metricId: "bestLap", enabled: true },
          ],
        },
      ],
    };

    render(
      <WidgetStudio
        profile={relativeProfile}
        selectedWidgetId="relative"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByText("1:30.876")).toBeTruthy();
  });

  it("shows Relative column controls for the Relative widget", () => {
    const relativeProfile: ProfileConfig = {
      ...profile,
      schemaVersion: 2,
      widgets: [
        {
          id: "relative",
          type: "relative",
          variantId: "variant-relative-default",
          enabled: true,
          updateHz: 15,
          position: { x: 40, y: 600, w: 320, h: 280 },
        },
      ],
      variants: [
        {
          id: "variant-relative-default",
          widgetType: "relative",
          templateId: "relative-vantare-default",
        },
      ],
    };

    render(
      <WidgetStudio
        profile={relativeProfile}
        selectedWidgetId="relative"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("Columnas relative")).toBeTruthy();
    expect(screen.getByLabelText("Mostrar mejor vuelta")).toBeTruthy();
    expect(screen.getByLabelText("Mostrar última vuelta")).toBeTruthy();
    expect(screen.queryByText("POSICIÓN Y TAMAÑO")).toBeNull();
  });

  it("constrains the desktop grid row so tall settings do not inflate the preview area", () => {
    render(
      <WidgetStudio
        profile={profile}
        selectedWidgetId="relative"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const grid = screen.getByTestId("widget-studio-grid");
    expect(grid.className).toContain("lg:grid-rows-[1fr]");
  });

  it("uses a fixed viewport-height shell so preview centering matches the visible area", () => {
    render(
      <WidgetStudio
        profile={profile}
        selectedWidgetId="relative"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const grid = screen.getByTestId("widget-studio-grid");
    const shell = grid.parentElement;
    expect(shell?.className).toContain("h-[calc(100vh-3.5rem)]");
    expect(shell?.className).not.toContain("min-h-[calc(100vh-3.5rem)]");
  });

  it("shows a preview-only mock session selector when Standings is selected", () => {
    const standingsProfile: ProfileConfig = {
      ...profile,
      widgets: [
        { id: "standings", type: "standings", enabled: true, updateHz: 15, position: { x: 0, y: 0, w: 360, h: 300 } },
      ],
    };

    render(
      <WidgetStudio
        profile={standingsProfile}
        selectedWidgetId="standings"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("mock-session-selector")).toBeTruthy();
    expect(screen.getByTestId("mock-session-race")).toBeTruthy();
    expect(screen.getByTestId("mock-session-practice")).toBeTruthy();
    expect(screen.getByTestId("mock-session-qual")).toBeTruthy();
  });

  it("defaults the mock session selector to Carrera", async () => {
    const standingsProfile: ProfileConfig = {
      ...profile,
      widgets: [
        { id: "standings", type: "standings", enabled: true, updateHz: 15, position: { x: 0, y: 0, w: 360, h: 300 } },
      ],
    };

    render(
      <WidgetStudio
        profile={standingsProfile}
        selectedWidgetId="standings"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("mock-session-race").getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => {
      expect(screen.getByText("Leader")).toBeTruthy();
    });
  });

  it("switches the mock session scenario when clicking the selector", async () => {
    const standingsProfile: ProfileConfig = {
      ...profile,
      widgets: [
        { id: "standings", type: "standings", enabled: true, updateHz: 15, position: { x: 0, y: 0, w: 360, h: 300 } },
      ],
    };

    render(
      <WidgetStudio
        profile={standingsProfile}
        selectedWidgetId="standings"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("mock-session-practice"));

    expect(screen.getByTestId("mock-session-practice").getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => {
      expect(screen.getByText("1:29.823")).toBeTruthy();
    });
  });

  it("does not show the mock session selector for Relative", () => {
    const relativeProfile: ProfileConfig = {
      ...profile,
      widgets: [
        { id: "relative", type: "relative", enabled: true, updateHz: 15, position: { x: 0, y: 0, w: 320, h: 280 } },
      ],
    };

    render(
      <WidgetStudio
        profile={relativeProfile}
        selectedWidgetId="relative"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("mock-session-selector")).toBeNull();
  });

  it("does not mark the profile dirty when changing the mock session scenario", () => {
    const onChangeProfile = vi.fn();
    const standingsProfile: ProfileConfig = {
      ...profile,
      widgets: [
        { id: "standings", type: "standings", enabled: true, updateHz: 15, position: { x: 0, y: 0, w: 360, h: 300 } },
      ],
    };

    render(
      <WidgetStudio
        profile={standingsProfile}
        selectedWidgetId="standings"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={onChangeProfile}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("mock-session-practice"));

    expect(onChangeProfile).not.toHaveBeenCalled();
  });

  it("shows Standings column controls for the Standings widget", () => {
    const standingsProfile: ProfileConfig = {
      ...profile,
      schemaVersion: 2,
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
      <WidgetStudio
        profile={standingsProfile}
        selectedWidgetId="standings"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("Columnas standings")).toBeTruthy();
    expect(screen.getByLabelText("Mostrar mejor vuelta standings")).toBeTruthy();
    expect(screen.queryByText("POSICIÓN Y TAMAÑO")).toBeNull();
  });

  it("updates Standings variant columns from WidgetStudio without touching position", () => {
    const onChangeProfile = vi.fn();
    const standingsProfile: ProfileConfig = {
      ...profile,
      schemaVersion: 2,
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
      <WidgetStudio
        profile={standingsProfile}
        selectedWidgetId="standings"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={onChangeProfile}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Mostrar mejor vuelta standings" }));

    const next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    expect(next.widgets[0].position).toEqual(standingsProfile.widgets[0].position);
    expect(next.variants?.[0].columns?.find((column) => column.id === "bestLap")?.enabled).toBe(true);
  });

  it("shows a dirty save state with red accent and disables Save when not dirty", () => {
    const { rerender } = render(
      <WidgetStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const dirtyState = screen.getByTestId("widget-studio-save-state");
    expect(dirtyState.textContent).toContain("Cambios sin guardar");
    expect(dirtyState.className).toContain("text-vantare-red-400");
    expect((screen.getByTestId("widget-studio-save-btn") as HTMLButtonElement).disabled).toBe(false);

    rerender(
      <WidgetStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("widget-studio-save-state").textContent).toContain("Sin cambios");
    expect((screen.getByTestId("widget-studio-save-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("exposes the official design gallery inside WidgetStudio without position/tamaño controls", () => {
    const relativeProfile: ProfileConfig = {
      ...profile,
      widgets: [
        { id: "relative", type: "relative", enabled: true, updateHz: 15, position: { x: 10, y: 20, w: 320, h: 280 } },
      ],
    };

    render(
      <WidgetStudio
        profile={relativeProfile}
        selectedWidgetId="relative"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("widget-design-gallery")).toBeTruthy();
    expect(screen.getByTestId("widget-design-item-vantare-racing-essential")).toBeTruthy();
    expect(screen.queryByText("POSICIÓN Y TAMAÑO")).toBeNull();
    expect(screen.queryByLabelText("X (px)")).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
  });

  it("renders a design system selector", () => {
    render(
      <WidgetStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("design-system-selector")).toBeTruthy();
    const select = screen.getByLabelText("Diseño") as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe("base");
    expect(screen.getByText("Vantare Crystal")).toBeTruthy();
  });

  it("does not show position or size controls in WidgetStudio", () => {
    render(
      <WidgetStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={false}
        saveState="idle"
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.queryByText("POSICIÓN Y TAMAÑO")).toBeNull();
    expect(screen.queryByLabelText("X (px)")).toBeNull();
    expect(screen.queryByLabelText("Y (px)")).toBeNull();
    expect(screen.queryByLabelText("W (px)")).toBeNull();
    expect(screen.queryByLabelText("H (px)")).toBeNull();
  });
});
