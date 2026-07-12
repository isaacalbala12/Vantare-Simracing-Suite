import { requireUserAuth, type AuthResult } from "../_shared/auth.ts";
import { handleCorsPreflight } from "../_shared/cors.ts";
import {
  isAllowedCheckoutProductKey,
  loadPolarProductMap,
  resolveCheckoutKey,
  V1_ENTITLEMENT_PRODUCT_KEY,
} from "../_shared/mapping.ts";
import {
  createPolarCheckoutSession,
  PolarClientError,
  publicPolarErrorExtras,
  type CreateCheckoutResult,
} from "../_shared/polar.ts";
import { errorResponse, jsonResponse } from "../_shared/responses.ts";

export type CheckoutDeps = {
  requireAuth?: (req: Request) => Promise<AuthResult>;
  loadMap?: typeof loadPolarProductMap;
  createCheckout?: (
    params: Parameters<typeof createPolarCheckoutSession>[0],
  ) => Promise<CreateCheckoutResult>;
};

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

  const requireAuth = deps.requireAuth ?? requireUserAuth;
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    return errorResponse("invalid_json", "Request body must be JSON", 400);
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

  const productKey = typeof body.productKey === "string"
    ? body.productKey.trim()
    : "";
  if (!productKey) {
    return errorResponse("invalid_product_key", "productKey is required", 400);
  }

  if (!isAllowedCheckoutProductKey(productKey)) {
    return errorResponse(
      "invalid_product_key",
      `productKey "${productKey}" is not allowed`,
      400,
    );
  }

  const loadMap = deps.loadMap ?? loadPolarProductMap;
  const mapping = loadMap();
  if (!mapping.ok) {
    return errorResponse(mapping.code, mapping.message, 503);
  }

  const resolved = resolveCheckoutKey(mapping.map, productKey);
  if (!resolved.ok) {
    return errorResponse(resolved.code, resolved.message, 400);
  }

  const createCheckout = deps.createCheckout ?? createPolarCheckoutSession;

  try {
    const session = await createCheckout({
      productId: resolved.config.polar_product_id,
      userId: auth.userId,
      email: auth.email,
      productKey: resolved.key,
      planSku: resolved.config.plan_sku,
      entitlementProductKey: V1_ENTITLEMENT_PRODUCT_KEY,
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
    console.error("billing-checkout unexpected error");
    return errorResponse(
      "internal_error",
      "Checkout could not be completed",
      500,
    );
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleCheckoutRequest(req));
}