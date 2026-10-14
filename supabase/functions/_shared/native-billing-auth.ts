import type { AuthResult } from "./auth.ts";
import {
  type NativeAuthDeps,
  nativeBearer,
  NativeError,
  requireUnblocked,
  resolveNativeAccount,
  verifyNativeOAuth,
} from "./native-auth.ts";
import { errorResponse } from "./responses.ts";
import { isUuid } from "./request.ts";

export async function requireNativeBillingAuth(
  request: Request,
  deps: NativeAuthDeps & { resolve?: typeof resolveNativeAccount } = {},
): Promise<AuthResult> {
  try {
    const token = nativeBearer(request);
    const identity = await verifyNativeOAuth(token, deps);
    await requireUnblocked(identity.subject, deps);
    const userId = await (deps.resolve ?? resolveNativeAccount)(
      identity.issuer,
      identity.subject,
    );
    if (!isUuid(userId)) throw new NativeError(503, "identity_unavailable");
    return { ok: true, token, userId, email: null };
  } catch (error) {
    const status = error instanceof NativeError ? error.status : 503;
    return {
      ok: false,
      response: errorResponse(
        status < 500 ? "unauthorized" : "identity_unavailable",
        "Native identity verification failed",
        status,
      ),
    };
  }
}
