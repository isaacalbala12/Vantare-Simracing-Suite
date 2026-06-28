import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { LayoutStudio } from "./LayoutStudio";
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
  ],
};

const defaultProps = {
  profile,
  selectedWidgetId: "delta" as string | null,
  dirty: false,
  saveState: "idle" as const,
  overlayRunning: false,
  isActiveProfile: true,
  onStartOverlay: vi.fn(),
  onStopOverlay: vi.fn(),
  onSelectWidget: vi.fn(),
  onChangeProfile: vi.fn(),
  onSave: vi.fn(),
  onBack: vi.fn(),
};

describe("LayoutStudio", () => {
  it("renders layout studio and hides appearance controls", () => {
    render(<LayoutStudio {...defaultProps} />);

    expect(screen.getByText("Perfiles Específicos")).toBeTruthy();
    expect(screen.queryByText("APARIENCIA")).toBeNull();
    expect(screen.getByText("POSICIÓN Y TAMAÑO")).toBeTruthy();
  });

  it("hides danger actions while no callbacks are wired", () => {
    render(<LayoutStudio {...defaultProps} />);

    expect(screen.queryByText("Duplicar")).toBeNull();
    expect(screen.queryByText("Reset posicion")).toBeNull();
    expect(screen.queryByText("Eliminar")).toBeNull();
  });

  it("starts overlay from layout studio when there are no unsaved changes", () => {
    const onStartOverlay = vi.fn();

    const { container } = render(
      <LayoutStudio {...defaultProps} onStartOverlay={onStartOverlay} />,
    );

    // Click the "Abrir overlay" button in the header actions block
    const btn = container.querySelector(".flex.items-center.gap-3 button.btn-primary") as HTMLButtonElement;
    fireEvent.click(btn);

    expect(onStartOverlay).toHaveBeenCalledTimes(1);
  });

  it("disables start overlay while dirty or saving", () => {
    const { container, rerender } = render(
      <LayoutStudio {...defaultProps} dirty={true} />,
    );

    const getStartButton = () => container.querySelector(".flex.items-center.gap-3 button.btn-primary") as HTMLButtonElement;
    expect(getStartButton().disabled).toBe(true);

    rerender(
      <LayoutStudio {...defaultProps} dirty={false} saveState="saving" />,
    );

    expect(getStartButton().disabled).toBe(true);
  });

  it("stops overlay from layout studio while running", () => {
    const onStopOverlay = vi.fn();

    const { container } = render(
      <LayoutStudio {...defaultProps} dirty={true} overlayRunning={true} onStopOverlay={onStopOverlay} />,
    );

    // The Detener overlay button is styled as btn-secondary in the header actions block
    // Guardar button is index 0, Detener overlay is index 1.
    const btns = container.querySelectorAll(".flex.items-center.gap-3 button.btn-secondary");
    const stopBtn = btns[1] as HTMLButtonElement;
    fireEvent.click(stopBtn);

    expect(onStopOverlay).toHaveBeenCalledTimes(1);
  });

  it("renderiza el botón Añadir widget y propaga la llamada a onAddWidget", () => {
    const onAddWidget = vi.fn();
    render(<LayoutStudio {...defaultProps} onAddWidget={onAddWidget} />);

    // Abrir formulario
    fireEvent.click(screen.getByTestId("studio-show-add-widget"));
    expect(screen.getByTestId("studio-add-widget-form")).toBeTruthy();

    // Confirmar pedals
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "pedals" } });
    fireEvent.click(screen.getByTestId("studio-confirm-add-widget"));

    expect(onAddWidget).toHaveBeenCalledWith("pedals");
  });

  it("shows non-active banner when isActiveProfile is false", () => {
    render(<LayoutStudio {...defaultProps} isActiveProfile={false} />);

    expect(screen.getByText(/Este perfil no es el activo/)).toBeTruthy();
  });

  it("does not show non-active banner when isActiveProfile is true", () => {
    render(<LayoutStudio {...defaultProps} isActiveProfile={true} />);

    expect(screen.queryByText(/Este perfil no es el activo/)).toBeNull();
  });
});
