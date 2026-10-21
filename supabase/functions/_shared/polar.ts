import type {
  BillingEnvironment,
  CheckoutKey,
  ReleaseChannel,
  TrialConfig,
} from "./mapping.ts";
import { polarCheckoutDiagnostic } from "./polar-checkout-diagnostic.ts";

export type CreateCheckoutParams = {
  attemptId?: string;
  dispatchToken?: string;
  discountId?: string | null;
  creatorCode?: string | null;
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
  currentPeriodStart?: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd?: boolean;
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
  if (
    params.discountId &&
    (params.productKey === "founders" || params.trial.enabled ||
      !/^[0-9a-f-]{36}$/i.test(params.discountId))
  ) {
    throw new PolarClientError(
      "invalid_checkout_offer",
      "Invalid checkout offer",
      400,
    );
  }
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
    allow_discount_codes: false,
    ...(params.discountId ? { discount_id: params.discountId } : {}),
    metadata: {
      ...(params.creatorCode ? { creator_code: params.creatorCode } : {}),
      user_id: params.userId,
      product_key: params.productKey,
      plan_sku: params.planSku,
      catalog_version: params.catalogVersion,
      capabilities: JSON.stringify(params.capabilities),
      channels: JSON.stringify(params.channels),
      launch_scope_version: params.launchScopeVersion ?? "",
      source: "desktop",
      app: "vantare",
      ...(params.attemptId && params.dispatchToken
        ? {
          vantare_attempt_id: params.attemptId,
          vantare_dispatch_token: params.dispatchToken,
        }
        : {}),
    },
  };
  if (params.trial.enabled) {
    payload.trial_interval = params.trial.interval;
    payload.trial_interval_count = params.trial.interval_count;
  }
  if (params.discountId) {
    payload.discount_id = params.discountId;
    payload.allow_discount_codes = false;
  }
  if (params.email) payload.customer_email = params.email;
  if (params.productKey === "founders") payload.allow_discount_codes = false;

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
        console.error(
          "polar checkout failed",
          await polarCheckoutDiagnostic(response, params.productKey),
        );
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

// Authenticated server read recovers a single account-owned launch checkout.
export async function readPolarCheckoutSession(
  id: string,
  environment: BillingEnvironment,
  deps: PolarClientDeps = {},
): Promise<
  {
    id: string;
    status: string;
    productId: string;
    accountId: string;
    url: string;
  }
> {
  const token = requireToken(deps);
  return await polarRequest(
    apiBase(environment, deps) + "/checkouts/" + encodeURIComponent(id),
    {
      method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    },
    deps,
    async (response) => {
      if (!response.ok) {
        throw new PolarClientError(
          "checkout_recovery_unavailable",
          "Retry checkout",
          503,
        );
      }
      const value: unknown = await response.json();
      if (
        !isRecord(value) || value.id !== id ||
        typeof value.status !== "string" ||
        typeof value.product_id !== "string" ||
        typeof value.external_customer_id !== "string" ||
        typeof value.url !== "string"
      ) {
        throw new PolarClientError(
          "checkout_recovery_invalid",
          "Retry checkout",
          503,
        );
      }
      return {
        id,
        status: value.status,
        productId: value.product_id,
        accountId: value.external_customer_id,
        url: validateHostedUrl(value.url, environment, "checkout"),
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
    ...(stringValue(value.current_period_start)
      ? { currentPeriodStart: stringValue(value.current_period_start) }
      : {}),
    ...(typeof value.cancel_at_period_end === "boolean"
      ? { cancelAtPeriodEnd: value.cancel_at_period_end }
      : {}),
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

// #1627: this candidate cannot send administrative mutations to production.
export async function polarAdminRequest(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body: unknown,
  environment: BillingEnvironment,
  deps: PolarClientDeps = {},
): Promise<Record<string, unknown>> {
  const url = new URL(`https://local.invalid${path}`);
  const resource = /^\/(discounts|orders|refunds)\/$/.test(url.pathname);
  const direct = /^\/(subscriptions|organizations)\/[A-Za-z0-9_-]+$/.test(
    url.pathname,
  );
  const query = [...url.searchParams];
  if (
    environment !== "sandbox" || url.hash ||
    (method === "GET"
      ? !(resource || direct)
      : method === "POST"
      ? url.pathname !== "/discounts/"
      : !/^\/subscriptions\/[A-Za-z0-9_-]+$/.test(url.pathname)) ||
    (method !== "GET" && query.length > 0) ||
    query.some(([k, v]) =>
      k === "organization_id"
        ? !/^[0-9a-f-]{36}$/.test(v)
        : k === "limit"
        ? v !== "100"
        : k === "page"
        ? !/^[1-9][0-9]{0,2}$/.test(v)
        : true
    )
  ) {
    throw new PolarClientError(
      "admin_sandbox_required",
      "Sandbox required",
      503,
    );
  }
  return await polarRequest(
    `${apiBase(environment, deps)}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${requireToken(deps)}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
    },
    { ...deps, maxRateLimitRetries: 0 },
    async (response) => {
      if (!response.ok) {
        throw new PolarClientError(
          "polar_admin_failed",
          "Administrative action failed",
          502,
          { polar_status: response.status },
        );
      }
      const result: unknown = await response.json();
      if (!isRecord(result)) {
        throw new PolarClientError(
          "polar_invalid_response",
          "Invalid response",
          502,
        );
      }
      return result;
    },
  );
}

// Setting the same desired state twice is safe, including after a lost response.
export async function stopSubscriptionRenewal(
  subscriptionId: string,
  environment: BillingEnvironment,
  deps: PolarClientDeps = {},
): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(subscriptionId)) {
    throw new Error("invalid_subscription_id");
  }
  await polarRequest(
    `${apiBase(environment, deps)}/subscriptions/${subscriptionId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${requireToken(deps)}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ cancel_at_period_end: true }),
      redirect: "error",
    },
    deps,
    async (response) => {
      if (!response.ok) {
        throw new PolarClientError(
          "founders_transition_failed",
          "Renewal could not be stopped",
          502,
        );
      }
      const data = await response.json();
      if (data.id !== subscriptionId || data.cancel_at_period_end !== true) {
        throw new PolarClientError(
          "founders_transition_unconfirmed",
          "Renewal stop was not confirmed",
          502,
        );
      }
    },
  );
}

function renewalDiscountedAmount(
  normalCents: number,
  discountId: unknown,
  discount: unknown,
): number | null {
  if (discountId === null) return discount === null ? normalCents : null;
  if (!isRecord(discount) || discount.id !== discountId) return null;
  if (discount.type === "percentage") {
    const basisPoints = discount.basis_points;
    if (
      typeof basisPoints !== "number" || !Number.isSafeInteger(basisPoints) ||
      basisPoints <= 0 || basisPoints > 10000
    ) return null;
    // Polar rounds the saving, half away from zero, before subtracting it.
    // models/discount.py::get_discount_amount and kit/math.py::polar_round.
    return normalCents - Math.round(normalCents * (basisPoints / 10000));
  }
  if (discount.type === "fixed") {
    // amounts is authoritative; amount/currency are legacy single-currency fields.
    const savings = isRecord(discount.amounts)
      ? discount.amounts.eur
      : discount.amounts === undefined && discount.currency === "eur"
      ? discount.amount
      : null;
    if (
      typeof savings !== "number" || !Number.isSafeInteger(savings) ||
      savings < 0
    ) return null;
    return normalCents - Math.min(savings, normalCents);
  }
  return null;
}

// Invoice is already paid. GET/confirm makes retries safe without restarting a coupon.
export async function synchronizeRenewalDiscount(
  subscriptionId: string,
  environment: BillingEnvironment,
  expected: {
    productId: string;
    priceIds: readonly string[];
    discountId: string | null;
    managedIds: (string | null)[];
    normalCents: number;
    interval: string;
    authorize: () => Promise<boolean>;
  },
  deps: PolarClientDeps = {},
): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(subscriptionId)) {
    throw new Error("invalid_subscription_id");
  }
  if (!expected.managedIds.includes(expected.discountId)) {
    throw new Error("creator_discount_unmanaged");
  }
  const url = `${apiBase(environment, deps)}/subscriptions/${subscriptionId}`;
  const request = async (method: "GET" | "PATCH") =>
    await polarRequest(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${requireToken(deps)}`,
          "Content-Type": "application/json",
        },
        ...(method === "PATCH"
          ? { body: JSON.stringify({ discount_id: expected.discountId }) }
          : {}),
      },
      { ...deps, timeoutMs: 10000, maxRateLimitRetries: 0 },
      async (response) => {
        if (!response.ok) throw new Error("creator_discount_http_failed");
        const value = await response.json();
        // Polar's subscription.amount already includes the discount. Validate the
        // selected catalog price instead, on GET and on the PATCH confirmation.
        const price = Array.isArray(value.prices) && value.prices.length === 1
          ? value.prices[0]
          : null;
        if (
          value.id !== subscriptionId ||
          value.product_id !== expected.productId ||
          !["active", "uncanceled"].includes(value.status) ||
          value.currency !== "eur" ||
          !Number.isSafeInteger(value.amount) || value.amount < 0 ||
          value.amount > expected.normalCents ||
          !price || !expected.priceIds.includes(price.id) ||
          (value.price_id !== undefined && value.price_id !== price.id) ||
          price.product_id !== expected.productId ||
          price.source !== "catalog" || price.amount_type !== "fixed" ||
          price.price_amount !== expected.normalCents ||
          price.price_currency !== "eur" ||
          (price.recurring_interval !== undefined &&
            price.recurring_interval !== expected.interval) ||
          value.recurring_interval !== expected.interval ||
          value.recurring_interval_count !== 1 ||
          !(value.discount_id === null ||
            typeof value.discount_id === "string") ||
          !expected.managedIds.includes(value.discount_id) ||
          value.amount !== renewalDiscountedAmount(
              expected.normalCents,
              value.discount_id,
              value.discount,
            )
        ) throw new Error("creator_discount_remote_mismatch");
        return value;
      },
    );
  const current = await request("GET");
  if (!await expected.authorize()) {
    throw new Error("creator_discount_authorization_lost");
  }
  if (current.discount_id === expected.discountId) return;
  const updated = await request("PATCH");
  if (updated.discount_id !== expected.discountId) {
    throw new Error("creator_discount_unconfirmed");
  }
}

// Revoke only the stored creator coupon. Reports/manual discounts remain untouched.
export async function withdrawCreatorDiscount(
  subscriptionId: string,
  environment: BillingEnvironment,
  expected: {
    productId: string;
    creatorDiscountId: string;
    managedCreatorDiscountIds?: string[];
    authorize: () => Promise<boolean>;
  },
  deps: PolarClientDeps = {},
): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(subscriptionId)) {
    throw Error("invalid_subscription_id");
  }
  const url = `${apiBase(environment, deps)}/subscriptions/${subscriptionId}`;
  const request = async (method: "GET" | "PATCH") =>
    await polarRequest(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${requireToken(deps)}`,
          "Content-Type": "application/json",
        },
        ...(method === "PATCH"
          ? { body: JSON.stringify({ discount_id: null }) }
          : {}),
      },
      { ...deps, timeoutMs: 10000, maxRateLimitRetries: 0 },
      async (response) => {
        if (!response.ok) throw Error("creator_revocation_http_failed");
        const value = await response.json();
        if (
          value.id !== subscriptionId ||
          value.product_id !== expected.productId ||
          !(value.discount_id === null || typeof value.discount_id === "string")
        ) throw Error("creator_revocation_remote_mismatch");
        return value;
      },
    );
  const current = await request("GET");
  if (!await expected.authorize()) {
    throw Error("creator_revocation_authorization_lost");
  }
  if (
    current.discount_id !== expected.creatorDiscountId &&
    !expected.managedCreatorDiscountIds?.includes(current.discount_id)
  ) return;
  const updated = await request("PATCH");
  if (updated.discount_id !== null) {
    throw Error("creator_revocation_unconfirmed");
  }
}
