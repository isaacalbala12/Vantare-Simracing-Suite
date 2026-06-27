import { describe, expect, it, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaywallScreen } from "./PaywallScreen";

describe("PaywallScreen", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders plan cards with prices", () => {
    render(<PaywallScreen email="u@example.com" />);
    expect(screen.getByText(/overlays/i)).toBeTruthy();
    expect(screen.getByText(/engineer/i)).toBeTruthy();
    expect(screen.getByText(/AC Lua Pack/i)).toBeTruthy();
    expect(screen.getByText(/5/)).toBeTruthy();
    expect(screen.getByText(/20/)).toBeTruthy();
  });

  it("renders email banner", () => {
    render(<PaywallScreen email="isaac@example.com" />);
    expect(screen.getByText(/isaac@example.com/)).toBeTruthy();
  });

  it("shows a coming-soon message when Suscribirse is clicked", () => {
    render(<PaywallScreen email="u@example.com" />);
    const buttons = screen.getAllByRole("button", { name: /suscribirse/i });
    fireEvent.click(buttons[0]);
    const banner = screen.getByTestId("paywall-coming-soon");
    expect(banner.textContent).toMatch(/Pago en línea próximamente/);
    expect(banner.textContent).toMatch(/beta_access/);
  });

  it("renders two distinct plans", () => {
    render(<PaywallScreen email="u@example.com" />);
    const buttons = screen.getAllByRole("button", { name: /suscribirse/i });
    expect(buttons.length).toBe(2);
  });
});
