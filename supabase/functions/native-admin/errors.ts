import { NativeError } from "../_shared/native-auth.ts";
const failures: Record<string, readonly [number, string]> = {
  native_admin_forbidden: [403, "forbidden"],
  native_admin_not_found: [404, "not_found"],
  native_admin_invalid: [400, "invalid_request"],
  native_admin_confirmation_mismatch: [422, "confirmation_mismatch"],
  testing_review_invalid: [400, "invalid_request"],
  native_admin_owner_conflict: [409, "account_conflict"],
  mail_revision_conflict: [409, "account_conflict"],
  mail_contact_has_account: [409, "account_conflict"],
  testing_review_conflict: [409, "account_conflict"],
  testing_acceptance_limit: [409, "account_conflict"],
  creator_coupon_mismatch: [409, "account_conflict"],
  admin_report_owner_changed: [409, "account_conflict"],
  account_deleted: [409, "account_conflict"],
  account_conflict: [409, "account_conflict"],
  mail_erasure_pending: [409, "account_conflict"],
};
/** One boundary for stable SQL codes, legacy compatibility and material partial changes. */
export function adminFailure(
  error: unknown,
  partialChange = false,
): NativeError {
  if (partialChange) return new NativeError(503, "account_change_incomplete");
  if (error instanceof NativeError) return error;
  const value = error as { message?: unknown; code?: unknown } | null;
  const name = typeof value?.message === "string" ? value.message : "";
  if (Object.hasOwn(failures, name)) {
    return new NativeError(...failures[name]);
  }
  if (value?.code === "40001") return new NativeError(409, "account_conflict");
  // Fixed catalog name only: no exception message, SQL detail, identity or URL.
  console.warn("native_admin_unknown_error");
  return new NativeError(503, "bridge_unavailable");
}
