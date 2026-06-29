import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanStatusCard } from "./PlanStatusCard";

afterEach(() => {
  cleanup();
});

describe("PlanStatusCard", () => {
  it("shows Plan Free activo", () => {
    render(<PlanStatusCard onNavigate={vi.fn()} />);
    expect(screen.getByText(/Plan Free/i)).toBeTruthy();
  });

  it("shows acceso basico activo note", () => {
    render(<PlanStatusCard onNavigate={vi.fn()} />);
    expect(screen.getByText(/acceso b/i)).toBeTruthy();
  });

  it("has a Gestionar cuenta button", () => {
    render(<PlanStatusCard onNavigate={vi.fn()} />);
    expect(screen.getByText(/Gestionar cuenta/i)).toBeTruthy();
  });

  it("calls onNavigate with 'setup' when Gestionar cuenta is clicked", () => {
    const onNavigate = vi.fn();
    render(<PlanStatusCard onNavigate={onNavigate} />);
    screen.getByText(/Gestionar cuenta/i).click();
    expect(onNavigate).toHaveBeenCalledWith("setup");
  });
});
