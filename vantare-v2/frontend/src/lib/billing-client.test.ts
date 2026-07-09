import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  BILLING_ENABLED,
  createCheckoutSession,
  openCustomerPortal,
} from "./billing-client";

describe("billing-client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("BILLING_ENABLED is false by default in Fase 1.6", () => {
    expect(BILLING_ENABLED).toBe(false);
  });

  it("createCheckoutSession returns billing_not_available when disabled", async () => {
    const res = await createCheckoutSession({
      productKey: "overlays",
      email: "u@example.com",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("billing_not_available");
  });

  it("openCustomerPortal returns billing_not_available when disabled", async () => {
    const res = await openCustomerPortal({ providerCustomerId: "cus_1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("billing_not_available");
  });

  it("openCustomerPortal rejects missing providerCustomerId", async () => {
    const res = await openCustomerPortal({ providerCustomerId: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("missing_provider_customer_id");
  });
});