import { type AuthResult, requireUserAuth } from "../_shared/auth.ts";
import { handleCorsPreflight } from "../_shared/cors.ts";
import type { BillingEnvironment } from "../_shared/mapping.ts";
import {
  type CreateCustomerSessionResult,
  createPolarCustomerSession,
  PolarClientError,
  publicPolarErrorExtras,
  requirePolarEnvironment,
} from "../_shared/polar.ts";
import { isUuid, readJsonObject } from "../_shared/request.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

export const POLAR_BILLING_PROVIDER = "polar";
export type BillingCustomerLookup = { providerCustomerId: string };
export type PortalDeps = {
  requireAuth?: (req: Request) => Promise<AuthResult>;
  lookupBillingCustomer?: (
    userId: string,
    environment: BillingEnvironment,
  ) => Promise<BillingCustomerLookup | null>;
  createCustomerSession?: (
    params: Parameters<typeof createPolarCustomerSession>[0],
    options?: { signal?: AbortSignal },
  ) => Promise<CreateCustomerSessionResult>;
  getPortalReturnUrl?: () => string | null | undefined;
  getPortalReturnAllowlist?: () => string | null | undefined;
  getEnvironment?: () => string | null | undefined;
};

const MAX_BODY_BYTES = 4096;
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

function canonicalHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function resolvePortalReturnUrl(
  body: Record<string, unknown>,
  defaultRaw: string | null | undefined,
  allowlistRaw: string | null | undefined,
): { ok: true; url: string } | { ok: false; code: string; message: string } {
  const defaultUrl = canonicalHttpsUrl(defaultRaw);
  if (!defaultUrl) {
    return {
      ok: false,
      code: "portal_return_url_not_configured",
      message: "PORTAL_RETURN_URL is required",
    };
  }
  let configured: unknown = [];
  if (allowlistRaw?.trim()) {
    try {
      configured = JSON.parse(allowlistRaw);
    } catch {
      return {
        ok: false,
        code: "portal_return_allowlist_invalid",
        message: "Portal return allowlist is invalid",
      };
    }
  }
  if (!Array.isArray(configured)) {
    return {
      ok: false,
      code: "portal_return_allowlist_invalid",
      message: "Portal return allowlist is invalid",
    };
  }
  const allowed = new Set([defaultUrl]);
  for (const entry of configured) {
    const url = canonicalHttpsUrl(entry);
    if (!url) {
      return {
        ok: false,
        code: "portal_return_allowlist_invalid",
        message: "Portal return allowlist is invalid",
      };
    }
    allowed.add(url);
  }
  if (!("returnUrl" in body)) return { ok: true, url: defaultUrl };
  const requested = canonicalHttpsUrl(body.returnUrl);
  if (!requested || !allowed.has(requested)) {
    return {
      ok: false,
      code: "invalid_return_url",
      message: "returnUrl is not allowed",
    };
  }
  return { ok: true, url: requested };
}

async function defaultLookupBillingCustomer(
  userId: string,
  environment: BillingEnvironment,
): Promise<BillingCustomerLookup | null> {
  const { data, error } = await getSupabaseAdmin().from("billing_customers")
    .select("provider_customer_id").eq("user_id", userId)
    .eq("provider", POLAR_BILLING_PROVIDER)
    .eq("environment", environment).maybeSingle();
  if (error) {
    console.error("billing-portal billing customer lookup failed", {
      code: error.code,
    });
    throw new Error("billing_customer_lookup_failed");
  }
  return data?.provider_customer_id
    ? { providerCustomerId: data.provider_customer_id }
    : null;
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
  const auth = await (deps.requireAuth ?? requireUserAuth)(req);
  if (!auth.ok) return auth.response;
  if (!isUuid(auth.userId)) {
    return errorResponse(
      "invalid_account",
      "Authenticated account is invalid",
      401,
    );
  }

  const parsed = await readJsonObject(req, MAX_BODY_BYTES, true);
  if (!parsed.ok) {
    return errorResponse(
      parsed.code,
      parsed.message,
      parsed.code === "body_too_large" ? 413 : 400,
    );
  }
  for (const field of FORBIDDEN_CLIENT_FIELDS) {
    if (field in parsed.value) {
      return errorResponse(
        "forbidden_field",
        `Field "${field}" is not accepted from client`,
        400,
      );
    }
  }
  if (Object.keys(parsed.value).some((key) => key !== "returnUrl")) {
    return errorResponse(
      "unexpected_field",
      "Request contains an unsupported field",
      400,
    );
  }

  const returnUrl = resolvePortalReturnUrl(
    parsed.value,
    deps.getPortalReturnUrl?.() ?? Deno.env.get("PORTAL_RETURN_URL"),
    deps.getPortalReturnAllowlist?.() ??
      Deno.env.get("PORTAL_RETURN_URL_ALLOWLIST"),
  );
  if (!returnUrl.ok) {
    return errorResponse(
      returnUrl.code,
      returnUrl.message,
      returnUrl.code === "invalid_return_url" ? 400 : 503,
    );
  }

  let environment;
  try {
    environment = requirePolarEnvironment(
      deps.getEnvironment?.() ?? Deno.env.get("POLAR_ENVIRONMENT"),
    );
  } catch (error) {
    if (error instanceof PolarClientError) {
      return errorResponse(error.code, error.message, error.status);
    }
    return errorResponse(
      "polar_environment_invalid",
      "Polar environment is invalid",
      503,
    );
  }

  let customer;
  try {
    customer =
      await (deps.lookupBillingCustomer ?? defaultLookupBillingCustomer)(
        auth.userId,
        environment,
      );
  } catch {
    return errorResponse(
      "internal_error",
      "Billing customer could not be resolved",
      500,
    );
  }
  if (!customer) {
    return errorResponse(
      "billing_customer_not_found",
      "No Polar billing customer found for this user",
      404,
    );
  }

  try {
    const session =
      await (deps.createCustomerSession ?? createPolarCustomerSession)(
        {
          customerId: customer.providerCustomerId,
          returnUrl: returnUrl.url,
          environment,
        },
        { signal: req.signal },
      );
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

if (import.meta.main) Deno.serve((req) => handlePortalRequest(req));
