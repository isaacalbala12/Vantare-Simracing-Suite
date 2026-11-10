import { Icon } from "../src/renderer/assets/icons/Icon";
// @vitest-environment jsdom

import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "../src/renderer/ui/Button";
import { Avatar, Callout, Table } from "../src/renderer/ui/Data";
import { Input, Segmented, Slider, Switch } from "../src/renderer/ui/Forms";
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

afterEach(cleanup);
describe("public component behavior", () => {
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
