import { type AuthResult, requireUserAuth } from "../_shared/auth.ts";
import {
  type CheckoutAttemptStore,
  createCheckoutAttemptStore,
} from "../_shared/checkout-attempts.ts";
import { handleCorsPreflight } from "../_shared/cors.ts";
import {
  isAllowedCheckoutProductKey,
  loadPolarProductMap,
  resolveCheckoutKey,
} from "../_shared/mapping.ts";
import {
  type CreateCheckoutResult,
  createPolarCheckoutSession,
  PolarClientError,
  publicPolarErrorExtras,
} from "../_shared/polar.ts";
import { isUuid, readJsonObject } from "../_shared/request.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";

export type CheckoutDeps = {
  requireAuth?: (req: Request) => Promise<AuthResult>;
  loadMap?: typeof loadPolarProductMap;
  createCheckout?: (
    params: Parameters<typeof createPolarCheckoutSession>[0],
    options?: { signal?: AbortSignal },
  ) => Promise<CreateCheckoutResult>;
  attempts?: CheckoutAttemptStore;
};

const MAX_BODY_BYTES = 4096;
const FORBIDDEN_CLIENT_FIELDS = [
  "priceId",
  "price_id",
  "productId",
  "product_id",
  "userId",
  "user_id",
  "email",
  "providerCustomerId",
  "provider_customer_id",
  "customerId",
  "customer_id",
] as const;

export async function handleCheckoutRequest(
  req: Request,
  deps: CheckoutDeps = {},
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

  const parsed = await readJsonObject(req, MAX_BODY_BYTES);
  if (!parsed.ok) {
    return errorResponse(
      parsed.code,
      parsed.message,
      parsed.code === "body_too_large" ? 413 : 400,
    );
  }
  const body = parsed.value;
  for (const field of FORBIDDEN_CLIENT_FIELDS) {
    if (field in body) {
      return errorResponse(
        "forbidden_field",
        `Field "${field}" is not accepted from client`,
        400,
      );
    }
  }
  const allowed = new Set(["productKey", "attemptId"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return errorResponse(
      "unexpected_field",
      "Request contains an unsupported field",
      400,
    );
  }

  const productKey = typeof body.productKey === "string"
    ? body.productKey.trim()
    : "";
  const attemptId = typeof body.attemptId === "string"
    ? body.attemptId.trim()
    : "";
  if (!isAllowedCheckoutProductKey(productKey)) {
    return errorResponse(
      "invalid_product_key",
      "productKey is not allowed",
      400,
    );
  }
  if (!isUuid(attemptId)) {
    return errorResponse("invalid_attempt_id", "attemptId must be a UUID", 400);
  }

  const mapping = (deps.loadMap ?? loadPolarProductMap)();
  if (!mapping.ok) return errorResponse(mapping.code, mapping.message, 503);
  const resolved = resolveCheckoutKey(mapping.map, productKey);
  if (!resolved.ok) return errorResponse(resolved.code, resolved.message, 409);

  const attempt = {
    userId: auth.userId,
    attemptId,
    checkoutKey: resolved.key,
    environment: mapping.map.environment,
    catalogVersion: mapping.map.catalog_version,
  } as const;
  let attempts: CheckoutAttemptStore;
  try {
    attempts = deps.attempts ?? createCheckoutAttemptStore();
  } catch {
    return errorResponse(
      "checkout_state_unavailable",
      "Checkout could not be started safely",
      503,
    );
  }
  let claim;
  try {
    claim = await attempts.claim(attempt);
  } catch {
    return errorResponse(
      "checkout_state_unavailable",
      "Checkout could not be started safely",
      503,
    );
  }
  if (claim.kind === "reused") {
    return jsonResponse({ url: claim.url, reused: true }, 200);
  }
  if (claim.kind === "conflict") {
    return errorResponse(
      "attempt_conflict",
      "attemptId was already used for another checkout",
      409,
    );
  }
  if (claim.kind === "uncertain") {
    return errorResponse(
      "checkout_state_uncertain",
      "The previous checkout result is uncertain; retry later with support",
      409,
    );
  }
  if (claim.kind === "expired") {
    return errorResponse(
      "checkout_attempt_expired",
      "Checkout attempt expired; start a new attempt",
      409,
    );
  }
  if (claim.kind === "busy") {
    return errorResponse(
      "checkout_in_progress",
      "Checkout is already being created",
      409,
    );
  }

  try {
    const session = await (deps.createCheckout ?? createPolarCheckoutSession)(
      {
        productId: resolved.config.polar_product_id,
        userId: auth.userId,
        email: auth.email,
        productKey: resolved.key,
        planSku: resolved.config.plan_sku,
        environment: mapping.map.environment,
        catalogVersion: mapping.map.catalog_version,
        capabilities: resolved.config.capabilities,
        channels: resolved.config.channels,
        launchScopeVersion: resolved.config.launch_scope_version,
        trial: resolved.config.trial,
      },
      { signal: req.signal },
    );
    try {
      await attempts.complete(attempt, session.checkoutId, session.url);
    } catch {
      await attempts.markUncertain(attempt).catch(() => undefined);
      return errorResponse(
        "checkout_state_uncertain",
        "Checkout was created but could not be recorded safely",
        503,
      );
    }
    return jsonResponse({ url: session.url, reused: false }, 200);
  } catch (error) {
    await attempts.markUncertain(attempt).catch(() => undefined);
    if (error instanceof PolarClientError) {
      return errorResponse(
        error.code,
        error.message,
        error.status,
        publicPolarErrorExtras(error.details),
      );
    }
    console.error("billing-checkout unexpected error");
    return errorResponse(
      "internal_error",
      "Checkout could not be completed",
      500,
    );
  }
}

if (import.meta.main) Deno.serve((req) => handleCheckoutRequest(req));
