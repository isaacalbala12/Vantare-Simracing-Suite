import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Select, type SelectOption } from "./Select";

const OPTIONS: SelectOption<string>[] = [
  { value: "crystal", label: "Crystal" },
  { value: "original", label: "Original" },
  { value: "endurance", label: "Endurance", disabled: true },
  { value: "neo", label: "Neo" },
];

function Host(props: { options?: SelectOption<string>[]; onChange?: (v: string) => void }) {
  const [value, setValue] = useState("crystal");
  return (
    <Select
      label="Sistema"
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
      options={props.options ?? OPTIONS}
      value={value}
    />
  );
}

function trigger() {
  return screen.getByRole("combobox", { name: "Sistema" });
}

describe("Orbit Select · desplegable propio", () => {
  afterEach(() => cleanup());

  it("no usa el `select` nativo y expone el contrato ARIA del combobox", () => {
    const { container } = render(<Host />);
    expect(container.querySelector("select")).toBeNull();
    const button = trigger();
    expect(button.tagName).toBe("BUTTON");
    expect(button.className).toContain("orbit-select");
    expect(button.getAttribute("aria-haspopup")).toBe("listbox");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.textContent).toContain("Crystal");
    expect(container.querySelectorAll("[title]")).toHaveLength(0);
  });

  it("abre la lista con clic y marca la opción activa", () => {
    render(<Host />);
    fireEvent.click(trigger());
    const list = screen.getByRole("listbox", { name: "Sistema" });
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    const options = within(list).getAllByRole("option");
    expect(options).toHaveLength(4);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    expect(options[2].getAttribute("aria-disabled")).toBe("true");
  });

  it("selecciona con clic y cierra", () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("option", { name: "Original" }));
    expect(onChange).toHaveBeenCalledWith("original");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger().textContent).toContain("Original");
  });

  it("no selecciona opciones deshabilitadas", () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("option", { name: "Endurance" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("navega con ↑↓ Home End y confirma con Enter saltando las deshabilitadas", () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    const button = trigger();
    fireEvent.keyDown(button, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(button, { key: "ArrowDown" });
    fireEvent.keyDown(button, { key: "ArrowDown" });
    // Crystal → Original → (Endurance deshabilitada) → Neo
    fireEvent.keyDown(button, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("neo");

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "Home" });
    fireEvent.keyDown(trigger(), { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("crystal");

    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(trigger(), { key: "End" });
    fireEvent.keyDown(trigger(), { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("neo");
  });

  it("cierra con Esc y devuelve el foco al trigger", () => {
    render(<Host />);
    fireEvent.click(trigger());
    fireEvent.keyDown(trigger(), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("cierra con clic fuera", () => {
    render(<Host />);
    fireEvent.click(trigger());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("typeahead: escribir salta a la opción cuya etiqueta empieza igual", () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    fireEvent.keyDown(trigger(), { key: "n" });
    expect(onChange).toHaveBeenCalledWith("neo");
  });

  it("pinta el slot leading y el tick de la opción activa", () => {
    render(
      <Host
        options={[
          { value: "crystal", label: "Ana", leading: <i data-testid="dot-ana" /> },
          { value: "diego", label: "Diego", leading: <i data-testid="dot-diego" /> },
        ]}
      />,
    );
    fireEvent.click(trigger());
    expect(screen.getByTestId("dot-diego")).toBeTruthy();
    const selected = screen
      .getAllByRole("option")
      .find((node) => node.getAttribute("aria-selected") === "true");
    expect(selected?.querySelector(".orbit-select__tick")?.textContent).toBe("✓");
  });

  it("agrupa opciones cuando llevan `group`", () => {
    render(
      <Host
        options={[
          { value: "a", label: "Uno", group: "Míos" },
          { value: "b", label: "Dos", group: "Vantare" },
        ]}
      />,
    );
    fireEvent.click(trigger());
    const list = screen.getByRole("listbox");
    expect(within(list).getByText("Míos")).toBeTruthy();
    expect(within(list).getByText("Vantare")).toBeTruthy();
  });

  it("no abre cuando está deshabilitado", () => {
    render(
      <Select
        disabled
        label="Sistema"
        onChange={() => {}}
        options={OPTIONS}
        value="crystal"
      />,
    );
    const button = trigger();
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(button, { key: "ArrowDown" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("mantiene la vía nativa con `native`", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Select label="Sistema" native onChange={onChange} options={OPTIONS} value="crystal" />,
    );
    const native = container.querySelector("select");
    expect(native).toBeTruthy();
    fireEvent.change(native as HTMLSelectElement, { target: { value: "original" } });
    expect(onChange).toHaveBeenCalledWith("original");
  });

  it("aplica el ancho pedido con la variable del kit", () => {
    render(<Select label="Perfil" onChange={() => {}} options={OPTIONS} value="crystal" width={260} />);
    expect(screen.getByRole("combobox", { name: "Perfil" }).getAttribute("style")).toContain(
      "--orbit-select-w: 260px",
    );
  });
});
