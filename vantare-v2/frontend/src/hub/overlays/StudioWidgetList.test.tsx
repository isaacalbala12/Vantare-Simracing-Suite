import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { StudioWidgetList } from "./StudioWidgetList";
import type { WidgetConfig } from "../../lib/profile";

afterEach(() => {
  cleanup();
});

const widgets: WidgetConfig[] = [
  { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 0, y: 0, w: 400, h: 48 } },
  { id: "relative", type: "relative", enabled: false, updateHz: 15, position: { x: 0, y: 80, w: 320, h: 280 } },
];

describe("StudioWidgetList", () => {
  it("renders widgets and selects one", () => {
    const onSelectWidget = vi.fn();
    render(<StudioWidgetList widgets={widgets} selectedWidgetId="delta" onSelectWidget={onSelectWidget} />);

    fireEvent.click(screen.getByRole("button", { name: /relative/i }));

    expect(onSelectWidget).toHaveBeenCalledWith("relative");
  });

  it("filters active widgets", () => {
    render(<StudioWidgetList widgets={widgets} selectedWidgetId="delta" onSelectWidget={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Activos" }));

    expect(screen.getAllByText("delta").length).toBeGreaterThan(0);
    expect(screen.queryByText("relative")).toBeNull();
  });

  it("searches by id and type", () => {
    render(<StudioWidgetList widgets={widgets} selectedWidgetId="delta" onSelectWidget={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Buscar overlay..."), { target: { value: "rel" } });

    expect(screen.queryByText("delta")).toBeNull();
    expect(screen.getAllByText("relative").length).toBeGreaterThan(0);
  });

  it("no renderiza '+ Añadir widget' si no recibe la prop onAddWidget", () => {
    render(<StudioWidgetList widgets={widgets} selectedWidgetId="delta" onSelectWidget={vi.fn()} />);
    expect(screen.queryByTestId("studio-show-add-widget")).toBeNull();
  });

  it("renderiza '+ Añadir widget' si recibe la prop onAddWidget", () => {
    render(<StudioWidgetList widgets={widgets} selectedWidgetId="delta" onSelectWidget={vi.fn()} onAddWidget={vi.fn()} />);
    expect(screen.getByTestId("studio-show-add-widget")).toBeTruthy();
  });

  it("permite añadir un widget de tipo pedals", () => {
    const onAddWidget = vi.fn();
    render(<StudioWidgetList widgets={widgets} selectedWidgetId="delta" onSelectWidget={vi.fn()} onAddWidget={onAddWidget} />);

    // Abrir formulario
    fireEvent.click(screen.getByTestId("studio-show-add-widget"));
    expect(screen.getByTestId("studio-add-widget-form")).toBeTruthy();

    // Seleccionar pedals y confirmar
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "pedals" } });
    fireEvent.click(screen.getByTestId("studio-confirm-add-widget"));

    expect(onAddWidget).toHaveBeenCalledWith("pedals");
    // Formulario se cierra
    expect(screen.queryByTestId("studio-add-widget-form")).toBeNull();
  });

  it("permite cancelar la acción de añadir widget", () => {
    render(<StudioWidgetList widgets={widgets} selectedWidgetId="delta" onSelectWidget={vi.fn()} onAddWidget={vi.fn()} />);

    // Abrir formulario
    fireEvent.click(screen.getByTestId("studio-show-add-widget"));
    expect(screen.getByTestId("studio-add-widget-form")).toBeTruthy();

    // Cancelar
    fireEvent.click(screen.getByTestId("studio-cancel-add-widget"));
    expect(screen.queryByTestId("studio-add-widget-form")).toBeNull();
    expect(screen.getByTestId("studio-show-add-widget")).toBeTruthy();
  });
});
