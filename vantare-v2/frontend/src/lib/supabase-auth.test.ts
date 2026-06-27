import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  signInWithPassword,
  signOutFn,
  getSessionFn,
  signInWithOAuthFn,
  createClient,
} = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOutFn: vi.fn(),
  getSessionFn: vi.fn(),
  signInWithOAuthFn: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    createClient(...args);
    return {
      auth: {
        signInWithPassword,
        signOut: signOutFn,
        getSession: getSessionFn,
        signInWithOAuth: signInWithOAuthFn,
      },
    };
  },
}));

import {
  getSupabaseClient,
  resetSupabaseClient,
  signInWithEmail,
  signOut as authSignOut,
  getSession,
  signInWithOAuth,
} from "./supabase-auth";

describe("supabase-auth", () => {
  beforeEach(() => {
    resetSupabaseClient();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    signInWithPassword.mockReset();
    signOutFn.mockReset();
    getSessionFn.mockReset();
    signInWithOAuthFn.mockReset();
    createClient.mockClear();
  });

  describe("getSupabaseClient", () => {
    it("returns a singleton client", () => {
      const a = getSupabaseClient();
      const b = getSupabaseClient();
      expect(a).toBe(b);
      expect(createClient).toHaveBeenCalledTimes(1);
      expect(createClient).toHaveBeenCalledWith(
        "https://test.supabase.co",
        "test-anon-key",
        expect.any(Object),
      );
    });

    it("throws a clear error when env vars are missing", () => {
      vi.stubEnv("VITE_SUPABASE_URL", "");
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
      resetSupabaseClient();
      expect(() => getSupabaseClient()).toThrow(
        /Supabase no configurado: faltan VITE_SUPABASE_URL/,
      );
    });
  });

  describe("signInWithEmail", () => {
    it("returns session on success", async () => {
      signInWithPassword.mockResolvedValueOnce({
        data: { session: { access_token: "tok" } },
        error: null,
      });

      const result = await signInWithEmail("u@example.com", "pass");
      expect(result.session?.access_token).toBe("tok");
      expect(result.error).toBeUndefined();
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: "u@example.com",
        password: "pass",
      });
    });

    it("returns error when supabase rejects", async () => {
      signInWithPassword.mockResolvedValueOnce({
        data: { session: null },
        error: { message: "Invalid credentials" },
      });

      const result = await signInWithEmail("u@example.com", "bad");
      expect(result.session).toBeNull();
      expect(result.error).toBe("Invalid credentials");
    });

    it("returns a clear config error when env vars are missing", async () => {
      vi.stubEnv("VITE_SUPABASE_URL", "");
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
      resetSupabaseClient();
      const result = await signInWithEmail("u@example.com", "pass");
      expect(result.session).toBeNull();
      expect(result.error).toMatch(/Supabase no configurado/);
    });
  });

  describe("signOut", () => {
    it("returns undefined error on success", async () => {
      signOutFn.mockResolvedValueOnce({ error: null });
      const result = await authSignOut();
      expect(result.error).toBeUndefined();
    });

    it("returns error message when supabase fails", async () => {
      signOutFn.mockResolvedValueOnce({ error: { message: "boom" } });
      const result = await authSignOut();
      expect(result.error).toBe("boom");
    });

    it("returns a clear config error when env vars are missing", async () => {
      vi.stubEnv("VITE_SUPABASE_URL", "");
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
      resetSupabaseClient();
      const result = await authSignOut();
      expect(result.error).toMatch(/Supabase no configurado/);
    });
  });

  describe("getSession", () => {
    it("returns current session", async () => {
      getSessionFn.mockResolvedValueOnce({
        data: { session: { access_token: "abc" } },
      });
      const result = await getSession();
      expect(result?.access_token).toBe("abc");
    });

    it("returns null when no session", async () => {
      getSessionFn.mockResolvedValueOnce({ data: { session: null } });
      const result = await getSession();
      expect(result).toBeNull();
    });

    it("returns null when env vars are missing", async () => {
      vi.stubEnv("VITE_SUPABASE_URL", "");
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
      resetSupabaseClient();
      const result = await getSession();
      expect(result).toBeNull();
    });
  });

  describe("signInWithOAuth", () => {
    it("calls signInWithOAuth with google and redirect", async () => {
      signInWithOAuthFn.mockResolvedValueOnce({ error: null });
      const result = await signInWithOAuth("google");
      expect(result.error).toBeUndefined();
      expect(signInWithOAuthFn).toHaveBeenCalledWith({
        provider: "google",
        options: { redirectTo: "http://localhost:34115/#/auth/callback" },
      });
    });

    it("calls signInWithOAuth with discord and surfaces error", async () => {
      signInWithOAuthFn.mockResolvedValueOnce({
        error: { message: "denied" },
      });
      const result = await signInWithOAuth("discord");
      expect(result.error).toBe("denied");
      expect(signInWithOAuthFn).toHaveBeenCalledWith({
        provider: "discord",
        options: { redirectTo: "http://localhost:34115/#/auth/callback" },
      });
    });

    it("uses VITE_OAUTH_REDIRECT_URL when present", async () => {
      vi.stubEnv(
        "VITE_OAUTH_REDIRECT_URL",
        "https://app.example.com/#/auth/callback",
      );
      signInWithOAuthFn.mockResolvedValueOnce({ error: null });
      await signInWithOAuth("google");
      expect(signInWithOAuthFn).toHaveBeenCalledWith({
        provider: "google",
        options: { redirectTo: "https://app.example.com/#/auth/callback" },
      });
    });

    it("returns a clear config error when env vars are missing", async () => {
      vi.stubEnv("VITE_SUPABASE_URL", "");
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
      resetSupabaseClient();
      const result = await signInWithOAuth("google");
      expect(result.error).toMatch(/Supabase no configurado/);
    });

    it("falls back to window.location.origin if it is a localhost port other than 3000", async () => {
      // Mock window.location.origin
      const originalLocation = window.location;
      // @ts-expect-error: delete read-only window.location to allow mocking in test
      delete window.location;
      // @ts-expect-error: assign mock URL object to window.location
      window.location = new URL("http://localhost:12345");

      vi.stubEnv("VITE_OAUTH_REDIRECT_URL", "");
      signInWithOAuthFn.mockResolvedValueOnce({ error: null });
      await signInWithOAuth("google");

      expect(signInWithOAuthFn).toHaveBeenCalledWith({
        provider: "google",
        options: { redirectTo: "http://localhost:12345/#/auth/callback" },
      });

      // Restore
      // @ts-expect-error: restore original window.location object after test
      window.location = originalLocation;
    });
  });
});
