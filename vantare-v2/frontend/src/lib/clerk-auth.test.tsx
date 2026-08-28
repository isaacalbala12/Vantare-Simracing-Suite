import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  provider: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="clerk-provider">{children}</div>
  )),
  auth: {
    isLoaded: false,
    isSignedIn: false as boolean | undefined,
    sessionId: null as string | null,
    getToken: vi.fn<() => Promise<string | null>>(),
  },
  user: { user: null as unknown },
  signOut: vi.fn<() => Promise<void>>(),
  eventsEmit: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  ClerkProvider: (props: { children: React.ReactNode; publishableKey: string }) =>
    clerk.provider(props),
  useAuth: () => clerk.auth,
  useUser: () => clerk.user,
  useClerk: () => ({ signOut: clerk.signOut }),
}));

vi.mock("@wailsio/runtime", () => ({
  Events: { Emit: (...args: unknown[]) => clerk.eventsEmit(...args) },
}));

import { ClerkAuthProvider, useClerkAuth } from "./clerk-auth";

function Probe() {
  const auth = useClerkAuth();
  return (
    <div>
      <span data-testid="configured">{String(auth.isConfigured)}</span>
      <span data-testid="loaded">{String(auth.isLoaded)}</span>
      <span data-testid="signed-in">{String(auth.isSignedIn)}</span>
      <span data-testid="validation-error">{auth.validationError ?? ""}</span>
      <button type="button" onClick={() => void auth.signOut()}>
        sign out
      </button>
    </div>
  );
}

describe("ClerkAuthProvider", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    clerk.provider.mockClear();
    clerk.eventsEmit.mockClear();
    clerk.signOut.mockReset().mockResolvedValue(undefined);
    clerk.auth.isLoaded = false;
    clerk.auth.isSignedIn = false;
    clerk.auth.sessionId = null;
    clerk.auth.getToken.mockReset().mockResolvedValue(null);
    clerk.user.user = null;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("fails visibly through context when the publishable key is absent", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");

    render(
      <ClerkAuthProvider>
        <Probe />
      </ClerkAuthProvider>,
    );

    expect(screen.getByTestId("configured").textContent).toBe("false");
    expect(screen.getByTestId("loaded").textContent).toBe("true");
    expect(clerk.provider).not.toHaveBeenCalled();
  });

  it("exposes Clerk loading and signed-out state without validating", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_public");

    render(
      <ClerkAuthProvider>
        <Probe />
      </ClerkAuthProvider>,
    );

    expect(screen.getByTestId("clerk-provider")).toBeTruthy();
    expect(screen.getByTestId("loaded").textContent).toBe("false");
    expect(clerk.eventsEmit).not.toHaveBeenCalled();
  });

  it("gets a current Clerk token and validates the license for an active session", async () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_public");
    clerk.auth.isLoaded = true;
    clerk.auth.isSignedIn = true;
    clerk.auth.sessionId = "sess_123";
    clerk.auth.getToken.mockResolvedValue("clerk-jwt");

    render(
      <ClerkAuthProvider>
        <Probe />
      </ClerkAuthProvider>,
    );

    await waitFor(() => {
      expect(clerk.eventsEmit).toHaveBeenCalledWith("license:validate", {
        sessionToken: "clerk-jwt",
      });
    });
  });

  it.each([
    ["an empty token", async () => null],
    ["a rejected token request", async () => Promise.reject(new Error("network"))],
  ])("reports %s and never emits a tokenless validation", async (_name, getToken) => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_public");
    clerk.auth.isLoaded = true;
    clerk.auth.isSignedIn = true;
    clerk.auth.sessionId = "sess_123";
    clerk.auth.getToken.mockImplementation(getToken);

    render(
      <ClerkAuthProvider>
        <Probe />
      </ClerkAuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("validation-error").textContent).toBe("token_unavailable");
    });
    expect(clerk.eventsEmit).not.toHaveBeenCalled();
  });

  it("does not emit when token resolution finishes after unmount", async () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_public");
    clerk.auth.isLoaded = true;
    clerk.auth.isSignedIn = true;
    clerk.auth.sessionId = "sess_123";
    let resolveToken: (token: string) => void = () => undefined;
    clerk.auth.getToken.mockReturnValue(
      new Promise((resolve) => {
        resolveToken = resolve;
      }),
    );

    const view = render(
      <ClerkAuthProvider>
        <Probe />
      </ClerkAuthProvider>,
    );
    view.unmount();
    resolveToken("late-token");
    await Promise.resolve();

    expect(clerk.eventsEmit).not.toHaveBeenCalled();
  });

  it("delegates remote sign-out to Clerk", async () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_public");

    render(
      <ClerkAuthProvider>
        <Probe />
      </ClerkAuthProvider>,
    );
    screen.getByRole("button", { name: "sign out" }).click();

    await waitFor(() => expect(clerk.signOut).toHaveBeenCalledTimes(1));
  });
});
