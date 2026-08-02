import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  signInWithPassword,
  signOutFn,
  getSessionFn,
  signInWithOAuthFn,
  setSessionFn,
  createClient,
  eventsEmit,
	eventsOn,
	authStateChange,
	runtimeState,
} = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOutFn: vi.fn(),
  getSessionFn: vi.fn(),
  signInWithOAuthFn: vi.fn(),
  setSessionFn: vi.fn(),
  createClient: vi.fn(),
  eventsEmit: vi.fn(),
	eventsOn: vi.fn(),
	authStateChange: vi.fn(),
	runtimeState: { clearOK: true, autoClearAck: true },
}));

vi.mock("@wailsio/runtime", () => ({
	Events: { Emit: eventsEmit, On: eventsOn },
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
			onAuthStateChange: authStateChange,
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
	removeLegacySupabaseSessions,
	clearProtectedAuthSession,
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
    eventsEmit.mockReset();
		eventsOn.mockReset();
		authStateChange.mockReset();
		runtimeState.clearOK = true;
		runtimeState.autoClearAck = true;
		authStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
		const listeners = new Map<string, (event: { data?: Record<string, unknown> }) => void>();
		eventsOn.mockImplementation((name: string, callback: (event: { data?: Record<string, unknown> }) => void) => {
			listeners.set(name, callback);
			return vi.fn();
		});
		eventsEmit.mockImplementation((name: string, data?: { requestId?: string; provider?: string }) => {
			if (name === "auth:attempt:create") {
				const provider = data?.provider ?? "google";
				listeners.get("auth:attempt:created")?.({
					data: {
						requestId: data?.requestId ?? "",
						redirectUrl: `http://127.0.0.1:39261/auth/callback?attempt=a&provider=${provider}&state=s`,
					},
				});
			}
			if (name === "auth:session:clear:request" && runtimeState.autoClearAck) {
				listeners.get("auth:session:clear:result")?.({
					data: { requestId: data?.requestId ?? "", ok: runtimeState.clearOK },
				});
			}
		});
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
        { auth: { autoRefreshToken: true, persistSession: false } },
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
    it("confirms protected deletion before reporting success", async () => {
      signOutFn.mockResolvedValueOnce({ error: null });
      const result = await authSignOut();
		expect(result).toEqual({ localCleared: true, localError: undefined, remoteError: undefined });
		expect(eventsEmit).toHaveBeenCalledWith("auth:session:clear:request", expect.objectContaining({ requestId: expect.any(String) }));
    });

    it("separates a remote failure after confirmed local deletion", async () => {
      signOutFn.mockResolvedValueOnce({ error: { message: "boom" } });
      const result = await authSignOut();
		expect(result.localCleared).toBe(true);
		expect(result.remoteError).toBe("boom");
    });

	it("reports a protected-delete failure and still attempts remote signout", async () => {
		runtimeState.clearOK = false;
		signOutFn.mockResolvedValueOnce({ error: null });
		const result = await authSignOut();
		expect(result.localCleared).toBe(false);
		expect(result.localError).toMatch(/credencial protegida/);
		expect(signOutFn).toHaveBeenCalledTimes(1);
	});

    it("separates a config error from confirmed local deletion", async () => {
      vi.stubEnv("VITE_SUPABASE_URL", "");
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
      resetSupabaseClient();
      const result = await authSignOut();
		expect(result.localCleared).toBe(true);
		expect(result.remoteError).toMatch(/Supabase no configurado/);
    });
  });

	describe("clearProtectedAuthSession", () => {
		it("ignores an unrelated acknowledgement", async () => {
			runtimeState.autoClearAck = false;
			let settled = false;
			const promise = clearProtectedAuthSession(100);
			const callback = eventsOn.mock.calls.find(([name]) => name === "auth:session:clear:result")?.[1];
			const request = eventsEmit.mock.calls.find(([name]) => name === "auth:session:clear:request")?.[1];
			callback?.({ data: { requestId: "attacker", ok: true } });
			void promise.then(() => { settled = true; });
			await Promise.resolve();
			expect(settled).toBe(false);
			callback?.({ data: { requestId: request?.requestId, ok: true } });
			await expect(promise).resolves.toEqual({ ok: true });
		});

		it("fails closed when the backend does not acknowledge deletion", async () => {
			vi.useFakeTimers();
			runtimeState.autoClearAck = false;
			try {
				const promise = clearProtectedAuthSession(100);
				await vi.advanceTimersByTimeAsync(100);
				await expect(promise).resolves.toEqual({
					ok: false,
					error: expect.stringMatching(/no respondió/i),
				});
			} finally {
				vi.useRealTimers();
			}
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
					redirectTo: "http://127.0.0.1:39261/auth/callback?attempt=a&provider=google&state=s",
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

    it("creates the bound attempt before requesting the provider URL", async () => {
      signInWithOAuthFn.mockResolvedValueOnce({
        data: { url: "https://accounts.google.com/..." },
        error: null,
      });
      await signInWithOAuth("google");
			expect(eventsEmit.mock.invocationCallOrder[0]).toBeLessThan(signInWithOAuthFn.mock.invocationCallOrder[0]);
    });

    it("returns a clear config error when env vars are missing", async () => {
      vi.stubEnv("VITE_SUPABASE_URL", "");
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
      resetSupabaseClient();
      const result = await signInWithOAuth("google");
      expect(result.error).toMatch(/Supabase no configurado/);
    });

		it("does not contact Supabase when the backend cannot create an attempt", async () => {
			eventsEmit.mockImplementationOnce((_name: string, data: { requestId: string }) => {
				const errorListener = eventsOn.mock.calls.find(([event]) => event === "auth:attempt:error")?.[1];
				errorListener?.({ data: { requestId: data.requestId, message: "attempt denied" } });
			});
			const result = await signInWithOAuth("google");
			expect(result.error).toBe("attempt denied");
			expect(signInWithOAuthFn).not.toHaveBeenCalled();
		});
  });

	describe("legacy WebView storage", () => {
		it("removes old readable auth tokens without touching unrelated preferences", () => {
			localStorage.setItem("sb-project-auth-token", "readable-secret");
			localStorage.setItem("supabase.auth.token", "legacy-secret");
			localStorage.setItem("theme", "vantare");
			expect(removeLegacySupabaseSessions()).toBe(2);
			expect(localStorage.getItem("sb-project-auth-token")).toBeNull();
			expect(localStorage.getItem("supabase.auth.token")).toBeNull();
			expect(localStorage.getItem("theme")).toBe("vantare");
			localStorage.clear();
		});
	});

  describe("setSupabaseSession", () => {
    it("calls supabase.auth.setSession with both tokens on success", async () => {
      setSessionFn.mockResolvedValueOnce({
        data: { session: { access_token: "access-new", refresh_token: "refresh-new" } },
        error: null,
      });
      const result = await setSupabaseSession("access-123", "refresh-456");
      expect(result.error).toBeUndefined();
      expect(result.session?.access_token).toBe("access-new");
      expect(setSessionFn).toHaveBeenCalledWith({
        access_token: "access-123",
        refresh_token: "refresh-456",
      });
    });

    it("returns error when access_token is empty", async () => {
      const result = await setSupabaseSession("");
      expect(result.error).toBe("access_token is required");
      expect(result.session).toBeNull();
      expect(setSessionFn).not.toHaveBeenCalled();
    });

    it("returns error when refresh_token is missing", async () => {
      const result = await setSupabaseSession("access-123");
      expect(result.error).toMatch(/refresh_token is required/);
      expect(result.session).toBeNull();
      expect(setSessionFn).not.toHaveBeenCalled();
    });

    it("surfaces error from supabase.auth.setSession", async () => {
      setSessionFn.mockResolvedValueOnce({ data: { session: null }, error: { message: "invalid token" } });
      const result = await setSupabaseSession("access-123", "refresh-456");
      expect(result.error).toBe("invalid token");
      expect(result.session).toBeNull();
    });

		it("marks an authentication rejection as an invalid stored credential", async () => {
			setSessionFn.mockResolvedValueOnce({
				data: { session: null },
				error: { message: "Invalid Refresh Token", status: 400 },
			});
			const result = await setSupabaseSession("access", "refresh");
			expect(result.invalidCredential).toBe(true);
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
