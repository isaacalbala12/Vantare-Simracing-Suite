import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Accordion,
  Button,
  Kbd,
  Menu,
  Seg,
  Toggle,
  ToastProvider,
  Tooltip,
  UnderlineTabs,
  useToast,
} from "./index";

describe("Orbit kit · primitivos", () => {
  it("el toggle expone aria-pressed y alterna", () => {
    function Host() {
      const [on, setOn] = useState(false);
      return <Toggle label="Rejilla" onChange={setOn} pressed={on} />;
    }
    render(<Host />);
    const toggle = screen.getByRole("button", { name: "Rejilla" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("el segmentado marca la opción activa con aria-pressed y respeta disabled", () => {
    const onChange = vi.fn();
    render(
      <Seg
        label="Fuente"
        onChange={onChange}
        options={[
          { value: "mock", label: "Mock" },
          { value: "live", label: "Live" },
          { value: "rec", label: "Grabado", disabled: true },
        ]}
        value="mock"
      />,
    );
    expect(screen.getByRole("button", { name: "Mock" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Live" }).getAttribute("aria-pressed")).toBe("false");
    expect((screen.getByRole("button", { name: "Grabado" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(onChange).toHaveBeenCalledWith("live");
  });

  it("el botón se deshabilita con disabled, loading y state=saved", () => {
    const { rerender } = render(<Button disabled>Guardar</Button>);
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<Button loading>Guardar</Button>);
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<Button state="saved">Guardar</Button>);
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<Button state="dirty">Guardar</Button>);
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("ningún primitivo usa el `title` nativo", () => {
    const { container } = render(
      <>
        <Button icon="i-studio">Con icono</Button>
        <Kbd keys={["Ctrl", "K"]} />
      </>,
    );
    expect(container.querySelectorAll("[title]")).toHaveLength(0);
  });
});

describe("Orbit kit · contenedores", () => {
  it("las pestañas subrayadas exponen aria-selected", () => {
    function Host() {
      const [tab, setTab] = useState("a");
      return (
        <UnderlineTabs
          label="Secciones"
          onChange={setTab}
          tabs={[
            { id: "a", label: "Resumen" },
            { id: "b", label: "Stints" },
          ]}
          value={tab}
        />
      );
    }
    render(<Host />);
    expect(screen.getByRole("tab", { name: "Resumen" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Stints" }));
    expect(screen.getByRole("tab", { name: "Stints" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Resumen" }).getAttribute("aria-selected")).toBe("false");
  });

  it("el acordeón refleja aria-expanded y avisa al abrirse", () => {
    const onToggle = vi.fn();
    render(
      <Accordion onToggle={onToggle} summary="16 px" title="Tipografía">
        <p>cuerpo</p>
      </Accordion>,
    );
    const summary = screen.getByText("Tipografía").closest("summary")!;
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(summary);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("el menú marca aria-expanded en el disparador y cierra con Esc", () => {
    render(
      <Menu
        items={[{ id: "dup", title: "Duplicar", description: "Copia", onSelect: () => {} }]}
        label="Acciones"
        trigger={<button type="button">Abrir</button>}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Abrir" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(within(screen.getByRole("menu")).getByText("Duplicar")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("el tooltip se muestra con hover y con foco, sin `title` nativo", () => {
    render(
      <Tooltip side="top" text="Abrir paleta">
        <button type="button">Paleta</button>
      </Tooltip>,
    );
    const button = screen.getByRole("button", { name: "Paleta" });
    expect(button.getAttribute("data-tip")).toBe("Abrir paleta");
    expect(button.hasAttribute("title")).toBe(false);
    expect(button.hasAttribute("data-tip-open")).toBe(false);

    fireEvent.mouseEnter(button);
    expect(button.getAttribute("data-tip-open")).toBe("true");
    fireEvent.mouseLeave(button);
    expect(button.hasAttribute("data-tip-open")).toBe(false);

    fireEvent.focus(button);
    expect(button.getAttribute("data-tip-open")).toBe("true");
    fireEvent.blur(button);
    expect(button.hasAttribute("data-tip-open")).toBe(false);
  });
});

describe("Orbit kit · toasts", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function ToastHost() {
    const toast = useToast();
    return (
      <button onClick={() => toast.show("Guardado", "Perfil")} type="button">
        lanzar
      </button>
    );
  }

  it("apila como máximo 3 toasts y los cierra a los 2,6 s", () => {
    render(
      <ToastProvider>
        <ToastHost />
      </ToastProvider>,
    );
    const trigger = screen.getByRole("button", { name: "lanzar" });
    for (let index = 0; index < 5; index += 1) fireEvent.click(trigger);

    const region = screen.getByTestId("orbit-toasts");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.querySelectorAll(".orbit-toast")).toHaveLength(3);

    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(region.querySelectorAll(".orbit-toast")).toHaveLength(0);
  });
});
