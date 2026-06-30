import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LauncherDock } from "./LauncherDock";

afterEach(() => cleanup());

describe("LauncherDock", () => {
  it("navigates to launcher from LMU shortcut", () => {
    const onNavigate = vi.fn();
    render(<LauncherDock onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /abrir launcher lmu/i }));
    expect(onNavigate).toHaveBeenCalledWith("launcher");
  });

  it("navigates to setup from OBS shortcut", () => {
    const onNavigate = vi.fn();
    render(<LauncherDock onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /configurar obs/i }));
    expect(onNavigate).toHaveBeenCalledWith("setup");
  });

  it("keeps future shortcuts disabled", () => {
    render(<LauncherDock onNavigate={vi.fn()} />);
    const addSim = screen.getByRole("button", { name: /añadir simulador/i });
    const addApp = screen.getByRole("button", { name: /añadir app/i });
    expect(addSim.hasAttribute("disabled")).toBe(true);
    expect(addApp.hasAttribute("disabled")).toBe(true);
  });
});
