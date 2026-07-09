import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const getSessionMock = vi.fn();
const openURLMock = vi.fn();

vi.mock("./supabase-auth", () => ({
  getSession: () => getSessionMock(),
}));

vi.mock("@wailsio/runtime", () => ({
  Browser: {
    OpenURL: (...args: unknown[]) => openURLMock(...args),
  },
}));

async function loadBillingClient(enabled: boolean) {
  vi.stubEnv("VITE_BILLING_ENABLED", enabled ? "true" : "false");
  vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
  vi.resetModules();
  return import("./billing-client");
}

describe("billing-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockReset();
    openURLMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("BILLING_ENABLED is false by default", async () => {
    vi.stubEnv("VITE_BILLING_ENABLED", "false");
    vi.resetModules();
    const mod = await import("./billing-client");
    expect(mod.BILLING_ENABLED).toBe(false);
  });

  it("createBillingCheckout does not fetch when billing disabled", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const mod = await loadBillingClient(false);
    const res = await mod.createBillingCheckout("launch_lifetime");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("billing_not_available");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("openBillingPortal does not fetch when billing disabled", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const mod = await loadBillingClient(false);
    const res = await mod.openBillingPortal();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("billing_not_available");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("createBillingCheckout returns login_required without session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const mod = await loadBillingClient(true);
    const res = await mod.createBillingCheckout("launch_lifetime");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("login_required");
  });

  it("createBillingCheckout launch_lifetime sends only productKey with Bearer token", async () => {
    getSessionMock.mockResolvedValueOnce({ access_token: "user-jwt-token" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ url: "https://sandbox.polar.sh/checkout/x" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const mod = await loadBillingClient(true);
    const res = await mod.createBillingCheckout("launch_lifetime");
    expect(res.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test.supabase.co/functions/v1/billing-checkout");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer user-jwt-token");
    expect(headers.apikey).toBeUndefined();

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({ productKey: "launch_lifetime" });
    expect(openURLMock).toHaveBeenCalledWith("https://sandbox.polar.sh/checkout/x");
    fetchSpy.mockRestore();
  });

  it("createBillingCheckout pro_monthly sends only productKey", async () => {
    getSessionMock.mockResolvedValueOnce({ access_token: "user-jwt-token" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ url: "https://sandbox.polar.sh/checkout/pro" }), {
        status: 200,
      }),
    );

    const mod = await loadBillingClient(true);
    await mod.createBillingCheckout("pro_monthly");

    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body).toEqual({ productKey: "pro_monthly" });
    fetchSpy.mockRestore();
  });

  it("openBillingPortal sends empty object body", async () => {
    getSessionMock.mockResolvedValueOnce({ access_token: "user-jwt-token" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ url: "https://sandbox.polar.sh/portal/x" }), {
        status: 200,
      }),
    );

    const mod = await loadBillingClient(true);
    const res = await mod.openBillingPortal();
    expect(res.ok).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test.supabase.co/functions/v1/billing-portal");
    expect(JSON.parse(String(init.body))).toEqual({});
    fetchSpy.mockRestore();
  });

  it("maps billing_customer_not_found from portal 404", async () => {
    getSessionMock.mockResolvedValueOnce({ access_token: "user-jwt-token" });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "billing_customer_not_found" }),
        { status: 404 },
      ),
    );

    const mod = await loadBillingClient(true);
    const res = await mod.openBillingPortal();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("billing_customer_not_found");
  });

  it("returns server_error on non-2xx without leaking response body", async () => {
    getSessionMock.mockResolvedValueOnce({ access_token: "user-jwt-token" });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "polar_portal_failed",
          polar_error: "internal polar detail",
          token: "secret",
        }),
        { status: 502 },
      ),
    );

    const mod = await loadBillingClient(true);
    const res = await mod.openBillingPortal();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("server_error");
      expect(res.message).toBeUndefined();
    }
  });
});