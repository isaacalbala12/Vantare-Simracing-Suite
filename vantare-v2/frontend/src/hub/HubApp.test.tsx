import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const {
  onListeners,
  eventsOn,
  eventsOff,
  eventsEmit,
  useLicenseMock,
  loginScreenMock,
  paywallScreenMock,
  licenseBannerMock,
  getSessionMock,
} = vi.hoisted(() => {
  const onListeners = new Map<string, (event: unknown) => void>();
  return {
    onListeners,
    eventsOn: vi.fn((name: string, cb: (event: unknown) => void) => {
      onListeners.set(name, cb);
      return () => onListeners.delete(name);
    }),
    eventsOff: vi.fn(),
    eventsEmit: vi.fn(),
    useLicenseMock: vi.fn(),
    loginScreenMock: vi.fn(),
    paywallScreenMock: vi.fn(),
    licenseBannerMock: vi.fn(),
    getSessionMock: vi.fn(),
  };
});

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: eventsOn,
    Off: eventsOff,
    Emit: eventsEmit,
  },
}));

vi.mock("../lib/license", () => ({
  LicenseProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLicense: useLicenseMock,
}));

vi.mock("../lib/supabase-auth", () => ({
  getSession: getSessionMock,
}));

vi.mock("./auth/LoginScreen", () => ({
  LoginScreen: ({ onLoggedIn }: { onLoggedIn: (token?: string) => void }) => {
    loginScreenMock();
    return (
      <div data-testid="login-screen">
        <button
          type="button"
          data-testid="trigger-login"
          onClick={() => onLoggedIn("tok-123")}
        >
          trigger
        </button>
        <button
          type="button"
          data-testid="trigger-login-bare"
          onClick={() => onLoggedIn(undefined)}
        >
          bare
        </button>
      </div>
    );
  },
}));

vi.mock("./auth/PaywallScreen", () => ({
  PaywallScreen: ({ email }: { email: string }) => {
    paywallScreenMock(email);
    return <div data-testid="paywall-screen">paywall {email}</div>;
  },
}));

vi.mock("./auth/LicenseBanner", () => ({
  LicenseBanner: () => {
    licenseBannerMock();
    return <div data-testid="license-banner">banner</div>;
  },
}));

vi.mock("./onboarding/BetaWelcome", () => ({
  BetaWelcome: ({ onComplete }: { onComplete: (role: string) => void }) => (
    <div data-testid="beta-welcome">
      <button
        type="button"
        data-testid="beta-welcome-pick-creator"
        onClick={() => onComplete("creator")}
      >
        PickCreator
      </button>
      <button
        type="button"
        data-testid="beta-welcome-close"
        onClick={() => onComplete("creator")}
      >
        Empezar
      </button>
    </div>
  ),
}));

import { HubApp } from "./HubApp";

function setLicense(result: unknown, loading = false) {
  useLicenseMock.mockReturnValue({
    result,
    loading,
    refresh: vi.fn(),
  });
}

describe("HubApp gate (production)", () => {
  beforeEach(() => {
    cleanup();
    onListeners.clear();
    eventsOn.mockClear();
    eventsEmit.mockClear();
    useLicenseMock.mockReset();
    loginScreenMock.mockReset();
    paywallScreenMock.mockReset();
    licenseBannerMock.mockReset();
    getSessionMock.mockReset();
    // Default to "no session" so the bridge does not blow up tests that do
    // not explicitly set the session token.
    getSessionMock.mockResolvedValue(null);
  });

  it("shows loading screen while license is loading", () => {
    setLicense(null, true);
    render(<HubApp />);
    expect(screen.getByTestId("license-loading")).toBeTruthy();
  });

  it("blocks normal use with LoginScreen when anonymous", () => {
    setLicense({
      state: "anonymous",
      entitlements: [],
      userId: "",
      email: "",
      deviceOK: true,
    });
    render(<HubApp />);
    expect(loginScreenMock).toHaveBeenCalled();
    expect(screen.getByTestId("login-screen")).toBeTruthy();
    expect(screen.queryByTestId("paywall-screen")).toBeNull();
    expect(screen.queryByTestId("license-banner")).toBeNull();
  });

  it("falls back to login when result is null", () => {
    setLicense(null, false);
    render(<HubApp />);
    expect(screen.getByTestId("login-screen")).toBeTruthy();
  });

  it("blocks with PaywallScreen on expired", () => {
    setLicense({
      state: "expired",
      entitlements: [],
      userId: "u",
      email: "exp@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    expect(paywallScreenMock).toHaveBeenCalledWith("exp@example.com");
    expect(screen.getByTestId("paywall-screen")).toBeTruthy();
    expect(screen.queryByTestId("login-screen")).toBeNull();
  });

  it("blocks with PaywallScreen on device-limit", () => {
    setLicense({
      state: "device-limit",
      entitlements: ["overlays"],
      userId: "u",
      email: "dev@example.com",
      deviceOK: false,
    });
    render(<HubApp />);
    expect(paywallScreenMock).toHaveBeenCalledWith("dev@example.com");
  });

  it("renders shell when authenticated-no-entitlement (Free)", () => {
    setLicense({
      state: "authenticated-no-entitlement",
      entitlements: [],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    expect(paywallScreenMock).not.toHaveBeenCalled();
    expect(licenseBannerMock).toHaveBeenCalled();
  });

  it("renders shell with banner when active", () => {
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    expect(licenseBannerMock).toHaveBeenCalled();
    expect(screen.getByTestId("license-banner")).toBeTruthy();
    expect(screen.queryByTestId("login-screen")).toBeNull();
    expect(screen.queryByTestId("paywall-screen")).toBeNull();
  });

  it("renders shell with banner when grace", () => {
    setLicense({
      state: "grace",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    expect(licenseBannerMock).toHaveBeenCalled();
    expect(screen.queryByTestId("paywall-screen")).toBeNull();
  });

  it("LicenseBridge forwards Supabase access_token to license:validate", async () => {
    getSessionMock.mockResolvedValueOnce({ access_token: "bridge-tok" });
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    await waitFor(() => {
      expect(eventsEmit).toHaveBeenCalledWith("license:validate", {
        sessionToken: "bridge-tok",
      });
    });
  });

  it("LicenseBridge does not refresh when no session (prevents OAuth race)", async () => {
    const refreshMock = vi.fn();
    getSessionMock.mockResolvedValueOnce(null);
    setLicense(
      {
        state: "active",
        entitlements: ["overlays"],
        userId: "u",
        email: "u@example.com",
        deviceOK: true,
      },
      false,
    );
    useLicenseMock.mockReturnValue({
      result: {
        state: "active",
        entitlements: ["overlays"],
        userId: "u",
        email: "u@example.com",
        deviceOK: true,
      },
      loading: false,
      refresh: refreshMock,
    });
    render(<HubApp />);
    // Give the async getSession promise a chance to resolve.
    await waitFor(() => {
      expect(getSessionMock).toHaveBeenCalled();
    });
    // refresh must NOT be called when there is no session: the initial
    // license:validate with an empty token already ran on mount, and
    // calling refresh here would race with an OAuth callback.
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("LoginScreen onLoggedIn with token re-emits license:validate", async () => {
    setLicense({
      state: "anonymous",
      entitlements: [],
      userId: "",
      email: "",
      deviceOK: true,
    });
    render(<HubApp />);
    eventsEmit.mockClear();
    screen.getByTestId("trigger-login").click();
    await waitFor(() => {
      expect(eventsEmit).toHaveBeenCalledWith("license:validate", {
        sessionToken: "tok-123",
      });
    });
  });

  it("LoginScreen onLoggedIn without token ignores emission (prevents immediate logout loop)", () => {
    setLicense({
      state: "anonymous",
      entitlements: [],
      userId: "",
      email: "",
      deviceOK: true,
    });
    render(<HubApp />);
    eventsEmit.mockClear();
    screen.getByTestId("trigger-login-bare").click();
    expect(eventsEmit).not.toHaveBeenCalledWith("license:validate", expect.anything());
  });

  it("shows BetaWelcome when betaWelcomeCompleted is false", async () => {
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === "settings") {
        setTimeout(() => cb({ data: { deltaMode: "self", cpuSampling: true, hotkeys: {}, betaWelcomeCompleted: false } }), 0);
      }
      return () => false;
    });
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    await waitFor(() => {
      expect(screen.queryByTestId("beta-welcome")).toBeTruthy();
    });
  });

  it("does not show BetaWelcome when betaWelcomeCompleted is true", async () => {
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === "settings") {
        setTimeout(() => cb({ data: { deltaMode: "self", cpuSampling: true, hotkeys: {}, betaWelcomeCompleted: true } }), 0);
      }
      return () => false;
    });
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    await waitFor(() => {
      expect(screen.queryByTestId("beta-welcome")).toBeNull();
    });
  });

  it("emits settings:save with the full settings payload when welcome is closed", async () => {
    const settings = {
      deltaMode: "self",
      cpuSampling: true,
      hotkeys: { toggleOverlay: "ctrl+shift+v", nextProfile: "ctrl+shift+n" },
      activeOverlayProfileId: "profile-clean",
      betaWelcomeCompleted: false,
    };
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === "settings") {
        setTimeout(() => cb({ data: settings }), 0);
      }
      return () => false;
    });
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    await waitFor(() => {
      expect(screen.getByTestId("beta-welcome")).toBeTruthy();
    });
    eventsEmit.mockClear();
    screen.getByTestId("beta-welcome-close").click();
    await waitFor(() => {
      expect(eventsEmit).toHaveBeenCalledWith(
        "settings:save",
        expect.objectContaining({
          deltaMode: "self",
          cpuSampling: true,
          hotkeys: { toggleOverlay: "ctrl+shift+v", nextProfile: "ctrl+shift+n" },
          activeOverlayProfileId: "profile-clean",
          betaWelcomeCompleted: true,
          betaUserRole: "creator",
        }),
      );
    });
  });

  it("does not erase activeOverlayProfileId when closing BetaWelcome", async () => {
    const settings = {
      deltaMode: "session",
      cpuSampling: false,
      hotkeys: {},
      activeOverlayProfileId: "profile-active-must-survive",
      betaWelcomeCompleted: false,
    };
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === "settings") {
        setTimeout(() => cb({ data: settings }), 0);
      }
      return () => false;
    });
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    await waitFor(() => {
      expect(screen.getByTestId("beta-welcome")).toBeTruthy();
    });
    eventsEmit.mockClear();
    screen.getByTestId("beta-welcome-close").click();
    await waitFor(() => {
      expect(eventsEmit).toHaveBeenCalledWith(
        "settings:save",
        expect.objectContaining({
          activeOverlayProfileId: "profile-active-must-survive",
          betaWelcomeCompleted: true,
          betaUserRole: "creator",
        }),
      );
    });
    const [, payload] = eventsEmit.mock.calls.find(
      (call: unknown[]) => call[0] === "settings:save",
    ) ?? [];
    expect((payload as Record<string, unknown>).betaWelcomeCompleted).toBe(true);
    expect((payload as Record<string, unknown>).betaUserRole).toBe("creator");
  });

  it("saves betaUserRole with the role passed to onComplete", async () => {
    const settings = {
      deltaMode: "self",
      cpuSampling: true,
      hotkeys: {},
      activeOverlayProfileId: "profile-x",
      betaWelcomeCompleted: false,
    };
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === "settings") {
        setTimeout(() => cb({ data: settings }), 0);
      }
      return () => false;
    });
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    await waitFor(() => {
      expect(screen.getByTestId("beta-welcome")).toBeTruthy();
    });
    eventsEmit.mockClear();
    screen.getByTestId("beta-welcome-pick-creator").click();
    await waitFor(() => {
      expect(eventsEmit).toHaveBeenCalledWith(
        "settings:save",
        expect.objectContaining({
          betaWelcomeCompleted: true,
          betaUserRole: "creator",
          activeOverlayProfileId: "profile-x",
        }),
      );
    });
  });

  it("navigates to Overlays Studio in recommended mode when 'Usar perfil recomendado' is clicked", async () => {
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === "settings") {
        setTimeout(() => cb({ data: { deltaMode: "self", cpuSampling: true, hotkeys: {}, betaWelcomeCompleted: true, activeOverlayProfileId: "" } }), 0);
      }
      return () => false;
    });
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    const cta = await waitFor(() => screen.getByTestId("recommended-quickstart-cta"));
    cta.click();
    await waitFor(() => {
      expect(screen.getAllByTestId("recommended-save-as-own").length).toBeGreaterThan(0);
    });
  });

  it("renders Launcher page when launcher section is selected", async () => {
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === "settings") {
        setTimeout(() => cb({ data: { deltaMode: "self", cpuSampling: true, hotkeys: {}, betaWelcomeCompleted: true } }), 0);
      }
      return () => false;
    });
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    // Wait for the sidebar Launcher button to be available, then click it.
    const sidebarLauncher = await waitFor(() =>
      screen.getByTestId("v52-sidebar-launcher"),
    );
    sidebarLauncher.click();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Launcher" })).toBeTruthy();
    });
  });

  it("marks the active section as current in the sidebar", async () => {
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === "settings") {
        setTimeout(() => cb({ data: { deltaMode: "self", cpuSampling: true, hotkeys: {}, betaWelcomeCompleted: true } }), 0);
      }
      return () => false;
    });
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    await waitFor(() => {
      const dash = screen.getByTestId("v52-sidebar-dashboard");
      expect(dash.getAttribute("aria-current")).toBe("page");
    });
  });

  it("sidebar exposes all expected v5.2 sections (no Setup, Ajustes is setup)", async () => {
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === "settings") {
        setTimeout(() => cb({ data: { deltaMode: "self", cpuSampling: true, hotkeys: {}, betaWelcomeCompleted: true } }), 0);
      }
      return () => false;
    });
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    await waitFor(() => {
      expect(screen.getByTestId("v52-sidebar-dashboard")).toBeTruthy();
      expect(screen.getByTestId("v52-sidebar-profiles")).toBeTruthy();
      expect(screen.getByTestId("v52-sidebar-launcher")).toBeTruthy();
      expect(screen.getByTestId("v52-sidebar-calendar")).toBeTruthy();
      expect(screen.getByTestId("v52-sidebar-engineer")).toBeTruthy();
      expect(screen.getByTestId("v52-sidebar-telemetry")).toBeTruthy();
      expect(screen.getByTestId("v52-sidebar-roadmap")).toBeTruthy();
      expect(screen.getByTestId("v52-sidebar-setup")).toBeTruthy();
    });
  });

  it("renders Telemetry page when telemetry section is selected", async () => {
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === "settings") {
        setTimeout(() => cb({ data: { deltaMode: "self", cpuSampling: true, hotkeys: {}, betaWelcomeCompleted: true } }), 0);
      }
      return () => false;
    });
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    const sidebarTelemetry = await waitFor(() =>
      screen.getByTestId("v52-sidebar-telemetry"),
    );
    fireEvent.click(sidebarTelemetry);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Telemetría" })).toBeTruthy();
      expect(screen.getByText(/en desarrollo/i)).toBeTruthy();
    });
  });

  it("renders Calendar page when calendar section is selected", async () => {
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === "settings") {
        setTimeout(() => cb({ data: { deltaMode: "self", cpuSampling: true, hotkeys: {}, betaWelcomeCompleted: true } }), 0);
      }
      return () => false;
    });
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    const sidebarCalendar = await waitFor(() =>
      screen.getByTestId("v52-sidebar-calendar"),
    );
    fireEvent.click(sidebarCalendar);
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Calendario LMU" })).toBeTruthy();
    });
  });

  it("shows reminder banner when calendar:reminder is received", async () => {
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === "settings") {
        setTimeout(() => cb({ data: { deltaMode: "self", cpuSampling: true, hotkeys: {}, betaWelcomeCompleted: true } }), 0);
      }
      if (name === "calendar:reminder") {
        setTimeout(() => cb({ data: { eventId: "evt-1", title: "6h de Spa", track: "Spa", minutesLeft: 15, startTime: "2026-07-02T20:00:00+02:00", registrationUrl: "" } }), 10);
      }
      return () => false;
    });
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    await waitFor(() => {
      expect(screen.getByTestId("calendar-reminder-banner")).toBeTruthy();
      expect(screen.getByText("6h de Spa")).toBeTruthy();
      expect(screen.getByText("Faltan 15 min")).toBeTruthy();
    });
  });

  it("replaces reminder banner when a second calendar:reminder arrives", async () => {
    const reminderCb: { current: ((event: unknown) => void) | null } = { current: null };
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === "settings") {
        setTimeout(() => cb({ data: { deltaMode: "self", cpuSampling: true, hotkeys: {}, betaWelcomeCompleted: true } }), 0);
      }
      if (name === "calendar:reminder") {
        reminderCb.current = cb;
      }
      return () => false;
    });
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    await waitFor(() => {
      expect(screen.queryByTestId("calendar-reminder-banner")).toBeNull();
    });
    reminderCb.current?.({ data: { eventId: "evt-1", title: "6h de Spa", track: "Spa", minutesLeft: 15, startTime: "2026-07-02T20:00:00+02:00", registrationUrl: "" } });
    await waitFor(() => {
      expect(screen.getByText("6h de Spa")).toBeTruthy();
    });
    reminderCb.current?.({ data: { eventId: "evt-2", title: "24h de Le Mans", track: "La Sarthe", minutesLeft: 5, startTime: "2026-07-03T16:00:00+02:00", registrationUrl: "" } });
    await waitFor(() => {
      expect(screen.getByText("24h de Le Mans")).toBeTruthy();
      expect(screen.queryByText("6h de Spa")).toBeNull();
    });
  });

  it("hides reminder banner when close button is clicked", async () => {
    const reminderCb: { current: ((event: unknown) => void) | null } = { current: null };
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === "settings") {
        setTimeout(() => cb({ data: { deltaMode: "self", cpuSampling: true, hotkeys: {}, betaWelcomeCompleted: true } }), 0);
      }
      if (name === "calendar:reminder") {
        reminderCb.current = cb;
      }
      return () => false;
    });
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    reminderCb.current?.({ data: { eventId: "evt-1", title: "6h de Spa", track: "Spa", minutesLeft: 15, startTime: "2026-07-02T20:00:00+02:00", registrationUrl: "" } });
    await waitFor(() => {
      expect(screen.getByTestId("calendar-reminder-banner")).toBeTruthy();
    });
    fireEvent.click(screen.getByLabelText("Cerrar recordatorio"));
    await waitFor(() => {
      expect(screen.queryByTestId("calendar-reminder-banner")).toBeNull();
    });
  });

  it("renders Roadmap page when roadmap section is selected", async () => {
    eventsOn.mockImplementation((name: string, cb: (event: unknown) => void) => {
      if (name === "settings") {
        setTimeout(() => cb({ data: { deltaMode: "self", cpuSampling: true, hotkeys: {}, betaWelcomeCompleted: true } }), 0);
      }
      return () => false;
    });
    setLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
    });
    render(<HubApp />);
    const sidebarRoadmap = await waitFor(() =>
      screen.getByTestId("v52-sidebar-roadmap"),
    );
    fireEvent.click(sidebarRoadmap);
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Desarrollo Vantare" })).toBeTruthy();
    });
  });
});
