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
    expect(screen.getByText("Tipo: delta")).toBeTruthy();
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
});
