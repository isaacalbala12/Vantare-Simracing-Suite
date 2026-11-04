import { NativeError } from "../_shared/native-auth.ts";
const statuses: Record<string, number> = {
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  account_conflict: 409,
  confirmation_mismatch: 422,
};
const aliases: Record<string, string> = {
  testing_owner_required: "forbidden",
  testing_contribution_missing: "not_found",
  invalid: "invalid_request",
  testing_review_invalid: "invalid_request",
  owner_conflict: "account_conflict",
  mail_revision_conflict: "account_conflict",
  mail_contact_has_account: "account_conflict",
  testing_review_conflict: "account_conflict",
  testing_acceptance_limit: "account_conflict",
  creator_coupon_mismatch: "account_conflict",
  admin_report_owner_changed: "account_conflict",
  account_deleted: "account_conflict",
  account_conflict: "account_conflict",
  mail_erasure_pending: "account_conflict",
};
/** One boundary for stable SQL codes, legacy compatibility and material partial changes. */
export function adminFailure(
  error: unknown,
  partialChange = false,
): NativeError {
  if (partialChange) return new NativeError(503, "account_change_incomplete");
  if (error instanceof NativeError) return error;
  const value = error as { message?: unknown; code?: unknown } | null;
  const name = typeof value?.message === "string"
    ? value.message.replace(/^(admin:|native_admin_)/, "")
    : "";
  const code = Object.hasOwn(aliases, name) ? aliases[name] : name;
  if (Object.hasOwn(statuses, code)) {
    return new NativeError(statuses[code], code);
  }
  if (value?.code === "40001") return new NativeError(409, "account_conflict");
  // Fixed catalog name only: no exception message, SQL detail, identity or URL.
  console.warn("native_admin_unknown_error");
  return new NativeError(503, "bridge_unavailable");
}
