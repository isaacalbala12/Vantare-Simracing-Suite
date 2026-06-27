import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { signOutMock, getSessionMock, useLicenseMock, refreshMock, emitMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  getSessionMock: vi.fn(),
  useLicenseMock: vi.fn(),
  refreshMock: vi.fn(),
  emitMock: vi.fn(),
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
    cleanup();
    signOutMock.mockReset();
    getSessionMock.mockReset();
    useLicenseMock.mockReset();
    refreshMock.mockReset();
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
    expect(screen.getByText(/isaac@example.com/)).toBeTruthy();
    expect(screen.getByText(/active/i)).toBeTruthy();
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

  it("renders entitlements list", () => {
    mockUseLicense({
      state: "active",
      entitlements: ["overlays", "engineer", "bundle"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<AccountSettings />);
    expect(screen.getByText(/overlays/i)).toBeTruthy();
    expect(screen.getByText(/engineer/i)).toBeTruthy();
    expect(screen.getByText(/bundle/i)).toBeTruthy();
  });
});