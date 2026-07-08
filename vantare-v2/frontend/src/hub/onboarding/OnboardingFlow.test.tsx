import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const { useLicenseMock, loginScreenMock, paywallScreenMock } = vi.hoisted(
  () => ({
    useLicenseMock: vi.fn(),
    loginScreenMock: vi.fn(),
    paywallScreenMock: vi.fn(),
  }),
);

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn(() => () => {}),
    Off: vi.fn(),
    Emit: vi.fn(),
  },
}));

vi.mock("../../lib/license", () => ({
  LicenseProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useLicense: useLicenseMock,
}));

vi.mock("../auth/LoginScreen", () => ({
  LoginScreen: () => {
    loginScreenMock();
    return <div data-testid="login-screen">login</div>;
  },
}));

vi.mock("../auth/PaywallScreen", () => ({
  PaywallScreen: ({ email, result }: { email: string; result?: unknown }) => {
    paywallScreenMock(email, result);
    return <div data-testid="paywall-screen">paywall {email}</div>;
  },
}));

import { OnboardingFlow } from "./OnboardingFlow";

function setLicense(result: unknown, loading = false) {
  useLicenseMock.mockReturnValue({
    result,
    loading,
    refresh: vi.fn(),
  });
}

describe("OnboardingFlow", () => {
  beforeEach(() => {
    cleanup();
    useLicenseMock.mockReset();
    loginScreenMock.mockReset();
    paywallScreenMock.mockReset();
  });

  it("renders simulator selection on first visit", () => {
    setLicense(null, true);
    render(<OnboardingFlow />);
    expect(screen.getByTestId("onboarding-step-simulator")).toBeTruthy();
  });

  it("shows login after simulator is confirmed and session is anonymous", () => {
    setLicense(
      {
        state: "anonymous",
        entitlements: [],
        userId: "",
        email: "",
        deviceOK: true,
      },
      false,
    );
    render(<OnboardingFlow initialStep="auth" />);
    expect(loginScreenMock).toHaveBeenCalled();
  });

  it("advances to recommended when authenticated-no-entitlement (Free)", () => {
    setLicense(
      {
        state: "authenticated-no-entitlement",
        entitlements: [],
        userId: "u",
        email: "u@example.com",
        deviceOK: true,
      },
      false,
    );
    render(<OnboardingFlow initialStep="auth" />);
    expect(paywallScreenMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("onboarding-step-recommended")).toBeTruthy();
  });

  it("renders recommended profile step when license is active", () => {
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
    render(<OnboardingFlow initialStep="recommended" />);
    expect(screen.getByTestId("onboarding-step-recommended")).toBeTruthy();
  });

  it("shows loading state when license is loading", () => {
    setLicense(null, true);
    render(<OnboardingFlow initialStep="auth" />);
    expect(screen.getByText(/cargando licencia/i)).toBeTruthy();
  });

  it("shows paywall when license is expired, passing result", () => {
    setLicense(
      {
        state: "expired",
        entitlements: [],
        userId: "u",
        email: "exp@example.com",
        deviceOK: true,
      },
      false,
    );
    render(<OnboardingFlow initialStep="auth" />);
    expect(paywallScreenMock).toHaveBeenCalledWith(
      "exp@example.com",
      expect.objectContaining({ state: "expired" }),
    );
    expect(screen.getByTestId("paywall-screen")).toBeTruthy();
  });

  it("shows paywall when device-limit, passing result", () => {
    setLicense(
      {
        state: "device-limit",
        entitlements: ["overlays"],
        userId: "u",
        email: "dev@example.com",
        deviceOK: false,
      },
      false,
    );
    render(<OnboardingFlow initialStep="auth" />);
    expect(paywallScreenMock).toHaveBeenCalledWith(
      "dev@example.com",
      expect.objectContaining({ state: "device-limit" }),
    );
    expect(screen.getByTestId("paywall-screen")).toBeTruthy();
  });
});
describe("OnboardingFlow i18n", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
    setLicense(null, true);
  });

  it("shows language selector in simulator step", () => {
    render(<OnboardingFlow initialStep="simulator" />);
    expect(screen.getByTestId("language-selector")).toBeTruthy();
  });

  it("displays welcome text in Spanish by default", () => {
    render(<OnboardingFlow initialStep="simulator" />);
    expect(screen.getByText("Bienvenido a Vantare")).toBeTruthy();
  });

  it("changes visible text when language is switched to English", () => {
    render(<OnboardingFlow initialStep="simulator" />);
    expect(screen.getByText("Bienvenido a Vantare")).toBeTruthy();
    const select = screen.getByTestId("language-selector") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "en" } });
    expect(screen.getByText("Welcome to Vantare")).toBeTruthy();
  });

  it("persists language choice in localStorage", () => {
    render(<OnboardingFlow initialStep="simulator" />);
    const select = screen.getByTestId("language-selector") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "pt" } });
    expect(localStorage.getItem("vantare.locale")).toBe("pt");
  });
  it("renders simulator notes through i18n (noteKey)", () => {
    render(<OnboardingFlow initialStep="simulator" />);
    // Default locale is es → "Release 02 sim principal"
    expect(screen.getByText("Release 02 sim principal")).toBeTruthy();
  });

  it("translates simulator notes when locale changes", () => {
    render(<OnboardingFlow initialStep="simulator" />);
    expect(screen.getByText("Release 02 sim principal")).toBeTruthy();
    const select = screen.getByTestId("language-selector") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "en" } });
    expect(screen.getByText("Release 02 main sim")).toBeTruthy();
  });
});