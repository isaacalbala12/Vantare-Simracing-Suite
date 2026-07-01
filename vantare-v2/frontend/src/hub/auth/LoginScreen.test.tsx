import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const {
  mockOpenURL,
  mockSetSupabaseSession,
} = vi.hoisted(() => ({
  mockOpenURL: vi.fn().mockResolvedValue(undefined),
  mockSetSupabaseSession: vi.fn().mockResolvedValue({}),
}));

vi.mock("@wailsio/runtime", () => ({
  Browser: { OpenURL: (...args: unknown[]) => mockOpenURL(...args) },
  Events: {
    On: vi.fn(),
    Emit: vi.fn(),
  },
}));

vi.mock("../../lib/supabase-auth", () => ({
  signInWithEmail: vi.fn(),
  signInWithOAuth: vi.fn(),
  setSupabaseSession: mockSetSupabaseSession,
}));

import { Events } from "@wailsio/runtime";
import { LoginScreen } from "./LoginScreen";
import {
  signInWithEmail,
  signInWithOAuth,
} from "../../lib/supabase-auth";

describe("LoginScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("renders email and password inputs", () => {
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/contraseña/i)).toBeTruthy();
  });

  it("calls signInWithEmail with entered values and fires onLoggedIn on success", async () => {
    (signInWithEmail as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { session: { access_token: "tok" } },
    );
    const onLoggedIn = vi.fn();
    render(<LoginScreen onLoggedIn={onLoggedIn} />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "u@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
    expect(signInWithEmail).toHaveBeenCalledWith("u@example.com", "secret");
    await vi.waitFor(() => expect(onLoggedIn).toHaveBeenCalledWith("tok"));
  });

  it("shows error message when signInWithEmail rejects", async () => {
    (signInWithEmail as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { session: null, error: "Invalid credentials" },
    );
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "u@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
    expect(await screen.findByText(/invalid credentials/i)).toBeTruthy();
  });

  it("opens external browser for Google OAuth instead of navigating WebView", async () => {
    (signInWithOAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { url: "https://accounts.google.com/o/oauth2/auth?..." },
    );
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /continuar con google/i }),
    );
    expect(signInWithOAuth).toHaveBeenCalledWith("google");
    await vi.waitFor(() =>
      expect(mockOpenURL).toHaveBeenCalledWith(
        "https://accounts.google.com/o/oauth2/auth?...",
      ),
    );
  });

  it("shows waiting state after opening external browser for OAuth", async () => {
    (signInWithOAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { url: "https://accounts.google.com/..." },
    );
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /continuar con google/i }),
    );
    await vi.waitFor(() =>
      expect(screen.getByTestId("login-waiting-message")).toBeTruthy(),
    );
    expect(screen.getByText(/completa el inicio de sesión/i)).toBeTruthy();
    expect(screen.getByTestId("login-cancel-waiting")).toBeTruthy();
  });

  it("does NOT navigate window.location for OAuth (no WebView redirect)", async () => {
    const originalLocation = window.location.href;
    (signInWithOAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { url: "https://accounts.google.com/..." },
    );
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /continuar con google/i }),
    );
    await vi.waitFor(() => expect(mockOpenURL).toHaveBeenCalled());
    // Window location must not have changed — OAuth opens externally.
    expect(window.location.href).toBe(originalLocation);
  });

  it("shows error message when OAuth fails, not white screen", async () => {
    (signInWithOAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { error: "OAuth provider unavailable" },
    );
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /continuar con google/i }),
    );
    expect(await screen.findByText(/oauth provider unavailable/i)).toBeTruthy();
    // Should NOT be in waiting state
    expect(screen.queryByTestId("login-waiting-message")).toBeNull();
  });

  it("shows the primary Google button and a hint that Google is recommended", () => {
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    expect(screen.getByTestId("login-google-primary")).toBeTruthy();
    expect(screen.getByTestId("login-primary-hint")).toBeTruthy();
    expect(
      screen.getByText(/google es el acceso recomendado/i),
    ).toBeTruthy();
  });

  it("opens external browser for Discord OAuth", async () => {
    (signInWithOAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { url: "https://discord.com/api/oauth2/authorize?..." },
    );
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^discord$/i }));
    expect(signInWithOAuth).toHaveBeenCalledWith("discord");
    await vi.waitFor(() =>
      expect(mockOpenURL).toHaveBeenCalledWith(
        "https://discord.com/api/oauth2/authorize?...",
      ),
    );
  });

  it("cancel button returns to login form from waiting state", async () => {
    (signInWithOAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { url: "https://accounts.google.com/..." },
    );
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /continuar con google/i }),
    );
    await vi.waitFor(() =>
      expect(screen.getByTestId("login-cancel-waiting")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("login-cancel-waiting"));
    // Should be back to normal login form
    expect(screen.getByTestId("login-google-primary")).toBeTruthy();
    expect(screen.queryByTestId("login-waiting-message")).toBeNull();
  });

  it("does not call onLoggedIn when license:changed event has no accessToken", async () => {
    let eventCallback: ((event: { data: { state?: string; accessToken?: string } }) => void) | undefined;
    (Events.On as unknown as ReturnType<typeof vi.fn>).mockImplementation((event, cb) => {
      if (event === "license:changed") eventCallback = cb;
      return vi.fn();
    });

    (signInWithOAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { url: "https://accounts.google.com/..." },
    );
    const onLoggedIn = vi.fn();
    render(<LoginScreen onLoggedIn={onLoggedIn} />);
    fireEvent.click(
      screen.getByRole("button", { name: /continuar con google/i }),
    );
    await vi.waitFor(() => expect(eventCallback).toBeDefined());

    // Emit license:changed without accessToken (like Go's LicenseWire)
    eventCallback?.({ data: { state: "authenticated-valid" } });

    await vi.waitFor(() =>
      expect(screen.queryByTestId("login-waiting-message")).toBeNull(),
    );
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  it("calls setSupabaseSession when auth:session event fires with both tokens", async () => {
    let authSessionCallback: ((event: { data: { access_token?: string; refresh_token?: string } }) => void) | undefined;
    (Events.On as unknown as ReturnType<typeof vi.fn>).mockImplementation((event, cb) => {
      if (event === "auth:session") authSessionCallback = cb;
      return vi.fn();
    });

    render(<LoginScreen onLoggedIn={vi.fn()} />);

    // Simulate the auth:session event from the Go backend
    authSessionCallback?.({ data: { access_token: "at-123", refresh_token: "rt-456" } });

    await vi.waitFor(() => {
      expect(mockSetSupabaseSession).toHaveBeenCalledWith("at-123", "rt-456");
    });
  });

  it("does not call setSupabaseSession when auth:session has no refresh_token", async () => {
    let authSessionCallback: ((event: { data: { access_token?: string; refresh_token?: string } }) => void) | undefined;
    (Events.On as unknown as ReturnType<typeof vi.fn>).mockImplementation((event, cb) => {
      if (event === "auth:session") authSessionCallback = cb;
      return vi.fn();
    });

    render(<LoginScreen onLoggedIn={vi.fn()} />);

    authSessionCallback?.({ data: { access_token: "at-123" } });

    await vi.waitFor(() => {
      expect(mockSetSupabaseSession).not.toHaveBeenCalled();
    });
  });
});