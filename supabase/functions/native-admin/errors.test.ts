import { adminFailure } from "./errors.ts";
import { NativeError } from "../_shared/native-auth.ts";
import { assert } from "../native-account-authorize/testdata/auth.ts";
for (
  const [message, status, code] of [
    ["native_admin_forbidden", 403, "forbidden"],
    ["native_admin_not_found", 404, "not_found"],
    ["native_admin_invalid", 400, "invalid_request"],
    ["testing_review_invalid", 400, "invalid_request"],
    ["native_admin_confirmation_mismatch", 422, "confirmation_mismatch"],
    ...[
      "native_admin_owner_conflict",
      "mail_revision_conflict",
      "mail_contact_has_account",
      "testing_review_conflict",
      "testing_acceptance_limit",
      "creator_coupon_mismatch",
      "admin_report_owner_changed",
      "account_deleted",
      "account_conflict",
      "mail_erasure_pending",
    ].map((x) => [x, 409, "account_conflict"]),
  ] as const
) {
  Deno.test("typed SQL failure " + message, () => {
    const error = adminFailure({ message });
    assert(error.status === status && error.code === code);
  });
}
Deno.test("typed transient SQLSTATE40001 refreshes; material partial changes always require review", () => {
  assert(
    adminFailure({ code: "40001", message: "private@example.invalid" }).code ===
      "account_conflict",
  );
  const typed = new NativeError(403, "forbidden");
  assert(adminFailure(typed) === typed);
  for (
    const error of [typed, { code: "40001" }, {
      message: "native_admin_confirmation_mismatch",
    }]
  ) {
    const failure = adminFailure(error, true);
    assert(
      failure.status === 503 && failure.code === "account_change_incomplete",
    );
  }
});
Deno.test("unknown and inherited SQL names use only fixed diagnostics and never expose details", () => {
  const logs: unknown[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    logs.push(args);
  };
  try {
    for (
      const value of [
        {
          message: "private@example.invalid https://private.invalid",
          details: "secret",
        },
        { message: "toString" },
        { message: "__proto__" },
        { message: "admin:constructor" },
        ...[
          "admin:invalid_request",
          "admin:confirmation_mismatch",
          "forbidden",
          "not_found",
          "invalid",
          "testing_owner_required",
          "testing_contribution_missing",
        ].map((message) => ({ message })),
        null,
        new Error("private"),
      ]
    ) {
      const error = adminFailure(value);
      assert(error.status === 503 && error.code === "bridge_unavailable");
    }
  } finally {
    console.warn = original;
  }
  assert(
    logs.length === 13 && !JSON.stringify(logs).includes("private") &&
      !JSON.stringify(logs).includes("secret"),
  );
});
