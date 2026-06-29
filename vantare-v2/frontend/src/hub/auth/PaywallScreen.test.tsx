import { describe, expect, it, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaywallScreen } from "./PaywallScreen";

describe("PaywallScreen", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders the four primary plan cards with prices", () => {
    render(<PaywallScreen email="u@example.com" />);
    expect(screen.getByTestId("paywall-plan-free")).toBeTruthy();
    expect(screen.getByTestId("paywall-plan-overlays")).toBeTruthy();
    expect(screen.getByTestId("paywall-plan-engineer")).toBeTruthy();
    expect(screen.getByTestId("paywall-plan-suite")).toBeTruthy();
    expect(screen.getByText(/Overlays Studio/i)).toBeTruthy();
    expect(screen.getByText(/Ingeniero \(spotter/i)).toBeTruthy();
  });

  it("marks Suite as the recommended plan", () => {
    render(<PaywallScreen email="u@example.com" />);
    const recommended = screen.getAllByText(/recomendado/i);
    // At least the badge on the Suite plan card, plus the free-plan feature
    // "Perfiles recomendados incluidos" appear in the DOM.
    expect(recommended.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("paywall-plan-suite").textContent).toMatch(
      /Recomendado/,
    );
  });

  it("renders the email and current plan/status summary", () => {
    render(
      <PaywallScreen
        email="isaac@example.com"
        result={{
          state: "authenticated-no-entitlement",
          entitlements: [],
          userId: "u",
          email: "isaac@example.com",
          deviceOK: true,
        }}
      />,
    );
    expect(screen.getByText(/isaac@example.com/)).toBeTruthy();
    const status = screen.getByTestId("paywall-status");
    expect(status.textContent).toMatch(/Free/);
    expect(status.textContent).toMatch(/Sin suscripción/);
    expect(screen.getByRole("button", { name: /continuar gratis/i })).toBeTruthy();
  });

  it("shows a coming-soon notice with no fake checkout when Suscribirse is clicked", () => {
    render(<PaywallScreen email="u@example.com" />);
    const buttons = screen.getAllByRole("button", { name: /suscribirse/i });
    fireEvent.click(buttons[0]);
    const banner = screen.getByTestId("paywall-coming-soon");
    expect(banner.textContent).toMatch(/Pago en línea próximamente/);
    expect(banner.textContent).toMatch(/portal externo/);
  });

  it("Free plan button is enabled and shows Continuar gratis label", () => {
    render(<PaywallScreen email="u@example.com" />);
    const freeBtn = screen.getByRole("button", { name: /continuar gratis/i });
    expect(freeBtn).toBeTruthy();
    expect((freeBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("lists three distinct Suscribirse buttons (Free now shows Continuar gratis)", () => {
    render(<PaywallScreen email="u@example.com" />);
    const subscribeButtons = screen.getAllByRole("button", {
      name: /suscribirse/i,
    });
    expect(subscribeButtons.length).toBe(3);
  });

  it("Free button is disabled when blocked (expired)", () => {
    render(
      <PaywallScreen
        email="u@example.com"
        result={{
          state: "expired",
          entitlements: [],
          userId: "u",
          email: "u@example.com",
          deviceOK: true,
        }}
      />,
    );
    const freeBtn = screen.getByRole("button", { name: /plan actual/i });
    expect(freeBtn).toBeTruthy();
    expect((freeBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows founder tiers under a disclosure", () => {
    render(<PaywallScreen email="u@example.com" />);
    // Founder appears both as a heading and inside a feature bullet; assert
    // the heading specifically to avoid ambiguity.
    expect(screen.getByRole("heading", { name: /^founder$/i })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: /visionary backer/i }),
    ).toBeTruthy();
    expect(
      screen.getByText(/tiers de fundador \(histórico\)/i),
    ).toBeTruthy();
  });
});