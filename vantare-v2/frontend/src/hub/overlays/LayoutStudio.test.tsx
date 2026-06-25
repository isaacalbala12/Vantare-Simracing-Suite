import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LayoutStudio } from "./LayoutStudio";
import type { ProfileConfig } from "../../lib/profile";

const profile: ProfileConfig = {
  id: "default-racing",
  name: "Default Racing",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [
    { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
  ],
};

describe("LayoutStudio", () => {
  it("renders layout studio and hides appearance controls", () => {
    render(
      <LayoutStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={false}
        saveState="idle"
        overlayRunning={false}
        onStartOverlay={vi.fn()}
        onStopOverlay={vi.fn()}
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText("Perfiles Específicos")).toBeTruthy();
    expect(screen.queryByText("APARIENCIA")).toBeNull();
    expect(screen.getByText("POSICIÓN Y TAMAÑO")).toBeTruthy();
  });

  it("hides danger actions while no callbacks are wired", () => {
    render(
      <LayoutStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={false}
        saveState="idle"
        overlayRunning={false}
        onStartOverlay={vi.fn()}
        onStopOverlay={vi.fn()}
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.queryByText("Duplicar")).toBeNull();
    expect(screen.queryByText("Reset posicion")).toBeNull();
    expect(screen.queryByText("Eliminar")).toBeNull();
  });

  it("starts overlay from layout studio when there are no unsaved changes", () => {
    const onStartOverlay = vi.fn();

    const { container } = render(
      <LayoutStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={false}
        saveState="idle"
        overlayRunning={false}
        onStartOverlay={onStartOverlay}
        onStopOverlay={vi.fn()}
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />
    );

    // Click the "Abrir overlay" button in the header actions block
    const btn = container.querySelector(".flex.items-center.gap-3 button.btn-primary") as HTMLButtonElement;
    fireEvent.click(btn);

    expect(onStartOverlay).toHaveBeenCalledTimes(1);
  });

  it("disables start overlay while dirty or saving", () => {
    const { container, rerender } = render(
      <LayoutStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={true}
        saveState="idle"
        overlayRunning={false}
        onStartOverlay={vi.fn()}
        onStopOverlay={vi.fn()}
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />
    );

    const getStartButton = () => container.querySelector(".flex.items-center.gap-3 button.btn-primary") as HTMLButtonElement;
    expect(getStartButton().disabled).toBe(true);

    rerender(
      <LayoutStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={false}
        saveState="saving"
        overlayRunning={false}
        onStartOverlay={vi.fn()}
        onStopOverlay={vi.fn()}
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(getStartButton().disabled).toBe(true);
  });

  it("stops overlay from layout studio while running", () => {
    const onStopOverlay = vi.fn();

    const { container } = render(
      <LayoutStudio
        profile={profile}
        selectedWidgetId="delta"
        dirty={true}
        saveState="idle"
        overlayRunning={true}
        onStartOverlay={vi.fn()}
        onStopOverlay={onStopOverlay}
        onSelectWidget={vi.fn()}
        onChangeProfile={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />
    );

    // The Detener overlay button is styled as btn-secondary in the header actions block
    // Guardar button is index 0, Detener overlay is index 1.
    const btns = container.querySelectorAll(".flex.items-center.gap-3 button.btn-secondary");
    const stopBtn = btns[1] as HTMLButtonElement;
    fireEvent.click(stopBtn);

    expect(onStopOverlay).toHaveBeenCalledTimes(1);
  });
});
