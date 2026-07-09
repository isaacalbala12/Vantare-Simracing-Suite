export const BILLING_ENABLED =
  (import.meta.env.VITE_BILLING_ENABLED as string | undefined) === "true";

export type BillingErrorReason =
  | "billing_not_available"
  | "missing_provider_customer_id"
  | "network_error"
  | "server_error";

export type BillingResult =
  | { ok: true; url: string }
  | { ok: false; reason: BillingErrorReason; message?: string };

export type CheckoutInput = {
  productKey: string;
  email: string;
};

export type PortalInput = {
  providerCustomerId: string;
  returnUrl?: string;
};

function supabaseFunctionsBase(): string {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  return `${supabaseUrl}/functions/v1`;
}

export async function createCheckoutSession(
  input: CheckoutInput,
): Promise<BillingResult> {
  if (!BILLING_ENABLED) {
    return { ok: false, reason: "billing_not_available" };
  }
  try {
    const res = await fetch(`${supabaseFunctionsBase()}/billing-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productKey: input.productKey,
        email: input.email,
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: "server_error" };
    }
    const data = (await res.json()) as { url?: string };
    if (!data.url) {
      return { ok: false, reason: "server_error" };
    }
    return { ok: true, url: data.url };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

export async function openCustomerPortal(
  input: PortalInput,
): Promise<BillingResult> {
  if (!input.providerCustomerId) {
    return { ok: false, reason: "missing_provider_customer_id" };
  }
  if (!BILLING_ENABLED) {
    return { ok: false, reason: "billing_not_available" };
  }
  try {
    const res = await fetch(`${supabaseFunctionsBase()}/billing-portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerCustomerId: input.providerCustomerId,
        returnUrl: input.returnUrl,
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: "server_error" };
    }
    const data = (await res.json()) as { url?: string };
    if (!data.url) {
      return { ok: false, reason: "server_error" };
    }
    return { ok: true, url: data.url };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}