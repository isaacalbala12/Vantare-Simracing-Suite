import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { signOutMock, getSessionMock, useLicenseMock, clearLicenseMock, emitMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  getSessionMock: vi.fn(),
  useLicenseMock: vi.fn(),
  clearLicenseMock: vi.fn(),
  emitMock: vi.fn(),
}));

const billingMocks = vi.hoisted(() => ({
  enabled: false,
  openBillingPortal: vi.fn(),
  refreshCurrentUserEntitlements: vi.fn(),
  resetActiveDevice: vi.fn(),
}));

vi.mock("../../lib/supabase-auth", () => ({
  signOut: signOutMock,
  getSession: getSessionMock,
}));

vi.mock("../../lib/license", () => ({
  useLicense: useLicenseMock,
}));

vi.mock("../../lib/billing-client", () => ({
  get BILLING_ENABLED() {
    return billingMocks.enabled;
  },
  openBillingPortal: (...args: unknown[]) => billingMocks.openBillingPortal(...args),
}));

vi.mock("../../lib/entitlements-refresh", () => ({
  refreshCurrentUserEntitlements: (...args: unknown[]) =>
    billingMocks.refreshCurrentUserEntitlements(...args),
  resetActiveDevice: (...args: unknown[]) =>
    billingMocks.resetActiveDevice(...args),
  isPremiumUnlocked: (license: { state: string; entitlements: string[] }) =>
    license.state === "active" && license.entitlements.includes("bundle"),
}));

vi.mock("@wailsio/runtime", () => ({
  Events: {
    Emit: emitMock,
    On: vi.fn().mockReturnValue(() => {}),
  },
  Browser: { OpenURL: vi.fn() },
}));

import { AccountSettings } from "./AccountSettings";

function mockUseLicense(result: unknown) {
  useLicenseMock.mockReturnValue({
    result,
    loading: false,
    refresh: vi.fn(),
    clearLicense: clearLicenseMock,
  });
}

describe("AccountSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    billingMocks.enabled = false;
    billingMocks.openBillingPortal.mockReset();
    billingMocks.refreshCurrentUserEntitlements.mockReset();
    billingMocks.resetActiveDevice.mockReset();
    billingMocks.resetActiveDevice.mockResolvedValue({ ok: true });
    billingMocks.openBillingPortal.mockResolvedValue({ ok: true, url: "https://sandbox.polar.sh/portal/x" });
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
    signOutMock.mockReset();
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue(null);
    useLicenseMock.mockReset();
    clearLicenseMock.mockReset();
    emitMock.mockReset();
  });

  it("renders account section with email and license state", () => {
    mockUseLicense({
      state: "active",
      entitlements: ["overlays", "engineer"],
      userId: "u",
      email: "isaac@example.com",
      deviceOK: true,
    });
    render(<AccountSettings />);
    expect(screen.getByText(/cuenta/i)).toBeTruthy();
    expect(
      screen.getByLabelText("account-settings").textContent,
    ).toMatch(/isaac@example.com/);
    expect(screen.getByTestId("account-plan").textContent).toMatch(/Suite/);
    expect(screen.getByTestId("account-status").textContent).toMatch(/Activo/);
  });

  it("hides manage billing when billing is disabled", () => {
    mockUseLicense({
      state: "active",
      entitlements: ["bundle"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
      providerCustomerId: "polar_cus_1",
    });
    render(<AccountSettings />);
    expect(screen.queryByRole("button", { name: /gestionar facturación/i })).toBeNull();
  });

  it("shows manage billing when billing is enabled", () => {
    billingMocks.enabled = true;
    mockUseLicense({
      state: "active",
      entitlements: ["bundle"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<AccountSettings />);
    expect(screen.getByRole("button", { name: /gestionar facturación/i })).toBeTruthy();
  });

  it("calls openBillingPortal without customer id from license", async () => {
    billingMocks.enabled = true;
    mockUseLicense({
      state: "active",
      entitlements: ["bundle"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<AccountSettings />);
    fireEvent.click(screen.getByRole("button", { name: /gestionar facturación/i }));
    await waitFor(() => expect(billingMocks.openBillingPortal).toHaveBeenCalledWith());
  });

  it("shows no-customer message on billing_customer_not_found", async () => {
    billingMocks.enabled = true;
    billingMocks.openBillingPortal.mockResolvedValueOnce({
      ok: false,
      reason: "billing_customer_not_found",
    });
    mockUseLicense({
      state: "free",
      entitlements: [],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<AccountSettings />);
    fireEvent.click(screen.getByRole("button", { name: /gestionar facturación/i }));
    await waitFor(() =>
      expect(screen.getByText(/todavía no tienes una suscripción o compra activa gestionable/i)).toBeTruthy(),
    );
  });

  it("shows safe portal error on server failure", async () => {
    billingMocks.enabled = true;
    billingMocks.openBillingPortal.mockResolvedValueOnce({
      ok: false,
      reason: "server_error",
    });
    mockUseLicense({
      state: "active",
      entitlements: ["bundle"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<AccountSettings />);
    fireEvent.click(screen.getByRole("button", { name: /gestionar facturación/i }));
    await waitFor(() =>
      expect(screen.getByText(/no se pudo abrir el portal de facturación/i)).toBeTruthy(),
    );
  });

  it("renders Free plan label when there are no entitlements", () => {
    mockUseLicense(null);
    render(<AccountSettings />);
    expect(screen.getByTestId("account-plan").textContent).toMatch(/Free/);
    expect(screen.getByTestId("account-status").textContent).toMatch(
      /Sin suscripción/,
    );
  });

  it("renders the entitlements list sorted and identifiable", () => {
    mockUseLicense({
      state: "active",
      entitlements: ["engineer", "overlays", "bundle"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<AccountSettings />);
    expect(screen.getByTestId("account-entitlement-bundle")).toBeTruthy();
    expect(screen.getByTestId("account-entitlement-engineer")).toBeTruthy();
    expect(screen.getByTestId("account-entitlement-overlays")).toBeTruthy();
  });

  it("calls resetActiveDevice, refreshes license, and shows success on reset click", async () => {
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
    mockUseLicense({
      state: "device-limit",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: false,
    });
    render(<AccountSettings />);
    fireEvent.click(screen.getByTestId("account-reset-device"));
    await waitFor(() => expect(billingMocks.resetActiveDevice).toHaveBeenCalled());
    await waitFor(() =>
      expect(billingMocks.refreshCurrentUserEntitlements).toHaveBeenCalled(),
    );
    expect(screen.getByTestId("account-reset-success")).toBeTruthy();
    expect(screen.getByTestId("account-license-refresh-active")).toBeTruthy();
  });

  it("shows login required when resetActiveDevice fails without session", async () => {
    billingMocks.resetActiveDevice.mockResolvedValueOnce({
      ok: false,
      reason: "login_required",
    });
    mockUseLicense({
      state: "active",
      entitlements: ["bundle"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<AccountSettings />);
    fireEvent.click(screen.getByTestId("account-reset-device"));
    await waitFor(() => expect(screen.getByTestId("account-reset-error")).toBeTruthy());
  });

  it("refreshes license status from account settings", async () => {
    mockUseLicense({
      state: "expired",
      entitlements: [],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<AccountSettings />);
    fireEvent.click(screen.getByTestId("account-refresh-license"));
    await waitFor(() =>
      expect(billingMocks.refreshCurrentUserEntitlements).toHaveBeenCalled(),
    );
    expect(screen.getByTestId("account-license-refresh-none")).toBeTruthy();
  });

  it("shows device-limit message when bundle exists but device is blocked", async () => {
    billingMocks.refreshCurrentUserEntitlements.mockResolvedValueOnce({
      ok: true,
      license: {
        state: "device-limit",
        entitlements: ["bundle"],
        userId: "u",
        email: "u@example.com",
        deviceOK: false,
      },
      hasBundle: true,
      unlocked: false,
    });
    mockUseLicense({
      state: "authenticated-no-entitlement",
      entitlements: [],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<AccountSettings />);
    fireEvent.click(screen.getByTestId("account-refresh-license"));
    await waitFor(() =>
      expect(screen.getByTestId("account-license-refresh-device-limit")).toBeTruthy(),
    );
  });

  it("shows active license message after successful refresh", async () => {
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
    mockUseLicense({
      state: "expired",
      entitlements: [],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<AccountSettings />);
    fireEvent.click(screen.getByTestId("account-refresh-license"));
    await waitFor(() =>
      expect(screen.getByTestId("account-license-refresh-active")).toBeTruthy(),
    );
  });

  it("shows safe error when license refresh fails", async () => {
    billingMocks.refreshCurrentUserEntitlements.mockResolvedValueOnce({
      ok: false,
      reason: "validation_error",
    });
    mockUseLicense({
      state: "active",
      entitlements: ["bundle"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<AccountSettings />);
    fireEvent.click(screen.getByTestId("account-refresh-license"));
    await waitFor(() =>
      expect(screen.getByTestId("account-license-refresh-error")).toBeTruthy(),
    );
  });

  it("calls signOut and clearLicense on logout click", async () => {
    signOutMock.mockResolvedValueOnce({});
    mockUseLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<AccountSettings />);
    fireEvent.click(screen.getByRole("button", { name: /cerrar sesión/i }));
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    expect(clearLicenseMock).toHaveBeenCalled();
  });
});