import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const billingMocks = vi.hoisted(() => ({
  enabled: false,
  createBillingCheckout: vi.fn(),
  refreshCurrentUserEntitlements: vi.fn(),
}));

vi.mock("../../lib/billing-client", () => ({
  get BILLING_ENABLED() {
    return billingMocks.enabled;
  },
  createBillingCheckout: (...args: unknown[]) =>
    billingMocks.createBillingCheckout(...args),
}));

vi.mock("../../lib/entitlements-refresh", () => ({
  refreshCurrentUserEntitlements: (...args: unknown[]) =>
    billingMocks.refreshCurrentUserEntitlements(...args),
}));

import { PaywallScreen } from "./PaywallScreen";

describe("PaywallScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    billingMocks.enabled = false;
    billingMocks.createBillingCheckout.mockReset();
    billingMocks.refreshCurrentUserEntitlements.mockReset();
    billingMocks.createBillingCheckout.mockResolvedValue({ ok: true, url: "https://sandbox.polar.sh/checkout/x" });
    billingMocks.refreshCurrentUserEntitlements.mockResolvedValue({
      ok: true,
      license: {
        state: "authenticated-no-entitlement",
        entitlements: [],
        userId: "u",
        email: "u@example.com",
        deviceOK: true,
      },
      hasBundle: false,
      unlocked: false,
    });
  });

  it("renders the four legacy plan cards when billing is disabled", () => {
    render(<PaywallScreen email="u@example.com" />);
    expect(screen.getByTestId("paywall-plan-free")).toBeTruthy();
    expect(screen.getByTestId("paywall-plan-overlays")).toBeTruthy();
    expect(screen.getByTestId("paywall-plan-engineer")).toBeTruthy();
    expect(screen.getByTestId("paywall-plan-suite")).toBeTruthy();
  });

  it("renders billing plan cards when billing is enabled", () => {
    billingMocks.enabled = true;
    render(<PaywallScreen email="u@example.com" />);
    expect(screen.getByTestId("paywall-plan-free")).toBeTruthy();
    expect(screen.getByTestId("paywall-plan-launch_lifetime")).toBeTruthy();
    expect(screen.getByTestId("paywall-plan-pro_monthly")).toBeTruthy();
    expect(screen.queryByTestId("paywall-plan-suite")).toBeNull();
    expect(screen.getByText(/Launch Edition/i)).toBeTruthy();
    expect(screen.getByText(/Pro Monthly/i)).toBeTruthy();
  });

  it("shows coming soon when billing is disabled and does not fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<PaywallScreen email="u@example.com" />);
    const buttons = screen.getAllByRole("button", { name: /suscribirse/i });
    fireEvent.click(buttons[0]);
    await waitFor(() =>
      expect(screen.getByTestId("paywall-coming-soon")).toBeTruthy(),
    );
    expect(billingMocks.createBillingCheckout).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("calls createBillingCheckout for launch_lifetime when billing enabled", async () => {
    billingMocks.enabled = true;
    render(<PaywallScreen email="u@example.com" />);
    const launchCard = screen.getByTestId("paywall-plan-launch_lifetime");
    fireEvent.click(
      launchCard.querySelector("button") as HTMLButtonElement,
    );
    await waitFor(() =>
      expect(billingMocks.createBillingCheckout).toHaveBeenCalledWith("launch_lifetime"),
    );
  });

  it("calls createBillingCheckout for pro_monthly when billing enabled", async () => {
    billingMocks.enabled = true;
    render(<PaywallScreen email="u@example.com" />);
    const proCard = screen.getByTestId("paywall-plan-pro_monthly");
    fireEvent.click(proCard.querySelector("button") as HTMLButtonElement);
    await waitFor(() =>
      expect(billingMocks.createBillingCheckout).toHaveBeenCalledWith("pro_monthly"),
    );
  });

  it("shows login required error from billing client", async () => {
    billingMocks.enabled = true;
    billingMocks.createBillingCheckout.mockResolvedValueOnce({
      ok: false,
      reason: "login_required",
    });
    render(<PaywallScreen email="u@example.com" />);
    fireEvent.click(
      screen.getByTestId("paywall-plan-launch_lifetime").querySelector("button") as HTMLButtonElement,
    );
    await waitFor(() =>
      expect(screen.getByTestId("paywall-error").textContent).toMatch(
        /inicia sesión para continuar/i,
      ),
    );
  });

  it("shows safe checkout error on server failure", async () => {
    billingMocks.enabled = true;
    billingMocks.createBillingCheckout.mockResolvedValueOnce({
      ok: false,
      reason: "server_error",
    });
    render(<PaywallScreen email="u@example.com" />);
    fireEvent.click(
      screen.getByTestId("paywall-plan-pro_monthly").querySelector("button") as HTMLButtonElement,
    );
    await waitFor(() =>
      expect(screen.getByTestId("paywall-error").textContent).toMatch(
        /no se pudo abrir el checkout/i,
      ),
    );
  });

  it("shows post-checkout panel after successful checkout when billing enabled", async () => {
    billingMocks.enabled = true;
    render(<PaywallScreen email="u@example.com" />);
    fireEvent.click(
      screen.getByTestId("paywall-plan-launch_lifetime").querySelector("button") as HTMLButtonElement,
    );
    await waitFor(() =>
      expect(screen.getByTestId("paywall-post-checkout")).toBeTruthy(),
    );
    expect(screen.getByText(/checkout abierto/i)).toBeTruthy();
    expect(screen.getByTestId("paywall-check-access")).toBeTruthy();
  });

  it("does not show post-checkout panel when checkout URL fails", async () => {
    billingMocks.enabled = true;
    billingMocks.createBillingCheckout.mockResolvedValueOnce({
      ok: false,
      reason: "server_error",
    });
    render(<PaywallScreen email="u@example.com" />);
    fireEvent.click(
      screen.getByTestId("paywall-plan-pro_monthly").querySelector("button") as HTMLButtonElement,
    );
    await waitFor(() => expect(screen.getByTestId("paywall-error")).toBeTruthy());
    expect(screen.queryByTestId("paywall-post-checkout")).toBeNull();
  });

  it("check access button calls refresh entitlements", async () => {
    billingMocks.enabled = true;
    render(<PaywallScreen email="u@example.com" />);
    fireEvent.click(
      screen.getByTestId("paywall-plan-launch_lifetime").querySelector("button") as HTMLButtonElement,
    );
    await waitFor(() =>
      expect(screen.getByTestId("paywall-post-checkout")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("paywall-check-access"));
    await waitFor(() =>
      expect(billingMocks.refreshCurrentUserEntitlements).toHaveBeenCalled(),
    );
  });

  it("shows pending message when bundle is not active yet", async () => {
    billingMocks.enabled = true;
    render(<PaywallScreen email="u@example.com" />);
    fireEvent.click(
      screen.getByTestId("paywall-plan-launch_lifetime").querySelector("button") as HTMLButtonElement,
    );
    await waitFor(() =>
      expect(screen.getByTestId("paywall-post-checkout")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("paywall-check-access"));
    await waitFor(() =>
      expect(screen.getByTestId("paywall-access-pending")).toBeTruthy(),
    );
  });

  it("shows success when bundle unlocks after refresh", async () => {
    billingMocks.enabled = true;
    billingMocks.refreshCurrentUserEntitlements.mockResolvedValueOnce({
      ok: true,
      license: {
        state: "active",
        entitlements: ["bundle"],
        userId: "u",
        email: "u@example.com",
        deviceOK: true,
      },
      hasBundle: true,
      unlocked: true,
    });
    render(<PaywallScreen email="u@example.com" />);
    fireEvent.click(
      screen.getByTestId("paywall-plan-pro_monthly").querySelector("button") as HTMLButtonElement,
    );
    await waitFor(() =>
      expect(screen.getByTestId("paywall-post-checkout")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("paywall-check-access"));
    await waitFor(() =>
      expect(screen.getByTestId("paywall-access-success")).toBeTruthy(),
    );
  });

  it("shows safe error when refresh fails", async () => {
    billingMocks.enabled = true;
    billingMocks.refreshCurrentUserEntitlements.mockResolvedValueOnce({
      ok: false,
      reason: "timeout",
    });
    render(<PaywallScreen email="u@example.com" />);
    fireEvent.click(
      screen.getByTestId("paywall-plan-launch_lifetime").querySelector("button") as HTMLButtonElement,
    );
    await waitFor(() =>
      expect(screen.getByTestId("paywall-post-checkout")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("paywall-check-access"));
    await waitFor(() =>
      expect(screen.getByTestId("paywall-access-error")).toBeTruthy(),
    );
  });

  it("Free plan button is enabled and shows Continuar gratis label", () => {
    render(<PaywallScreen email="u@example.com" />);
    const freeBtn = screen.getByRole("button", { name: /continuar gratis/i });
    expect((freeBtn as HTMLButtonElement).disabled).toBe(false);
  });
});