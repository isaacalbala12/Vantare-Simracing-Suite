export const POLAR_API_NOT_IMPLEMENTED = "polar_api_not_implemented";

export type CreateCheckoutParams = {
  productId: string;
  userId: string;
  email: string | null;
  productKey: string;
  planSku: string;
  entitlementProductKey: string;
};

export type CreateCheckoutResult = {
  url: string;
  checkoutId: string | null;
};

export type CreateCustomerSessionParams = {
  customerId?: string;
  externalCustomerId?: string;
  returnUrl: string;
};

export type CreateCustomerSessionResult = {
  url: string;
  customerId: string | null;
  expiresAt: string | null;
};

/** @deprecated Use CreateCustomerSessionParams */
export type CreatePortalSessionParams = {
  polarCustomerId: string;
  returnUrl: string;
};

/** @deprecated Use CreateCustomerSessionResult */
export type CreatePortalSessionResult = {
  url: string;
};

export type PolarClientErrorDetails = {
  polar_status?: number;
  polar_error?: string;
  polar_request_body?: Record<string, unknown>;
};

export function isPolarDebugErrorsEnabled(): boolean {
  return Deno.env.get("POLAR_DEBUG_ERRORS") === "true";
}

export function publicPolarErrorExtras(
  details: PolarClientErrorDetails = {},
): Record<string, unknown> {
  if (!isPolarDebugErrorsEnabled()) {
    return {};
  }

  const extras: Record<string, unknown> = {};
  if (details.polar_status !== undefined) {
    extras.polar_status = details.polar_status;
  }
  if (details.polar_error !== undefined) {
    extras.polar_error = details.polar_error;
  }
  if (details.polar_request_body !== undefined) {
    extras.polar_request_body = details.polar_request_body;
  }
  return extras;
}

export class PolarClientError extends Error {
  code: string;
  status: number;
  details: PolarClientErrorDetails;

  constructor(
    code: string,
    message: string,
    status: number,
    details: PolarClientErrorDetails = {},
  ) {
    super(message);
    this.name = "PolarClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type PolarClientDeps = {
  fetchFn?: typeof fetch;
  getAccessToken?: () => string | null | undefined;
  getBaseUrl?: () => string;
  getSuccessUrl?: () => string | null | undefined;
  getCancelUrl?: () => string | null | undefined;
  getPortalReturnUrl?: () => string | null | undefined;
};

export function polarServerBaseUrl(): string {
  const explicit = Deno.env.get("POLAR_API_BASE_URL");
  if (explicit) return explicit.replace(/\/$/, "");

  const env = Deno.env.get("POLAR_ENVIRONMENT") ?? "sandbox";
  return env === "production"
    ? "https://api.polar.sh/v1"
    : "https://sandbox-api.polar.sh/v1";
}

function requireCheckoutUrls(deps: PolarClientDeps): {
  successUrl: string;
  cancelUrl: string;
} {
  const successUrl = deps.getSuccessUrl?.() ??
    Deno.env.get("CHECKOUT_SUCCESS_URL") ??
    "";
  const cancelUrl = deps.getCancelUrl?.() ??
    Deno.env.get("CHECKOUT_CANCEL_URL") ??
    "";

  if (!successUrl.trim() || !cancelUrl.trim()) {
    throw new PolarClientError(
      "checkout_urls_not_configured",
      "CHECKOUT_SUCCESS_URL and CHECKOUT_CANCEL_URL are required",
      503,
    );
  }

  return { successUrl: successUrl.trim(), cancelUrl: cancelUrl.trim() };
}

export async function createPolarCheckoutSession(
  params: CreateCheckoutParams,
  deps: PolarClientDeps = {},
): Promise<CreateCheckoutResult> {
  const accessToken = deps.getAccessToken?.() ??
    Deno.env.get("POLAR_ACCESS_TOKEN");
  if (!accessToken?.trim()) {
    throw new PolarClientError(
      "polar_not_configured",
      "POLAR_ACCESS_TOKEN is not configured",
      503,
    );
  }

  const baseUrl = (deps.getBaseUrl ?? polarServerBaseUrl)().replace(/\/$/, "");
  const { successUrl, cancelUrl } = requireCheckoutUrls(deps);
  const fetchFn = deps.fetchFn ?? fetch;

  const payload: Record<string, unknown> = {
    products: [params.productId],
    external_customer_id: params.userId,
    success_url: successUrl,
    return_url: cancelUrl,
    metadata: {
      user_id: params.userId,
      product_key: params.productKey,
      plan_sku: params.planSku,
      entitlement_product_key: params.entitlementProductKey,
      source: "desktop",
      app: "vantare",
    },
  };

  if (params.email) {
    payload.customer_email = params.email;
  }

  const response = await fetchFn(`${baseUrl}/checkouts/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken.trim()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const polarRawBody = await response.text();
    const polarError = formatPolarErrorBody(polarRawBody);
    const polarRequestBody = sanitizePolarRequestBody(payload);

    console.error("polar checkout failed", {
      polar_status: response.status,
      polar_error: polarError,
      polar_request_body: polarRequestBody,
    });

    throw new PolarClientError(
      "polar_checkout_failed",
      "Polar checkout session could not be created",
      502,
      {
        polar_status: response.status,
        polar_error: polarError,
        polar_request_body: polarRequestBody,
      },
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new PolarClientError(
      "polar_invalid_response",
      "Polar checkout response was not valid JSON",
      502,
    );
  }

  if (!isRecord(data) || typeof data.url !== "string" || !data.url.trim()) {
    throw new PolarClientError(
      "polar_missing_checkout_url",
      "Polar checkout response did not include a URL",
      502,
    );
  }

  const checkoutId = typeof data.id === "string" ? data.id : null;
  return { url: data.url, checkoutId };
}

export async function createPolarCustomerSession(
  params: CreateCustomerSessionParams,
  deps: PolarClientDeps = {},
): Promise<CreateCustomerSessionResult> {
  const accessToken = deps.getAccessToken?.() ??
    Deno.env.get("POLAR_ACCESS_TOKEN");
  if (!accessToken?.trim()) {
    throw new PolarClientError(
      "polar_not_configured",
      "POLAR_ACCESS_TOKEN is not configured",
      503,
    );
  }

  const returnUrl = params.returnUrl?.trim() ?? "";
  if (!returnUrl) {
    throw new PolarClientError(
      "portal_return_url_not_configured",
      "PORTAL_RETURN_URL is required",
      503,
    );
  }

  const customerId = params.customerId?.trim() ?? "";
  const externalCustomerId = params.externalCustomerId?.trim() ?? "";
  if (!customerId && !externalCustomerId) {
    throw new PolarClientError(
      "polar_customer_ref_required",
      "Polar customer reference is required",
      500,
    );
  }

  const baseUrl = (deps.getBaseUrl ?? polarServerBaseUrl)().replace(/\/$/, "");
  const fetchFn = deps.fetchFn ?? fetch;

  const payload: Record<string, unknown> = { return_url: returnUrl };
  if (customerId) {
    payload.customer_id = customerId;
  } else {
    payload.external_customer_id = externalCustomerId;
  }

  const response = await fetchFn(`${baseUrl}/customer-sessions/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken.trim()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const polarRawBody = await response.text();
    const polarError = formatPolarErrorBody(polarRawBody);
    const polarRequestBody = sanitizePolarPortalRequestBody(payload);

    console.error("polar customer session failed", {
      polar_status: response.status,
      polar_error: polarError,
      polar_request_body: polarRequestBody,
    });

    throw new PolarClientError(
      "polar_portal_failed",
      "Polar customer portal session could not be created",
      502,
      {
        polar_status: response.status,
        polar_error: polarError,
        polar_request_body: polarRequestBody,
      },
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new PolarClientError(
      "polar_invalid_response",
      "Polar customer session response was not valid JSON",
      502,
    );
  }

  if (
    !isRecord(data) ||
    typeof data.customer_portal_url !== "string" ||
    !data.customer_portal_url.trim()
  ) {
    throw new PolarClientError(
      "polar_missing_portal_url",
      "Polar customer session response did not include a portal URL",
      502,
    );
  }

  const resolvedCustomerId = typeof data.customer_id === "string"
    ? data.customer_id
    : null;
  const expiresAt = typeof data.expires_at === "string" ? data.expires_at : null;

  return {
    url: data.customer_portal_url,
    customerId: resolvedCustomerId,
    expiresAt,
  };
}

export async function createPolarPortalSession(
  params: CreatePortalSessionParams,
): Promise<CreatePortalSessionResult> {
  const session = await createPolarCustomerSession({
    customerId: params.polarCustomerId,
    returnUrl: params.returnUrl,
  });
  return { url: session.url };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizePolarPortalRequestBody(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {
    return_url: payload.return_url,
  };
  if (typeof payload.customer_id === "string") {
    sanitized.customer_id = payload.customer_id;
  }
  if (typeof payload.external_customer_id === "string") {
    sanitized.external_customer_id = payload.external_customer_id;
  }
  return sanitized;
}

function sanitizePolarRequestBody(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {
    products: payload.products,
    external_customer_id: payload.external_customer_id,
    success_url: payload.success_url,
    return_url: payload.return_url,
    metadata: payload.metadata,
  };

  if (typeof payload.customer_email === "string") {
    sanitized.customer_email = maskEmail(payload.customer_email);
  }

  return sanitized;
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 1) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

function formatPolarErrorBody(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "empty response body";

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isRecord(parsed)) return trimmed.slice(0, 500);

    if (Array.isArray(parsed.detail)) {
      const messages = parsed.detail
        .map((entry) => {
          if (!isRecord(entry)) return null;
          const loc = Array.isArray(entry.loc)
            ? entry.loc.map(String).join(".")
            : "";
          const msg = typeof entry.msg === "string" ? entry.msg : null;
          if (msg && loc) return `${loc}: ${msg}`;
          if (msg) return msg;
          return JSON.stringify(entry);
        })
        .filter((value): value is string => value !== null);
      if (messages.length > 0) return messages.join("; ");
    }

    for (const key of ["message", "error", "detail"] as const) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  } catch {
    // fall through to raw text
  }

  return trimmed.slice(0, 500);
}