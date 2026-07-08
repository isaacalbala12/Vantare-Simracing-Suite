import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { signOutMock, getSessionMock, useLicenseMock, refreshMock, emitMock, mockOpenURL } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  getSessionMock: vi.fn(),
  useLicenseMock: vi.fn(),
  refreshMock: vi.fn(),
  emitMock: vi.fn(),
  mockOpenURL: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/supabase-auth", () => ({
  signOut: signOutMock,
  getSession: getSessionMock,
}));

vi.mock("../../lib/license", () => ({
  useLicense: useLicenseMock,
}));

vi.mock("@wailsio/runtime", () => ({
  Events: {
    Emit: emitMock,
    On: vi.fn().mockReturnValue(() => {}),
  },
  Browser: { OpenURL: (...args: unknown[]) => mockOpenURL(...args) },
}));

import { AccountSettings } from "./AccountSettings";

function mockUseLicense(result: unknown) {
  useLicenseMock.mockReturnValue({
    result,
    loading: false,
    refresh: refreshMock,
  });
}

describe("AccountSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    signOutMock.mockReset();
    getSessionMock.mockReset();
    useLicenseMock.mockReset();
    refreshMock.mockReset();
    emitMock.mockReset();
    mockOpenURL.mockReset();
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
    expect(screen.getByText(/isaac@example.com/)).toBeTruthy();
    expect(screen.getByTestId("account-plan").textContent).toMatch(/Suite/);
    expect(screen.getByTestId("account-status").textContent).toMatch(/Activo/);
  });

  it("renders Free plan label when there are no entitlements", () => {
    mockUseLicense(null);
    render(<AccountSettings />);
    expect(screen.getByTestId("account-plan").textContent).toMatch(/Free/);
    expect(screen.getByTestId("account-status").textContent).toMatch(
      /Sin suscripción/,
    );
  });

  it("renders the block warning when the license is blocked", () => {
    mockUseLicense({
      state: "expired",
      entitlements: ["overlays"],
      userId: "u",
      email: "exp@example.com",
      deviceOK: true,
    });
    render(<AccountSettings />);
    expect(screen.getByTestId("account-status").textContent).toMatch(
      /Bloqueado/,
    );
    expect(screen.getByText(/suscripción bloqueada/i)).toBeTruthy();
  });

  it("renders the grace window when state is grace", () => {
    mockUseLicense({
      state: "grace",
      entitlements: ["overlays"],
      userId: "u",
      email: "g@example.com",
      deviceOK: true,
      graceEndsAt: "2026-12-31T23:59:59Z",
    });
    render(<AccountSettings />);
    expect(screen.getByTestId("account-status").textContent).toMatch(
      /Periodo de gracia/,
    );
    expect(screen.getByText(/gracia hasta/i)).toBeTruthy();
  });

  it("renders dash placeholders when no result", () => {
    mockUseLicense(null);
    render(<AccountSettings />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("calls signOut and refresh on logout click", async () => {
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
    expect(refreshMock).toHaveBeenCalled();
  });

  it("calls getSession and emits license:reset-device on reset click", async () => {
    getSessionMock.mockResolvedValueOnce({ access_token: "mock-token" });
    mockUseLicense({
      state: "device-limit",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: false,
    });
    render(<AccountSettings />);
    fireEvent.click(screen.getByRole("button", { name: /restablecer pc/i }));
    await waitFor(() => expect(getSessionMock).toHaveBeenCalled());
    expect(emitMock).toHaveBeenCalledWith("license:reset-device", { sessionToken: "mock-token" });
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
    expect(
      screen.getByTestId("account-entitlement-bundle"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("account-entitlement-engineer"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("account-entitlement-overlays"),
    ).toBeTruthy();
  });

  // --- CHECKOUT-01 Task 3: Portal button ---

  it("calls fetch to create-portal-session and opens portal URL when Gestionar suscripción is clicked", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "https://billing.stripe.com/session/test" }),
    } as Response);

    mockUseLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u123",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<AccountSettings />);
    fireEvent.click(screen.getByRole("button", { name: /gestionar suscripción/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain("/functions/v1/create-portal-session");
    expect(opts?.method).toBe("POST");
    expect(mockOpenURL).toHaveBeenCalledWith("https://billing.stripe.com/session/test");

    fetchSpy.mockRestore();
  });

  it("shows portal error when portal fetch fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "No customer" }),
    } as Response);

    mockUseLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<AccountSettings />);
    fireEvent.click(screen.getByRole("button", { name: /gestionar suscripción/i }));

    await waitFor(() =>
      expect(screen.getByText(/no se pudo abrir el portal/i)).toBeTruthy(),
    );

    fetchSpy.mockRestore();
  });
});
