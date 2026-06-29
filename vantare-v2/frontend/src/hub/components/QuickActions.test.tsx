import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickActions } from "./QuickActions";

afterEach(() => {
  cleanup();
});

describe("QuickActions", () => {
  it("renders Overlays Studio button", () => {
    render(<QuickActions onNavigate={vi.fn()} />);
    expect(screen.getByText(/Overlays Studio/i)).toBeTruthy();
  });

  it("renders Configurar OBS button", () => {
    render(<QuickActions onNavigate={vi.fn()} />);
    expect(screen.getByText(/Configurar OBS/i)).toBeTruthy();
  });

  it("calls onNavigate with 'profiles' when Overlays Studio is clicked", () => {
    const onNavigate = vi.fn();
    render(<QuickActions onNavigate={onNavigate} />);
    screen.getByText(/Overlays Studio/i).click();
    expect(onNavigate).toHaveBeenCalledWith("profiles");
  });

  it("calls onNavigate with 'setup' when Configurar OBS is clicked", () => {
    const onNavigate = vi.fn();
    render(<QuickActions onNavigate={onNavigate} />);
    screen.getByText(/Configurar OBS/i).click();
    expect(onNavigate).toHaveBeenCalledWith("setup");
  });
});
