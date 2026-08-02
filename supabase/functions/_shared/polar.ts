import type {
  BillingEnvironment,
  CheckoutKey,
  ReleaseChannel,
  TrialConfig,
} from "./mapping.ts";

export type CreateCheckoutParams = {
  productId: string;
  userId: string;
  email: string | null;
  productKey: CheckoutKey;
  planSku: CheckoutKey;
  environment: BillingEnvironment;
  catalogVersion: string;
  capabilities: readonly string[];
  channels: readonly ReleaseChannel[];
  launchScopeVersion: string | null;
  trial: TrialConfig;
};

export type CreateCheckoutResult = { url: string; checkoutId: string | null };
export type CreateCustomerSessionParams = {
  customerId?: string;
  externalCustomerId?: string;
  returnUrl: string;
  environment?: BillingEnvironment;
};
export type CreateCustomerSessionResult = {
  url: string;
  customerId: string | null;
  expiresAt: string | null;
};
export type CreatePortalSessionParams = {
  polarCustomerId: string;
  returnUrl: string;
};
export type CreatePortalSessionResult = { url: string };

export type PolarCustomerStateSubscription = {
  id: string;
  productId: string;
  status: string;
  modifiedAt: string;
  currentPeriodEnd: string | null;
};

export type PolarCustomerStateBenefit = {
  id: string;
  benefitId: string;
  modifiedAt: string;
};

export type PolarCustomerState = {
  customerId: string;
  externalId: string;
  observedAt: string;
  activeSubscriptions: PolarCustomerStateSubscription[];
  grantedBenefits: PolarCustomerStateBenefit[];
};

export type PolarClientErrorDetails = { polar_status?: number };

export function isPolarDebugErrorsEnabled(): boolean {
  return Deno.env.get("POLAR_DEBUG_ERRORS") === "true";
}

export function publicPolarErrorExtras(
  details: PolarClientErrorDetails = {},
): Record<string, unknown> {
  return isPolarDebugErrorsEnabled() && details.polar_status !== undefined
    ? { polar_status: details.polar_status }
    : {};
}

export class PolarClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details: PolarClientErrorDetails = {},
  ) {
    super(message);
    this.name = "PolarClientError";
  }
}

export type PolarClientDeps = {
  fetchFn?: typeof fetch;
  getAccessToken?: () => string | null | undefined;
  getBaseUrl?: () => string;
  getSuccessUrl?: () => string | null | undefined;
  getCancelUrl?: () => string | null | undefined;
  timeoutMs?: number;
  signal?: AbortSignal;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  maxRateLimitRetries?: number;
  now?: () => Date;
};

const BASE_URLS: Record<BillingEnvironment, string> = {
  sandbox: "https://sandbox-api.polar.sh/v1",
  production: "https://api.polar.sh/v1",
};
const CHECKOUT_HOSTS: Record<BillingEnvironment, string> = {
  sandbox: "sandbox.polar.sh",
  production: "polar.sh",
};

export function requirePolarEnvironment(
  raw = Deno.env.get("POLAR_ENVIRONMENT"),
): BillingEnvironment {
  if (raw !== "sandbox" && raw !== "production") {
    throw new PolarClientError(
      "polar_environment_invalid",
      "POLAR_ENVIRONMENT must be sandbox or production",
      503,
    );
  }
  return raw;
}

export function polarServerBaseUrl(
  environment = requirePolarEnvironment(),
): string {
  const expected = BASE_URLS[environment];
  const explicit = Deno.env.get("POLAR_API_BASE_URL")?.replace(/\/$/, "");
  if (explicit && explicit !== expected) {
    throw new PolarClientError(
      "polar_environment_mismatch",
      "POLAR_API_BASE_URL does not match POLAR_ENVIRONMENT",
      503,
    );
  }
  return expected;
}

function requireHttpsUrl(raw: string, code: string, message: string): string {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new Error();
    }
    return url.toString();
  } catch {
    throw new PolarClientError(code, message, 503);
  }
}

function checkoutUrls(
  deps: PolarClientDeps,
): { successUrl: string; cancelUrl: string } {
  return {
    successUrl: requireHttpsUrl(
      deps.getSuccessUrl?.() ?? Deno.env.get("CHECKOUT_SUCCESS_URL") ?? "",
      "checkout_urls_not_configured",
      "CHECKOUT_SUCCESS_URL and CHECKOUT_CANCEL_URL are required",
    ),
    cancelUrl: requireHttpsUrl(
      deps.getCancelUrl?.() ?? Deno.env.get("CHECKOUT_CANCEL_URL") ?? "",
      "checkout_urls_not_configured",
      "CHECKOUT_SUCCESS_URL and CHECKOUT_CANCEL_URL are required",
    ),
  };
}

async function polarRequest<T>(
  url: string,
  init: RequestInit,
  deps: PolarClientDeps,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const timeoutMs = Math.max(50, Math.min(deps.timeoutMs ?? 8000, 30000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
  const onAbort = () => controller.abort("cancelled");
  deps.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (deps.signal?.aborted) {
      controller.abort("cancelled");
      throw new DOMException("aborted", "AbortError");
    }
    const maxRetries = Math.max(0, Math.min(deps.maxRateLimitRetries ?? 2, 5));
    for (let attempt = 0;; attempt++) {
      const response = await (deps.fetchFn ?? fetch)(url, {
        ...init,
        signal: controller.signal,
      });
      if (response.status !== 429 || attempt >= maxRetries) {
        return await consume(response);
      }
      const delay = parseRetryAfter(
        response.headers.get("Retry-After"),
        deps.now?.() ?? new Date(),
      );
      await response.body?.cancel();
      await (deps.sleep ?? abortableSleep)(delay, controller.signal);
    }
  } catch (error) {
    if (controller.signal.aborted) {
      const cancelled = controller.signal.reason === "cancelled";
      throw new PolarClientError(
        cancelled ? "request_cancelled" : "polar_timeout",
        cancelled ? "Request was cancelled" : "Polar did not respond in time",
        503,
      );
    }
    if (error instanceof PolarClientError) throw error;
    throw new PolarClientError(
      "polar_unavailable",
      "Polar could not be reached",
      503,
    );
  } finally {
    clearTimeout(timeout);
    deps.signal?.removeEventListener("abort", onAbort);
  }
}

export function parseRetryAfter(raw: string | null, now = new Date()): number {
  if (!raw?.trim()) return 1000;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1000), 30_000);
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return 1000;
  return Math.min(Math.max(timestamp - now.getTime(), 0), 30_000);
}

function abortableSleep(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function requireToken(deps: PolarClientDeps): string {
  const token = deps.getAccessToken?.() ?? Deno.env.get("POLAR_ACCESS_TOKEN");
  if (!token?.trim()) {
    throw new PolarClientError(
      "polar_not_configured",
      "POLAR_ACCESS_TOKEN is not configured",
      503,
    );
  }
  return token.trim();
}

function apiBase(
  environment: BillingEnvironment,
  deps: PolarClientDeps,
): string {
  const expected = BASE_URLS[environment];
  const actual = (deps.getBaseUrl?.() ?? polarServerBaseUrl(environment))
    .replace(/\/$/, "");
  if (actual !== expected) {
    throw new PolarClientError(
      "polar_environment_mismatch",
      "Polar API host does not match the catalog environment",
      503,
    );
  }
  return actual;
}

function validateHostedUrl(
  raw: string,
  environment: BillingEnvironment,
  kind: "checkout" | "portal",
): string {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" || url.hostname !== CHECKOUT_HOSTS[environment]
    ) throw new Error();
    return url.toString();
  } catch {
    throw new PolarClientError(
      `polar_invalid_${kind}_url`,
      `Polar returned an invalid ${kind} URL`,
      502,
    );
  }
}

export async function createPolarCheckoutSession(
  params: CreateCheckoutParams,
  deps: PolarClientDeps = {},
): Promise<CreateCheckoutResult> {
  const token = requireToken(deps);
  const runtimeEnvironment = requirePolarEnvironment(params.environment);
  const baseUrl = apiBase(runtimeEnvironment, deps);
  const { successUrl, cancelUrl } = checkoutUrls(deps);
  const payload: Record<string, unknown> = {
    products: [params.productId],
    external_customer_id: params.userId,
    success_url: successUrl,
    return_url: cancelUrl,
    allow_trial: params.trial.enabled,
    metadata: {
      user_id: params.userId,
      product_key: params.productKey,
      plan_sku: params.planSku,
      catalog_version: params.catalogVersion,
      capabilities: JSON.stringify(params.capabilities),
      channels: JSON.stringify(params.channels),
      launch_scope_version: params.launchScopeVersion ?? "",
      source: "desktop",
      app: "vantare",
    },
  };
  if (params.trial.enabled) {
    payload.trial_interval = params.trial.interval;
    payload.trial_interval_count = params.trial.interval_count;
  }
  if (params.email) payload.customer_email = params.email;

  return await polarRequest(
    `${baseUrl}/checkouts/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    },
    deps,
    async (response) => {
      if (!response.ok) {
        console.error("polar checkout failed", { status: response.status });
        throw new PolarClientError(
          "polar_checkout_failed",
          "Polar checkout session could not be created",
          502,
          { polar_status: response.status },
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
      if (!isRecord(data) || typeof data.url !== "string") {
        throw new PolarClientError(
          "polar_missing_checkout_url",
          "Polar checkout response did not include a URL",
          502,
        );
      }
      return {
        url: validateHostedUrl(data.url, runtimeEnvironment, "checkout"),
        checkoutId: typeof data.id === "string" ? data.id : null,
      };
    },
  );
}

export async function createPolarCustomerSession(
  params: CreateCustomerSessionParams,
  deps: PolarClientDeps = {},
): Promise<CreateCustomerSessionResult> {
  const token = requireToken(deps);
  const environment = requirePolarEnvironment(params.environment);
  const customerId = params.customerId?.trim() ?? "";
  const externalCustomerId = params.externalCustomerId?.trim() ?? "";
  if (!customerId && !externalCustomerId) {
    throw new PolarClientError(
      "polar_customer_ref_required",
      "Polar customer reference is required",
      500,
    );
  }
  const payload: Record<string, unknown> = {
    return_url: requireHttpsUrl(
      params.returnUrl,
      "portal_return_url_not_configured",
      "PORTAL_RETURN_URL is required",
    ),
  };
  if (customerId) payload.customer_id = customerId;
  else payload.external_customer_id = externalCustomerId;

  return await polarRequest(
    `${apiBase(environment, deps)}/customer-sessions/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    },
    deps,
    async (response) => {
      if (!response.ok) {
        console.error("polar customer session failed", {
          status: response.status,
        });
        throw new PolarClientError(
          "polar_portal_failed",
          "Polar customer portal session could not be created",
          502,
          { polar_status: response.status },
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
      if (!isRecord(data) || typeof data.customer_portal_url !== "string") {
        throw new PolarClientError(
          "polar_missing_portal_url",
          "Polar customer session response did not include a portal URL",
          502,
        );
      }
      return {
        url: validateHostedUrl(data.customer_portal_url, environment, "portal"),
        customerId: typeof data.customer_id === "string"
          ? data.customer_id
          : null,
        expiresAt: typeof data.expires_at === "string" ? data.expires_at : null,
      };
    },
  );
}

export async function getPolarCustomerStateByExternalId(
  externalId: string,
  environment: BillingEnvironment,
  deps: PolarClientDeps = {},
): Promise<PolarCustomerState> {
  const normalizedExternalId = externalId.trim();
  if (!normalizedExternalId) {
    throw new PolarClientError(
      "polar_customer_ref_required",
      "Polar customer reference is required",
      400,
    );
  }
  const token = requireToken(deps);
  return await polarRequest(
    `${apiBase(environment, deps)}/customers/external/${
      encodeURIComponent(normalizedExternalId)
    }/state`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
    deps,
    async (response) => {
      if (!response.ok) {
        throw new PolarClientError(
          response.status === 404
            ? "polar_customer_not_found"
            : "polar_customer_state_failed",
          response.status === 404
            ? "Polar customer was not found"
            : "Polar customer state could not be read",
          response.status === 404 ? 404 : 502,
          { polar_status: response.status },
        );
      }
      let value: unknown;
      try {
        value = await response.json();
      } catch {
        throw new PolarClientError(
          "polar_invalid_response",
          "Polar customer state response was not valid JSON",
          502,
        );
      }
      if (!isRecord(value)) {
        throw new PolarClientError(
          "polar_invalid_response",
          "Polar customer state response was invalid",
          502,
        );
      }
      const customer = isRecord(value.customer) ? value.customer : value;
      const customerId = stringValue(customer.id);
      const returnedExternalId = stringValue(customer.external_id) ??
        stringValue(value.external_id) ?? normalizedExternalId;
      const subscriptions = value.active_subscriptions;
      const benefits = value.granted_benefits;
      if (
        !customerId || !Array.isArray(subscriptions) || !Array.isArray(benefits)
      ) {
        throw new PolarClientError(
          "polar_invalid_response",
          "Polar customer state response was incomplete",
          502,
        );
      }
      return {
        customerId,
        externalId: returnedExternalId,
        observedAt: (deps.now?.() ?? new Date()).toISOString(),
        activeSubscriptions: subscriptions.map(parseCustomerSubscription),
        grantedBenefits: benefits.map(parseCustomerBenefit),
      };
    },
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseCustomerSubscription(
  value: unknown,
): PolarCustomerStateSubscription {
  if (!isRecord(value)) throw invalidCustomerState();
  const product = isRecord(value.product) ? value.product : null;
  const id = stringValue(value.id);
  const productId = stringValue(value.product_id) ?? stringValue(product?.id);
  const status = stringValue(value.status) ?? "active";
  const modifiedAt = stringValue(value.modified_at) ??
    stringValue(value.updated_at);
  if (
    !id || !productId || !modifiedAt || !Number.isFinite(Date.parse(modifiedAt))
  ) {
    throw invalidCustomerState();
  }
  return {
    id,
    productId,
    status,
    modifiedAt: new Date(modifiedAt).toISOString(),
    currentPeriodEnd: stringValue(value.current_period_end),
  };
}

function parseCustomerBenefit(value: unknown): PolarCustomerStateBenefit {
  if (!isRecord(value)) throw invalidCustomerState();
  const benefit = isRecord(value.benefit) ? value.benefit : null;
  const id = stringValue(value.id);
  const benefitId = stringValue(value.benefit_id) ?? stringValue(benefit?.id);
  const modifiedAt = stringValue(value.modified_at) ??
    stringValue(value.granted_at);
  if (
    !id || !benefitId || !modifiedAt || !Number.isFinite(Date.parse(modifiedAt))
  ) {
    throw invalidCustomerState();
  }
  return { id, benefitId, modifiedAt: new Date(modifiedAt).toISOString() };
}

function invalidCustomerState(): PolarClientError {
  return new PolarClientError(
    "polar_invalid_response",
    "Polar customer state response was invalid",
    502,
  );
}

export async function createPolarPortalSession(
  params: CreatePortalSessionParams,
): Promise<CreatePortalSessionResult> {
  const result = await createPolarCustomerSession({
    customerId: params.polarCustomerId,
    returnUrl: params.returnUrl,
  });
  return { url: result.url };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
