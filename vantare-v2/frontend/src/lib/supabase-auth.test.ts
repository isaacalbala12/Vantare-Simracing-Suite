import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  signInWithPassword,
  signOutFn,
  getSessionFn,
  signInWithOAuthFn,
  setSessionFn,
  createClient,
} = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOutFn: vi.fn(),
  getSessionFn: vi.fn(),
  signInWithOAuthFn: vi.fn(),
  setSessionFn: vi.fn(),
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
        setSession: setSessionFn,
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
  setSupabaseSession,
} from "./supabase-auth";

describe("supabase-auth", () => {
  beforeEach(() => {
    resetSupabaseClient();
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    signInWithPassword.mockReset();
    signOutFn.mockReset();
    getSessionFn.mockReset();
    setSessionFn.mockReset();
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
    it("returns OAuth URL with skipBrowserRedirect and callback redirect", async () => {
      signInWithOAuthFn.mockResolvedValueOnce({
        data: { url: "https://accounts.google.com/o/oauth2/auth?..." },
        error: null,
      });
      const result = await signInWithOAuth("google");
      expect(result.error).toBeUndefined();
      expect(result.url).toBe("https://accounts.google.com/o/oauth2/auth?...");
      expect(signInWithOAuthFn).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: "http://127.0.0.1:39261/auth/callback",
          skipBrowserRedirect: true,
        },
      });
    });

    it("surfaces error from provider", async () => {
      signInWithOAuthFn.mockResolvedValueOnce({
        data: { url: null },
        error: { message: "denied" },
      });
      const result = await signInWithOAuth("discord");
      expect(result.error).toBe("denied");
      expect(result.url).toBeUndefined();
    });

    it("uses VITE_OAUTH_REDIRECT_URL when present", async () => {
      vi.stubEnv(
        "VITE_OAUTH_REDIRECT_URL",
        "https://app.example.com/auth/callback",
      );
      signInWithOAuthFn.mockResolvedValueOnce({
        data: { url: "https://accounts.google.com/..." },
        error: null,
      });
      await signInWithOAuth("google");
      expect(signInWithOAuthFn).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: "https://app.example.com/auth/callback",
          skipBrowserRedirect: true,
        },
      });
    });

    it("returns a clear config error when env vars are missing", async () => {
      vi.stubEnv("VITE_SUPABASE_URL", "");
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
      resetSupabaseClient();
      const result = await signInWithOAuth("google");
      expect(result.error).toMatch(/Supabase no configurado/);
    });
  });

  describe("setSupabaseSession", () => {
    it("calls supabase.auth.setSession with both tokens on success", async () => {
      setSessionFn.mockResolvedValueOnce({ error: null });
      const result = await setSupabaseSession("access-123", "refresh-456");
      expect(result.error).toBeUndefined();
      expect(setSessionFn).toHaveBeenCalledWith({
        access_token: "access-123",
        refresh_token: "refresh-456",
      });
    });

    it("returns error when access_token is empty", async () => {
      const result = await setSupabaseSession("");
      expect(result.error).toBe("access_token is required");
      expect(setSessionFn).not.toHaveBeenCalled();
    });

    it("returns error when refresh_token is missing", async () => {
      const result = await setSupabaseSession("access-123");
      expect(result.error).toMatch(/refresh_token is required/);
      expect(setSessionFn).not.toHaveBeenCalled();
    });

    it("surfaces error from supabase.auth.setSession", async () => {
      setSessionFn.mockResolvedValueOnce({ error: { message: "invalid token" } });
      const result = await setSupabaseSession("access-123", "refresh-456");
      expect(result.error).toBe("invalid token");
    });

    it("returns a clear config error when env vars are missing", async () => {
      vi.stubEnv("VITE_SUPABASE_URL", "");
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
      resetSupabaseClient();
      const result = await setSupabaseSession("access-123", "refresh-456");
      expect(result.error).toMatch(/Supabase no configurado/);
    });
  });
});
