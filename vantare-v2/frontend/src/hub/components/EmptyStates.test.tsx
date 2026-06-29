import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EmptyActivity } from "./EmptyActivity";
import { EmptyNextRace } from "./EmptyNextRace";
import { EmptyLauncher } from "./EmptyLauncher";

afterEach(() => {
  cleanup();
});

describe("EmptyActivity", () => {
  it("shows sin carreras registradas", () => {
    render(<EmptyActivity />);
    expect(screen.getByText(/sin carreras registradas/i)).toBeTruthy();
  });

  it("explains future behavior", () => {
    render(<EmptyActivity />);
    expect(screen.getByText(/LMU.*conectado/i)).toBeTruthy();
  });
});

describe("EmptyNextRace", () => {
  it("shows calendario no cargado", () => {
    render(<EmptyNextRace />);
    expect(screen.getByText(/no cargado todavía/i)).toBeTruthy();
  });

  it("has disabled import button", () => {
    render(<EmptyNextRace />);
    const btn = screen.getByText(/Importar calendario/i);
    expect(btn.closest("button")?.disabled).toBe(true);
  });
});

describe("EmptyLauncher", () => {
  it("shows launcher por configurar", () => {
    render(<EmptyLauncher />);
    expect(screen.getByText(/por configurar/i)).toBeTruthy();
  });

  it("has disabled configure button", () => {
    render(<EmptyLauncher />);
    const btn = screen.getByText(/Configurar LMU/i);
    expect(btn.closest("button")?.disabled).toBe(true);
  });
});
