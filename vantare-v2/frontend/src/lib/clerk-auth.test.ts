import { beforeEach, describe, expect, it, vi } from "vitest";

const { clerkLoad, clerkSignOut, clerkCtor } = vi.hoisted(() => ({
  clerkLoad: vi.fn(),
  clerkSignOut: vi.fn(),
  clerkCtor: vi.fn(),
}));

vi.mock("@clerk/clerk-js", () => ({
  Clerk: class {
    load = clerkLoad;
    signOut = clerkSignOut;
    session = undefined;
    constructor(key: string) {
      clerkCtor(key);
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
    expect(clerkCtor).toHaveBeenCalledWith("pk_test_x");
    expect(clerkLoad).toHaveBeenCalledTimes(1);
    expect(clerkLoad).toHaveBeenCalledWith(
      expect.objectContaining({ standardBrowser: false, ui: { ClerkUI: "fake-ui" } }),
    );
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
