import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: {
    isConfigured: true,
    isLoaded: true,
    isSignedIn: false,
    user: null,
    validationError: null as "token_unavailable" | null,
    validateLicense: vi.fn<() => Promise<boolean>>(),
    signOut: vi.fn<() => Promise<void>>(),
  },
  signIn: vi.fn((props: Record<string, unknown>) => (
    <div
      data-testid="clerk-sign-in"
      data-routing={String(props.routing)}
      data-path={String(props.path)}
    />
  )),
}));

vi.mock("@clerk/react", () => ({ SignIn: (props: Record<string, unknown>) => state.signIn(props) }));
vi.mock("../../lib/clerk-auth", () => ({ useClerkAuth: () => state.auth }));

import { LoginScreen } from "./LoginScreen";

describe("LoginScreen Clerk", () => {
  beforeEach(() => {
    state.auth.isConfigured = true;
    state.auth.isLoaded = true;
    state.auth.isSignedIn = false;
    state.auth.validationError = null;
    state.auth.validateLicense.mockReset().mockResolvedValue(true);
    state.auth.signOut.mockReset().mockResolvedValue(undefined);
    state.signIn.mockClear();
  });

  afterEach(cleanup);

  it("shows an actionable configuration error instead of a blank screen", () => {
    state.auth.isConfigured = false;

    render(<LoginScreen />);

    expect(screen.getByTestId("login-configuration-error")).toBeTruthy();
    expect(screen.getByText(/VITE_CLERK_PUBLISHABLE_KEY/i)).toBeTruthy();
    expect(screen.queryByTestId("clerk-sign-in")).toBeNull();
  });

  it("shows a stable loading state while Clerk restores its session", () => {
    state.auth.isLoaded = false;

    render(<LoginScreen />);

    expect(screen.getByTestId("login-clerk-loading")).toBeTruthy();
    expect(screen.queryByTestId("clerk-sign-in")).toBeNull();
  });

  it("renders the official Clerk sign-in with path routing", () => {
    render(<LoginScreen />);

    expect(screen.getByTestId("clerk-sign-in").getAttribute("data-routing")).toBe("path");
    expect(screen.getByTestId("clerk-sign-in").getAttribute("data-path")).toBe("/");
    expect(state.signIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows token failure and retries with a fresh token request", async () => {
    state.auth.isSignedIn = true;
    state.auth.validationError = "token_unavailable";

    render(<LoginScreen />);
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));

    await waitFor(() => expect(state.auth.validateLicense).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("clerk-sign-in")).toBeNull();
  });

  it("explains that an active session is validating instead of remounting sign-in", () => {
    state.auth.isSignedIn = true;

    render(<LoginScreen />);

    expect(screen.getByTestId("login-clerk-validating")).toBeTruthy();
    expect(screen.queryByTestId("clerk-sign-in")).toBeNull();
  });
});
