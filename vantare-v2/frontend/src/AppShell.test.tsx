import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRuntime } from "./AppShell";

const registration = vi.hoisted(() => vi.fn());
const renderOrder = vi.hoisted(() => [] as string[]);

vi.mock("./hub/registry/builtin-systems", () => ({
  registerBuiltinDesignSystems: registration,
}));
vi.mock("./lib/AuthSessionBridge", () => ({
  AuthSessionBridge: ({ children }: { children: React.ReactNode }) => {
    renderOrder.push("auth");
    return <div data-auth-session-bridge>{children}</div>;
  },
}));
vi.mock("./lib/license", () => ({
  LicenseProvider: ({ children }: { children: React.ReactNode }) => {
    renderOrder.push("license");
    return <div data-license-provider>{children}</div>;
  },
}));
vi.mock("./overlay/CompositeApp", () => ({ CompositeApp: () => <div>composite</div> }));
vi.mock("./overlay/ObsOverlayApp", () => ({ ObsOverlayApp: () => <div>obs</div> }));
vi.mock("./hub/HubApp", () => ({ HubApp: () => <div>hub</div> }));
vi.mock("./hub/auth/OAuthCallbackHandler", () => ({ OAuthCallbackHandler: () => <div>oauth</div> }));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("AppShell", () => {
  it("registers built-in systems once before the runtime bridge renders", () => {
    expect(registration).toHaveBeenCalledTimes(1);
    renderOrder.length = 0;

    render(<AppRuntime />);

    expect(renderOrder).toEqual(["auth", "license"]);
    expect(screen.getByText("composite").closest("[data-auth-session-bridge]")).toBeTruthy();
    expect(screen.getByText("composite").closest("[data-license-provider]")).toBeTruthy();
  });

  it.each([
    ["OBS path", "/overlay/active", "", "", "obs"],
    ["OBS query", "/", "", "?obs=1", "obs"],
    ["OAuth callback", "/", "#/auth/callback", "", "oauth"],
    ["Hub", "/", "#/hub", "", "hub"],
    ["Composite", "/", "", "", "composite"],
  ])("routes %s through the single AuthSessionBridge", (_name, path, hash, search, expected) => {
    window.history.replaceState(null, "", `${path}${search}${hash}`);

    render(<AppRuntime />);

    expect(screen.getByText(expected).closest("[data-auth-session-bridge]")).toBeTruthy();
  });

  it("uses the supplied internal Workshop route without a second router", () => {
    window.history.replaceState(null, "", "/workshop");
    render(<AppRuntime WorkshopRoute={() => <div>workshop</div>} />);
    expect(screen.getByText("workshop").closest("[data-auth-session-bridge]")).toBeTruthy();
    expect(screen.getByText("workshop").closest("[data-license-provider]")).toBeTruthy();
  });
});
