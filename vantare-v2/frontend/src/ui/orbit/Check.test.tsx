import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Check } from "./Check";

describe("Orbit Check", () => {
  afterEach(() => cleanup());

  it("expone role checkbox con aria-checked y alterna", () => {
    const onChange = vi.fn();
    render(<Check checked={false} label="Diagnóstico" onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Diagnóstico" });
    expect(box.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("no usa `input` nativo ni `title`", () => {
    const { container } = render(
      <Check checked label="Registros">
        <b>Registros</b>
        <span>Se adjuntan al informe</span>
      </Check>,
    );
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelectorAll("[title]")).toHaveLength(0);
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
  });

  it("deshabilitado no dispara onChange", () => {
    const onChange = vi.fn();
    render(<Check checked={false} disabled label="Replay" onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Replay" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
