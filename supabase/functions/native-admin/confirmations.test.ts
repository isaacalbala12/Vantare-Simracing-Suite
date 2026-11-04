import { validateAction } from "./actions.ts";
import { strict as assert } from "node:assert";
const id = "19100600-0000-4000-8000-000000000001";
Deno.test("confirmation contract binds the visible prior state", () => {
  for (const [action, params] of [
    ["set_module", { account_id: id, module: "vantare.module.strategy", enabled: true }],
    ["set_rollout", { module: "vantare.module.strategy", enabled_for_all: true }],
    ["mail_approve", { campaign_id: id, revision: 1, confirm: true }],
  ] as const) assert.throws(() => validateAction(action, params));
});
Deno.test("confirmation contract accepts explicit expectations and campaign cancellation", () => {
  for (const [action, params] of [
    ["set_module", { account_id: id, module: "vantare.module.strategy", enabled: true, expected_enabled: false }],
    ["set_rollout", { module: "vantare.module.strategy", enabled_for_all: true, expected_enabled: false }],
    ["mail_approve", { campaign_id: id, revision: 1, confirm: true, expected_recipients: 0 }],
    ["mail_cancel", { campaign_id: id, revision: 1 }],
  ] as const) assert.doesNotThrow(() => validateAction(action, params));
});
