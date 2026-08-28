import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRuntime } from "./AppShell";

const registration = vi.hoisted(() => vi.fn());
const authBridge = vi.hoisted(() => vi.fn(({ children }: { children: React.ReactNode }) => (
  <div data-auth-session-bridge>{children}</div>
)));

vi.mock("./hub/registry/builtin-systems", () => ({
  registerBuiltinDesignSystems: registration,
}));
vi.mock("./lib/AuthSessionBridge", () => ({ AuthSessionBridge: authBridge }));
vi.mock("./overlay/CompositeApp", () => ({ CompositeApp: () => <div>composite</div> }));
vi.mock("./overlay/ObsOverlayApp", () => ({ ObsOverlayApp: () => <div>obs</div> }));
vi.mock("./hub/HubApp", () => ({ HubApp: () => <div>hub</div> }));
vi.mock("./hub/auth/OAuthCallbackHandler", () => ({ OAuthCallbackHandler: () => <div>oauth</div> }));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("AppShell", () => {
  it("registers built-in systems once and renders without the retired Supabase bridge", () => {
    expect(registration).toHaveBeenCalledTimes(1);

    render(<AppRuntime />);

    expect(screen.getByText("composite")).toBeTruthy();
    expect(authBridge).not.toHaveBeenCalled();
    expect(document.querySelector("[data-auth-session-bridge]")).toBeNull();
  });

  it.each([
    ["OBS path", "/overlay/active", "", "", "obs"],
    ["OBS query", "/", "", "?obs=1", "obs"],
    ["OAuth callback", "/", "#/auth/callback", "", "oauth"],
    ["Hub", "/", "#/hub", "", "hub"],
    ["Composite", "/", "", "", "composite"],
  ])("routes %s without adding an auth wrapper to overlay windows", (_name, path, hash, search, expected) => {
    window.history.replaceState(null, "", `${path}${search}${hash}`);

    render(<AppRuntime />);

    expect(screen.getByText(expected)).toBeTruthy();
  });
});
