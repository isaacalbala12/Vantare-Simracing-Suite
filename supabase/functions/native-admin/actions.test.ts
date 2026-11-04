import contract from "../../../vantare-v2/native/admin/fixtures/admin-actions.json" with {
  type: "json",
};
import { validateAdminRequest } from "./index.ts";
import { assert } from "../native-account-authorize/testdata/auth.ts";
const id = "19106900-0000-4000-8000-000000000001";
const sample: Record<string, unknown> = {
  query: "",
  limit: 50,
  cursor: id,
  account_id: id,
  creator_id: id,
  campaign_id: id,
  report_id: id,
  blocked: true,
  enabled: true,
  enabled_for_all: true,
  confirm: true,
  confirm_email: "fixture@example.invalid",
  email: "fixture@example.invalid",
  module: contract.modules[0],
  status: "submitted",
  reason: "fixture",
  fixed_in_version: "1.2.3",
  amount_cents: 100,
  paid_at: "2026-11-04T00:00:00Z",
  name: "fixture",
  code: "CREATOR",
  revision: 1,
  brief: "fixture",
  template: "news",
  target_group: "free",
  content: Object.fromEntries(
    ["es", "en", "it", "pt-BR"].map(
      (x) => [x, { subject: "fixture", body: "fixture" }],
    ),
  ),
};
for (const [action, spec] of Object.entries(contract.actions)) {
  Deno.test(
    "action characterization fields/defaults and closed inputs: " + action,
    () => {
      const params = Object.fromEntries(
        spec.fields.map((field) => [field, sample[field]]),
      );
      assert(
        validateAdminRequest({ version: 1, action, ...params }).action ===
          action,
      );
      let rejected = false;
      try {
        validateAdminRequest({
          version: 1,
          action,
          ...params,
          unexpected: true,
        });
      } catch {
        rejected = true;
      }
      assert(rejected);
    },
  );
}
Deno.test("action characterization: statuses/modules match current accepted wire values", () => {
  for (const status of contract.statuses) {
    assert(
      validateAdminRequest({ version: 1, action: "list_reports", status })
        .action === "list_reports",
    );
  }
  for (const module of contract.modules) {
    assert(
      validateAdminRequest({
        version: 1,
        action: "set_module",
        account_id: id,
        module,
        enabled: true,
      }).action === "set_module",
    );
  }
});
