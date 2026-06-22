import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WidgetStudio } from "./WidgetStudio";
import type { ProfileConfig } from "../../lib/profile";

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
    expect(screen.getByText("Estos cambios se guardan en el perfil activo.")).toBeTruthy();
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

    fireEvent.click(screen.getByRole("button", { name: /Volver a Overlays Studio/i }));

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

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

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

    expect(screen.getByText("COLUMNAS RELATIVE")).toBeTruthy();
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
});
