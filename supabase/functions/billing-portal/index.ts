import { requireUserAuth, type AuthResult } from "../_shared/auth.ts";
import { handleCorsPreflight } from "../_shared/cors.ts";
import {
  createPolarCustomerSession,
  PolarClientError,
  publicPolarErrorExtras,
  type CreateCustomerSessionResult,
} from "../_shared/polar.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

export const POLAR_BILLING_PROVIDER = "polar";

export type BillingCustomerLookup = {
  providerCustomerId: string;
};

export type PortalDeps = {
  requireAuth?: (req: Request) => Promise<AuthResult>;
  lookupBillingCustomer?: (
    userId: string,
  ) => Promise<BillingCustomerLookup | null>;
  createCustomerSession?: (
    params: Parameters<typeof createPolarCustomerSession>[0],
  ) => Promise<CreateCustomerSessionResult>;
  getPortalReturnUrl?: () => string | null | undefined;
};

const FORBIDDEN_CLIENT_FIELDS = [
  "providerCustomerId",
  "provider_customer_id",
  "userId",
  "user_id",
  "customerId",
  "customer_id",
  "polarCustomerId",
  "polar_customer_id",
  "externalCustomerId",
  "external_customer_id",
  "email",
] as const;

export function isValidHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function resolvePortalReturnUrl(
  body: Record<string, unknown>,
  getDefault?: () => string | null | undefined,
): { ok: true; url: string } | { ok: false; code: string; message: string } {
  const fromBody = typeof body.returnUrl === "string"
    ? body.returnUrl.trim()
    : "";
  if (fromBody) {
    if (!isValidHttpsUrl(fromBody)) {
      return {
        ok: false,
        code: "invalid_return_url",
        message: "returnUrl must be a valid HTTPS URL",
      };
    }
    return { ok: true, url: fromBody };
  }

  const fromEnv = (getDefault?.() ?? Deno.env.get("PORTAL_RETURN_URL") ?? "")
    .trim();
  if (!fromEnv || !isValidHttpsUrl(fromEnv)) {
    return {
      ok: false,
      code: "portal_return_url_not_configured",
      message: "PORTAL_RETURN_URL is required",
    };
  }

  return { ok: true, url: fromEnv };
}

async function defaultLookupBillingCustomer(
  userId: string,
): Promise<BillingCustomerLookup | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("billing_customers")
    .select("provider_customer_id")
    .eq("user_id", userId)
    .eq("provider", POLAR_BILLING_PROVIDER)
    .maybeSingle();

  if (error) {
    console.error("billing-portal billing_customers lookup failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("billing_customer_lookup_failed");
  }

  if (!data?.provider_customer_id) return null;
  return { providerCustomerId: data.provider_customer_id };
}

export async function handlePortalRequest(
  req: Request,
  deps: PortalDeps = {},
): Promise<Response> {
  const cors = handleCorsPreflight(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("method_not_allowed", "Only POST is supported", 405);
  }

  const requireAuth = deps.requireAuth ?? requireUserAuth;
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown> = {};
  const rawBody = await req.text();
  if (rawBody.trim()) {
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return errorResponse("invalid_json", "Request body must be a JSON object", 400);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return errorResponse("invalid_json", "Request body must be JSON", 400);
    }
  }

  for (const field of FORBIDDEN_CLIENT_FIELDS) {
    if (field in body) {
      return errorResponse(
        "forbidden_field",
        `Field "${field}" is not accepted from client`,
        400,
      );
    }
  }

  const returnUrl = resolvePortalReturnUrl(body, deps.getPortalReturnUrl);
  if (!returnUrl.ok) {
    const status = returnUrl.code === "invalid_return_url" ? 400 : 503;
    return errorResponse(returnUrl.code, returnUrl.message, status);
  }

  const lookupBillingCustomer = deps.lookupBillingCustomer ??
    defaultLookupBillingCustomer;

  let billingCustomer: BillingCustomerLookup | null;
  try {
    billingCustomer = await lookupBillingCustomer(auth.userId);
  } catch {
    return errorResponse(
      "internal_error",
      "Billing customer could not be resolved",
      500,
    );
  }

  if (!billingCustomer) {
    return errorResponse(
      "billing_customer_not_found",
      "No Polar billing customer found for this user",
      404,
    );
  }

  const createCustomerSession = deps.createCustomerSession ??
    createPolarCustomerSession;

  try {
    const session = await createCustomerSession({
      customerId: billingCustomer.providerCustomerId,
      returnUrl: returnUrl.url,
    });

    return jsonResponse({ url: session.url }, 200);
  } catch (error) {
    if (error instanceof PolarClientError) {
      return errorResponse(
        error.code,
        error.message,
        error.status,
        publicPolarErrorExtras(error.details),
      );
    }
    console.error("billing-portal unexpected error");
    return errorResponse(
      "internal_error",
      "Customer portal could not be opened",
      500,
    );
  }
}

if (import.meta.main) {
  Deno.serve((req) => handlePortalRequest(req));
}