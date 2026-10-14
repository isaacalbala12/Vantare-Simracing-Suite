import { handlePortalRequest } from "../billing-portal/index.ts";
import { requireNativeBillingAuth } from "../_shared/native-billing-auth.ts";
export function handleNativePortal(request: Request): Promise<Response> {
  return handlePortalRequest(request, {
    requireAuth: requireNativeBillingAuth,
  });
}
if (import.meta.main) Deno.serve(handleNativePortal);
