import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BetaWelcome } from "./BetaWelcome";

describe("BetaWelcome", () => {
  afterEach(() => {
    cleanup();
  });
  it("shows welcome message", () => {
    render(<BetaWelcome onClose={vi.fn()} />);
    expect(screen.getByText(/Bienvenido a la beta/i)).toBeTruthy();
  });

  it("shows Plan Free activo", () => {
    render(<BetaWelcome onClose={vi.fn()} />);
    expect(screen.getByText(/Plan Free/i)).toBeTruthy();
  });

  it("has Empezar button", () => {
    render(<BetaWelcome onClose={vi.fn()} />);
    expect(screen.getByText(/Empezar/i)).toBeTruthy();
  });

  it("calls onClose when Empezar is clicked", () => {
    const onClose = vi.fn();
    render(<BetaWelcome onClose={onClose} />);
    screen.getByText(/Empezar/i).click();
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<BetaWelcome onClose={onClose} />);
    screen.getByLabelText(/Cerrar/i).click();
    expect(onClose).toHaveBeenCalled();
  });
});
