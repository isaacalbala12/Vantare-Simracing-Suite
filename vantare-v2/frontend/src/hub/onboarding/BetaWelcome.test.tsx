import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BetaWelcome, type BetaUserRole } from "./BetaWelcome";

function pickRole(role: BetaUserRole) {
  fireEvent.click(screen.getByTestId(`role-card-${role}`));
}

describe("BetaWelcome", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows welcome message", () => {
    render(<BetaWelcome onComplete={vi.fn()} />);
    expect(screen.getByText(/Bienvenido a la beta/i)).toBeTruthy();
  });

  it("shows Plan Free activo", () => {
    render(<BetaWelcome onComplete={vi.fn()} />);
    expect(screen.getByText(/Plan Free/i)).toBeTruthy();
  });

  it("renders all five role cards", () => {
    render(<BetaWelcome onComplete={vi.fn()} />);
    expect(screen.getByTestId("role-card-beginner")).toBeTruthy();
    expect(screen.getByTestId("role-card-intermediate")).toBeTruthy();
    expect(screen.getByTestId("role-card-advanced")).toBeTruthy();
    expect(screen.getByTestId("role-card-creator")).toBeTruthy();
    expect(screen.getByTestId("role-card-organizer")).toBeTruthy();
  });

  it("Empezar button is disabled until a role is picked", () => {
    render(<BetaWelcome onComplete={vi.fn()} />);
    const start = screen.getByTestId("start-button");
    expect((start as HTMLButtonElement).disabled).toBe(true);
  });

  it("Empezar button enables after picking a role", () => {
    render(<BetaWelcome onComplete={vi.fn()} />);
    pickRole("beginner");
    const start = screen.getByTestId("start-button");
    expect((start as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not call onComplete when Empezar is clicked without a role", () => {
    const onComplete = vi.fn();
    render(<BetaWelcome onComplete={onComplete} />);
    const start = screen.getByTestId("start-button");
    expect((start as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(start);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("calls onComplete with selected role when Empezar is clicked", () => {
    const onComplete = vi.fn();
    render(<BetaWelcome onComplete={onComplete} />);
    pickRole("creator");
    fireEvent.click(screen.getByTestId("start-button"));
    expect(onComplete).toHaveBeenCalledWith("creator");
  });

  it("does not render OBS hint before any role is selected", () => {
    render(<BetaWelcome onComplete={vi.fn()} />);
    expect(screen.queryByTestId("obs-hint")).toBeNull();
  });

  it("shows OBS copy when creator is selected", () => {
    render(<BetaWelcome onComplete={vi.fn()} />);
    pickRole("creator");
    const hint = screen.getByTestId("obs-hint");
    expect(hint).toBeTruthy();
    expect(hint.textContent).toMatch(/OBS/i);
    expect(hint.textContent).toMatch(/URL/i);
  });

  it("shows OBS copy when organizer is selected", () => {
    render(<BetaWelcome onComplete={vi.fn()} />);
    pickRole("organizer");
    const hint = screen.getByTestId("obs-hint");
    expect(hint).toBeTruthy();
    expect(hint.textContent).toMatch(/OBS/i);
    expect(hint.textContent).toMatch(/URL/i);
  });

  it("does not show OBS copy for beginner", () => {
    render(<BetaWelcome onComplete={vi.fn()} />);
    pickRole("beginner");
    expect(screen.queryByTestId("obs-hint")).toBeNull();
  });

  it("does not show OBS copy for intermediate", () => {
    render(<BetaWelcome onComplete={vi.fn()} />);
    pickRole("intermediate");
    expect(screen.queryByTestId("obs-hint")).toBeNull();
  });

  it("does not show OBS copy for advanced", () => {
    render(<BetaWelcome onComplete={vi.fn()} />);
    pickRole("advanced");
    expect(screen.queryByTestId("obs-hint")).toBeNull();
  });
});
