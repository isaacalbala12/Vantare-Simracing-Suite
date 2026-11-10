import { Icon } from "../src/renderer/assets/icons/Icon";
// @vitest-environment jsdom

import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "../src/renderer/ui/Button";
import { Avatar, Callout, Table } from "../src/renderer/ui/Data";
import {
  Checkbox,
  Input,
  RadioGroup,
  Segmented,
  Slider,
  Switch,
  Tabs,
} from "../src/renderer/ui/Forms";
import { Sidebar } from "../src/renderer/ui/Frame";
import { Dialog, TooltipProvider } from "../src/renderer/ui/Layers";

function Demo() {
  const [value, setValue] = useState("a");
  return (
    <Segmented
      label="Densidad"
      value={value}
      onChange={setValue}
      options={[
        { value: "a", label: "Compacta" },
        { value: "b", label: "Cómoda" },
      ]}
    />
  );
}

function Radios() {
  const [value, setValue] = useState("a");
  return (
    <RadioGroup
      label="Tema"
      value={value}
      onChange={setValue}
      options={[
        { value: "a", label: "Oscuro" },
        { value: "b", label: "Claro" },
      ]}
    />
  );
}
function DemoTabs() {
  const [value, setValue] = useState("a");
  return (
    <Tabs
      label="Secciones"
      value={value}
      onChange={setValue}
      items={[
        { value: "a", label: "General", content: "Contenido general" },
        {
          value: "b",
          label: "Apariencia",
          content: "Contenido apariencia",
        },
      ]}
    />
  );
}

afterEach(cleanup);
describe("public component behavior", () => {
  it("preserves caller classes and custom dialog triggers", async () => {
    render(
      <Dialog
        title="Custom"
        description="Trigger"
        trigger={<Button className="custom">Abrir</Button>}
        closeLabel="Cerrar"
      >
        <Input label="Dato" />
      </Dialog>,
    );
    const button = screen.getByRole("button", { name: "Abrir" });
    expect(button.classList.contains("custom")).toBe(true);
    expect(button.querySelector("button")).toBeNull();
    await userEvent.click(button);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("keeps one sidebar tab stop when the active section is hidden and moves it with arrows, Home and End", async () => {
    render(
      <Sidebar
        label="Secciones"
        groups={[
          {
            label: "Principal",
            items: [
              { id: "a", label: "Inicio", icon: "i-panel" },
              { id: "b", label: "Ajustes", icon: "i-ajustes" },
            ],
          },
        ]}
        active="hidden"
        collapsed={false}
        onSelect={() => {}}
        footer={null}
      />,
    );
    const first = screen.getByRole("button", { name: "Inicio" }),
      last = screen.getByRole("button", { name: "Ajustes" });
    expect(first.tabIndex).toBe(0);
    first.focus();
    for (const [key, target] of [
      ["{ArrowDown}", last],
      ["{Home}", first],
      ["{End}", last],
      ["{ArrowUp}", first],
    ] as const) {
      await userEvent.keyboard(key);
      expect(document.activeElement).toBe(target);
      expect(target.tabIndex).toBe(0);
    }
    expect(last.tabIndex).toBe(-1);
  });
  it("toggles a checkbox with the keyboard and blocks a disabled one", async () => {
    const changed = vi.fn();
    render(
      <>
        <Checkbox label="Informes" onCheckedChange={changed} />
        <Checkbox label="Bloqueado" disabled onCheckedChange={changed} />
      </>,
    );
    screen.getByRole("checkbox", { name: "Informes" }).focus();
    await userEvent.keyboard(" ");
    expect(changed.mock.calls[0][0]).toBe(true);
    await userEvent.click(screen.getByRole("checkbox", { name: "Bloqueado" }));
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it("changes radio selection with arrow keys", async () => {
    render(<Radios />);
    screen.getByRole("radio", { name: "Oscuro" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(
      screen.getByRole("radio", { name: "Claro" }).getAttribute("aria-checked"),
    ).toBe("true");
  });
  it("activates tabs on arrow focus and supports Home/End", async () => {
    render(<DemoTabs />);
    screen.getByRole("tab", { name: "General" }).focus();
    for (const [key, label] of [
      ["{ArrowRight}", "Apariencia"],
      ["{Home}", "General"],
      ["{End}", "Apariencia"],
    ]) {
      await userEvent.keyboard(key);
      expect(
        screen.getByRole("tab", { name: label }).getAttribute("aria-selected"),
      ).toBe("true");
    }
  });
  it("preserves native icon geometry when sizing the outer SVG", () => {
    const { container } = render(<Icon name="i-panel" />);
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("20");
    expect(container.querySelector("rect")?.getAttribute("width")).toBe("12");
    expect(container.querySelector("rect")?.getAttribute("height")).toBe("11");
  });
  it("keeps the action name and blocks duplicate clicks while saving", async () => {
    const click = vi.fn();
    render(
      <Button busy onClick={click}>
        Guardar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(button);
    expect(click).not.toHaveBeenCalled();
  });
  it("associates field labels, descriptions and errors", () => {
    render(
      <Input
        label="Nombre"
        description="Nombre del piloto"
        error="Revisa el nombre"
      />,
    );
    const input = screen.getByRole("textbox", { name: "Nombre" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(
      screen.getByText("Revisa el nombre").id,
    );
  });
  it("retains confirmed switch state and rejects changes while pending", async () => {
    const changed = vi.fn();
    render(<Switch label="Inicio" checked pending onCheckedChange={changed} />);
    const control = screen.getByRole("switch", { name: "Inicio" });
    expect(control.getAttribute("aria-checked")).toBe("true");
    expect(control.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(screen.getByText("Inicio"));
    expect(changed).not.toHaveBeenCalled();
  });
  it("notifies a switch change with the user choice", async () => {
    const changed = vi.fn();
    render(<Switch label="Avisos" checked={false} onCheckedChange={changed} />);
    await userEvent.click(screen.getByRole("switch", { name: "Avisos" }));
    expect(changed.mock.calls[0][0]).toBe(true);
  });
  it("separates keyboard preview from slider commit", () => {
    const changed = vi.fn(),
      committed = vi.fn();
    render(
      <Slider
        label="Contraste"
        value={100}
        min={80}
        max={120}
        onChange={changed}
        onValueCommitted={committed}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Contraste" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(changed).toHaveBeenCalled();
    fireEvent.keyUp(slider, { key: "ArrowRight" });
    expect(committed).toHaveBeenCalled();
  });
  it("supports roving keyboard focus in segmented controls", async () => {
    render(<Demo />);
    const first = screen.getByRole("button", { name: "Compacta" });
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cómoda" }),
    );
    await userEvent.keyboard(" ");
    expect(
      screen
        .getByRole("button", { name: "Cómoda" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
  it("closes a dialog with Escape and returns focus to its trigger", async () => {
    render(
      <CSPProvider disableStyleElements>
        <TooltipProvider>
          <Dialog
            title="Cambios"
            description="Hay cambios pendientes"
            trigger="Abrir"
            closeLabel="Cerrar"
          >
            <Input label="Piloto" />
          </Dialog>
        </TooltipProvider>
      </CSPProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.getByRole("dialog", { name: "Cambios" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Abrir" }),
    );
  });
  it("announces errors and empty data without inventing rows", () => {
    render(
      <>
        <Callout title="Núcleo caído" tone="err" />
        <Table
          caption="Documentos"
          columns={[{ key: "name", label: "Nombre" }]}
          rows={[]}
          empty="Sin documentos"
        />
      </>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Núcleo caído");
    expect(screen.getByRole("table").textContent).toContain("Sin documentos");
  });
  it("does not request remote avatar images", () => {
    render(
      <Avatar
        label="Piloto"
        initials="QA"
        src="https://example.com/avatar.png"
      />,
    );
    expect(document.querySelector("img[src]")).toBeNull();
    expect(screen.getByText("QA")).toBeTruthy();
  });
});
