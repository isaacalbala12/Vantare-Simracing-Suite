import { handleCheckoutRequest } from "../billing-checkout/index.ts";
import { requireNativeBillingAuth } from "../_shared/native-billing-auth.ts";
export function handleNativeCheckout(request: Request): Promise<Response> {
  return handleCheckoutRequest(request, {
    requireAuth: requireNativeBillingAuth,
  });
}
if (import.meta.main) Deno.serve(handleNativeCheckout);
