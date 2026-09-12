import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { translate } from "../../i18n/i18n";

const { isClerkConfiguredMock, loadClerkMock, clerkInstance } = vi.hoisted(() => ({
  isClerkConfiguredMock: vi.fn(),
  loadClerkMock: vi.fn(),
  clerkInstance: {
    mountSignIn: vi.fn(),
    unmountSignIn: vi.fn(),
    addListener: vi.fn(() => vi.fn()),
    signOut: vi.fn().mockResolvedValue(undefined),
    session: undefined,
  },
}));

vi.mock("../../lib/clerk-auth", () => ({
  isClerkConfigured: isClerkConfiguredMock,
  loadClerk: loadClerkMock,
  getClerkSessionToken: vi.fn(),
  signOutClerk: vi.fn(),
}));

import { LoginScreen } from "./LoginScreen";

// Claves del formulario Supabase retirado en ISA-915: siguen traducidas pero ya
// no se renderizan. Esta lista las documenta como pendientes de la limpieza de
// catálogo (decisión aparte) y las mantiene referenciadas para el audit i18n.
const RETIRED_SUPABASE_FORM_KEYS = [
  "auth.email",
  "auth.password",
  "auth.signInWithGoogle",
  "auth.signInWithDiscord",
  "auth.createAccount",
  "auth.forgotPassword",
  "auth.checkEmail",
  "auth.checkEmailDesc",
  "auth.cancelWaiting",
  "auth.backToLogin",
  "auth.resetSent",
  "auth.googleHint",
  "auth.or",
  "auth.openingGoogle",
  "auth.opening",
  "auth.oauthError",
  "auth.noAuthUrl",
  "auth.waitingForAuth",
  "auth.completeWith",
  "auth.inBrowser",
  "auth.signUpTitle",
  "auth.resetTitle",
  "auth.loginButton",
  "auth.signupButton",
  "auth.sendLink",
  "auth.noAccount",
  "auth.haveAccount",
] as const;

describe("LoginScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    clerkInstance.session = undefined;
  });

  it("shows a visible config error when the publishable key is missing", async () => {
    isClerkConfiguredMock.mockReturnValue(false);
    render(<LoginScreen />);
    expect(await screen.findByTestId("login-error")).toBeTruthy();
    expect(
      screen.getByText(/no está configurado/i),
    ).toBeTruthy();
    expect(screen.getByTestId("login-retry")).toBeTruthy();
    expect(loadClerkMock).not.toHaveBeenCalled();
    expect(clerkInstance.mountSignIn).not.toHaveBeenCalled();
  });

  it("shows a loading state while Clerk is loading", () => {
    isClerkConfiguredMock.mockReturnValue(true);
    loadClerkMock.mockReturnValue(new Promise(() => {}));
    render(<LoginScreen />);
    expect(screen.getByTestId("login-loading")).toBeTruthy();
    expect(screen.getByText(/cargando acceso/i)).toBeTruthy();
  });

  it("mounts Clerk SignIn with hash routing once loaded", async () => {
    isClerkConfiguredMock.mockReturnValue(true);
    loadClerkMock.mockResolvedValue(clerkInstance);
    render(<LoginScreen />);
    await waitFor(() => expect(clerkInstance.mountSignIn).toHaveBeenCalled());
    const [node, props] = clerkInstance.mountSignIn.mock.calls[0] as [
      HTMLDivElement,
      { routing?: string },
    ];
    expect(node).toBe(screen.getByTestId("clerk-signin-host"));
    expect(props.routing).toBe("hash");
  });

  it("shows a load error and retries the effect on click", async () => {
    isClerkConfiguredMock.mockReturnValue(true);
    loadClerkMock.mockRejectedValueOnce(new Error("offline"));
    render(<LoginScreen />);
    expect(await screen.findByTestId("login-error")).toBeTruthy();
    expect(screen.getByText(/no se pudo cargar/i)).toBeTruthy();
    loadClerkMock.mockResolvedValue(clerkInstance);
    fireEvent.click(screen.getByTestId("login-retry"));
    await waitFor(() => expect(clerkInstance.mountSignIn).toHaveBeenCalled());
    expect(loadClerkMock).toHaveBeenCalledTimes(2);
  });

  it("unmounts the Clerk SignIn when the screen unmounts", async () => {
    isClerkConfiguredMock.mockReturnValue(true);
    loadClerkMock.mockResolvedValue(clerkInstance);
    const { unmount } = render(<LoginScreen />);
    await waitFor(() => expect(clerkInstance.mountSignIn).toHaveBeenCalled());
    unmount();
    expect(clerkInstance.unmountSignIn).toHaveBeenCalledWith(
      clerkInstance.mountSignIn.mock.calls[0][0],
    );
  });

  it("keeps the retired Supabase form keys translated but off the screen", () => {
    for (const key of RETIRED_SUPABASE_FORM_KEYS) {
      expect(translate("es", key)).not.toBe(key);
    }
    isClerkConfiguredMock.mockReturnValue(false);
    render(<LoginScreen />);
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    expect(screen.queryByLabelText(/contraseña/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /entrar/i })).toBeNull();
  });
});
