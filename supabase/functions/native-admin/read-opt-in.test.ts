import { type AdminDeps, handleNativeAdmin } from "./index.ts";
import { VALID_POLAR_PRODUCT_MAP_JSON } from "../_shared/test-fixtures.ts";
import {
  account,
  assert,
  authDeps,
  request,
} from "../native-account-authorize/testdata/auth.ts";
function fixture() {
  const map = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON),
    calls: string[] = [],
    outcomes: string[] = [];
  let http = 0;
  const deps = {
    ...authDeps(),
    environment: "sandbox" as const,
    gate: () => Promise.resolve(true),
    begin: () => Promise.resolve(true),
    resolve: () => Promise.resolve(account),
    productMap: map,
    paymentSyncBudget: () => Promise.resolve(true),
    paymentSyncResult: (_actor: string, _request: string, outcome: string) => {
      outcomes.push(outcome);
      return Promise.resolve(true);
    },
    execute: (_a: string, _i: string, command: string) => {
      calls.push(command);
      return Promise.resolve(
        command === "get_payment_sync" ? { needs_sync: true } : {},
      );
    },
    polar: {
      getAccessToken: () => "fixture-token",
      fetchFn: (url: string | URL | Request) => {
        http++;
        return Promise.resolve(
          Response.json(
            String(url).includes("organizations/")
              ? { id: map.organization_id }
              : { items: [], pagination: { max_page: 1 } },
          ),
        );
      },
    },
  };
  return { deps, calls, outcomes, http: () => http };
}
for (
  const [action, params] of [["get_account", { account_id: account }], [
    "list_creators",
    {},
  ], ["get_creator", { creator_id: account }]] as const
) {
  Deno.test("legacy read keeps implicit sync: " + action, async () => {
    const f = fixture();
    const response = await handleNativeAdmin(
      request({ version: 1, action, ...params }),
      f.deps,
    );
    assert(response.status === 200 && f.http() === 3);
    assert(!Object.hasOwn(await response.json(), "payment_sync_required"));
    assert(
      JSON.stringify(f.calls) ===
        JSON.stringify(["get_payment_sync", "finish_payment_sync", action]),
    );
  });
}
Deno.test("explicit sync records its result after winning quota", async () => {
  const f = fixture();
  const response = await handleNativeAdmin(
    request({ version: 1, action: "sync_payments" }),
    f.deps,
  );
  assert(
    response.status === 200 && JSON.stringify(f.outcomes) === '["succeeded"]',
  );
  assert(f.calls.filter((x) => x === "get_payment_sync").length === 1);
});
Deno.test("failed explicit sync records unknown without certifying history", async () => {
  const f = fixture();
  const deps = {
    ...f.deps,
    execute: (_a: string, _i: string, command: string) => {
      if (command === "finish_payment_sync") {
        throw new Error("fixture SQL failure");
      }
      return Promise.resolve(
        command === "get_payment_sync" ? { needs_sync: true } : {},
      );
    },
  };
  const response = await handleNativeAdmin(
    request({ version: 1, action: "sync_payments" }),
    deps,
  );
  assert(
    response.status === 503 && JSON.stringify(f.outcomes) === '["unknown"]',
  );
});
