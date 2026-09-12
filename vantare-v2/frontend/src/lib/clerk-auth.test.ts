import { beforeEach, describe, expect, it, vi } from "vitest";

const { clerkLoad, clerkSignOut, clerkCtor, beforeRequest, afterResponse } =
  vi.hoisted(() => ({
    clerkLoad: vi.fn(),
    clerkSignOut: vi.fn(),
    clerkCtor: vi.fn(),
    beforeRequest: { current: undefined as undefined | ((r: unknown) => unknown) },
    afterResponse: {
      current: undefined as undefined | ((r: unknown, res: unknown) => unknown),
    },
  }));

vi.mock("@clerk/clerk-js", () => ({
  Clerk: class {
    load = clerkLoad;
    signOut = clerkSignOut;
    session = undefined;
    __internal_onBeforeRequest(cb: (r: unknown) => unknown) {
      beforeRequest.current = cb;
    }
    __internal_onAfterResponse(cb: (r: unknown, res: unknown) => unknown) {
      afterResponse.current = cb;
    }
    constructor(key: string, options?: unknown) {
      clerkCtor(key, options);
    }
  },
}));

vi.mock("@clerk/ui", () => ({ ui: { ClerkUI: "fake-ui" } }));

async function importClerkAuth() {
  return import("./clerk-auth");
}

describe("clerk-auth", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    beforeRequest.current = undefined;
    afterResponse.current = undefined;
  });

  it("rejects with a descriptive error when the publishable key is missing", async () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
    const { isClerkConfigured, loadClerk } = await importClerkAuth();
    expect(isClerkConfigured()).toBe(false);
    await expect(loadClerk()).rejects.toThrow(/VITE_CLERK_PUBLISHABLE_KEY/);
    expect(clerkCtor).not.toHaveBeenCalled();
  });

  it("loads once with the bundled ui in non-standard-browser mode and caches the instance", async () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    clerkLoad.mockResolvedValue(undefined);
    const { isClerkConfigured, loadClerk } = await importClerkAuth();
    expect(isClerkConfigured()).toBe(true);
    const first = await loadClerk();
    const second = await loadClerk();
    expect(first).toBe(second);
    expect(clerkCtor).toHaveBeenCalledTimes(1);
    expect(clerkCtor).toHaveBeenCalledWith("pk_test_x", { proxyUrl: "/clerk" });
    expect(clerkLoad).toHaveBeenCalledTimes(1);
    expect(clerkLoad).toHaveBeenCalledWith(
      expect.objectContaining({ standardBrowser: false, ui: { ClerkUI: "fake-ui" } }),
    );
  });

  it("routes FAPI through the native channel and echoes the rotated client JWT", async () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    clerkLoad.mockResolvedValue(undefined);
    const { loadClerk } = await importClerkAuth();
    await loadClerk();
    expect(beforeRequest.current).toBeTypeOf("function");
    expect(afterResponse.current).toBeTypeOf("function");

    const request = {
      credentials: "include" as string,
      url: new URL("https://app.local/clerk/v1/client"),
      headers: undefined as unknown,
    };
    beforeRequest.current?.(request);
    expect(request.credentials).toBe("omit");
    expect(request.url.searchParams.get("_is_native")).toBe("1");
    expect(request.headers).toBeUndefined();

    afterResponse.current?.(request, {
      headers: new Headers({ Authorization: "rotated-jwt" }),
    });
    beforeRequest.current?.(request);
    expect(request.headers.get("Authorization")).toBe("rotated-jwt");
  });

  it("does not cache a rejected load so the next call retries", async () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    clerkLoad.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    const { loadClerk } = await importClerkAuth();
    await expect(loadClerk()).rejects.toThrow("offline");
    await expect(loadClerk()).resolves.toBeTruthy();
    expect(clerkLoad).toHaveBeenCalledTimes(2);
  });

  it("resolves the current session token or null", async () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    const { getClerkSessionToken } = await importClerkAuth();
    const clerk = {
      session: { getToken: vi.fn().mockResolvedValue("jwt-1") },
    };
    await expect(
      getClerkSessionToken(clerk as unknown as import("@clerk/clerk-js").Clerk),
    ).resolves.toBe("jwt-1");
    await expect(
      getClerkSessionToken({ session: null } as unknown as import("@clerk/clerk-js").Clerk),
    ).resolves.toBeNull();
  });

  it("signs out through the loaded instance", async () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    clerkLoad.mockResolvedValue(undefined);
    clerkSignOut.mockResolvedValue(undefined);
    const { signOutClerk } = await importClerkAuth();
    await expect(signOutClerk()).resolves.toBeUndefined();
    expect(clerkSignOut).toHaveBeenCalledTimes(1);
  });
});
