import contract from "../../../vantare-v2/native/admin/fixtures/admin-actions.json" with {
  type: "json",
};
import { validateAdminRequest } from "./index.ts";
import { assert } from "../native-account-authorize/testdata/auth.ts";
const id = "19106900-0000-4000-8000-000000000001";
for (const [action, spec] of Object.entries(contract.actions)) {
  Deno.test(
    "action characterization fields/defaults and closed inputs: " + action,
    () => {
      const params = spec.example;
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

import { actionContract, ACTIONS } from "./actions.ts";
Deno.test("canonical registry export matches the Rust wire fixture exactly", () => {
  assert(JSON.stringify(actionContract()) === JSON.stringify(contract));
});
Deno.test("canonical action environments retain sandbox restrictions and closed unknown names", () => {
  for (const [action, spec] of Object.entries(contract.actions)) {
    assert(
      (ACTIONS[action][2]?.sandbox === true) ===
        (spec.environment === "sandbox"),
    );
  }
  for (const action of ["mail_claim", "toString", "__proto__", "unknown"]) {
    let rejected = false;
    try {
      validateAdminRequest({ version: 1, action });
    } catch {
      rejected = true;
    }
    assert(rejected);
  }
});

Deno.test("registry generates usable wire examples and dispatch flags", () => {
  for (const [action, raw] of Object.entries(actionContract().actions)) {
    const spec = raw as unknown as Record<string, unknown>;
    assert(!!spec.example && typeof spec.example === "object");
    assert(typeof spec.mutation === "boolean");
    assert(typeof spec.mail === "boolean");
    assert(
      validateAdminRequest({
        version: 1,
        action,
        ...spec.example as Record<string, unknown>,
      }).action === action,
    );
  }
});
