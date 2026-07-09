import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { LayoutStudio } from "./LayoutStudio";
import type { ProfileConfig } from "../../lib/profile";

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
  it("renders layout studio with widget settings panel when widget selected", () => {
    render(<LayoutStudio {...defaultProps} />);

    expect(screen.getByText("Perfiles Específicos")).toBeTruthy();
    // WidgetSettingsPanel renders appearance controls (style selector, etc.)
    expect(screen.getByTestId("widget-settings-panel")).toBeTruthy();
  });

  it("shows placeholder when no widget selected", () => {
    render(<LayoutStudio {...defaultProps} selectedWidgetId={null} />);

    expect(screen.getByText("Perfiles Específicos")).toBeTruthy();
    expect(screen.getByText("Selecciona un widget para editar")).toBeTruthy();
    expect(screen.queryByTestId("widget-settings-panel")).toBeNull();
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

    // Confirmar pedals — use the first combobox (the add widget select, not WidgetSettingsPanel selects)
    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    const addWidgetSelect = selects[0];
    fireEvent.change(addWidgetSelect, { target: { value: "pedals" } });
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

  it("renders a design system selector reflecting the active design", () => {
    render(<LayoutStudio {...defaultProps} />);

    expect(screen.getByTestId("design-system-selector")).toBeTruthy();
    const select = screen.getByLabelText("Diseño") as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe("base");
    expect(screen.getByRole("option", { name: "Base" })).toBeTruthy();
  });

  it("shows the active official design selected in the design selector", () => {
    const standingsProfile: ProfileConfig = {
      ...profile,
      widgets: [
        {
          id: "standings",
          type: "standings",
          enabled: true,
          updateHz: 15,
          variantId: "official-standings-vantare-crystal-standings",
          position: { x: 0, y: 0, w: 360, h: 300 },
        },
      ],
      variants: [
        {
          id: "official-standings-vantare-crystal-standings",
          widgetType: "standings",
          templateId: "standings-vantare-default",
          themeId: "vantare-crystal",
        },
      ],
    };

    render(
      <LayoutStudio
        {...defaultProps}
        profile={standingsProfile}
        selectedWidgetId="standings"
      />,
    );

    const select = screen.getByLabelText("Diseño") as HTMLSelectElement;
    expect(select.value).toBe("standings-vantare-crystal");
  });

  it("disables design selector when profile is synthetic", () => {
    const emptyProfile: ProfileConfig = {
      schemaVersion: 2,
      displayMode: "racing",
      monitorIndex: 0,
      widgets: [],
      variants: [],
      layouts: {},
    };
    render(
      <LayoutStudio
        {...defaultProps}
        profile={emptyProfile}
        selectedWidgetId={null}
      />,
    );
    const select = screen.getByRole("combobox", { name: /Diseño/i }) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
  });
});
