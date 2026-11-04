import { type AdminDeps, handleNativeAdmin } from "./index.ts";
import { VALID_POLAR_PRODUCT_MAP_JSON } from "../_shared/test-fixtures.ts";
import {
  account,
  assert,
  authDeps,
  request,
} from "../native-account-authorize/testdata/auth.ts";

for (
  const [action, params] of [
    ["get_account", { account_id: account }],
    ["list_creators", {}],
    ["get_creator", { creator_id: account }],
  ] as const
) {
  Deno.test(
    "pure read → explicit sync → fresh read: " +
      action,
    async () => {
      const commands: string[] = [];
      let polar = 0;
      let finished = false;
      const map = JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON);
      const deps: AdminDeps = {
        ...authDeps(),
        adminAuth: { enabled: false, clientId: "" },
        environment: "sandbox",
        gate: () => Promise.resolve(true),
        begin: () => Promise.resolve(true),
        paymentSyncBudget: () => Promise.resolve(true),
        resolve: () => Promise.resolve(account),
        productMap: map,
        execute: (_actor, _issuer, command) => {
          commands.push(command);
          if (command === "finish_payment_sync") finished = true;
          return Promise.resolve(
            command === "get_payment_sync" ? { needs_sync: !finished } : {},
          );
        },
        polar: {
          getAccessToken: () => "synthetic-token",
          fetchFn: (url) => {
            polar++;
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
      const response = await handleNativeAdmin(
        request({ version: 1, action, ...params }),
        deps,
      );
      assert(
        response.status === 200 &&
          (await response.json()).payment_sync_required === true,
      );
      assert(polar === 0 && !finished);
      const synced = await handleNativeAdmin(
        request({ version: 1, action: "sync_payments" }),
        deps,
      );
      assert(synced.status === 200 && finished);
      const fresh = await handleNativeAdmin(
        request({ version: 1, action, ...params }),
        deps,
      );
      assert(
        fresh.status === 200 &&
          (await fresh.json()).payment_sync_required === false,
      );
      assert(
        Number(polar) === 3 &&
          JSON.stringify(commands) ===
            JSON.stringify([
              action,
              "get_payment_sync",
              "get_payment_sync",
              "get_payment_sync",
              "finish_payment_sync",
              action,
              "get_payment_sync",
            ]),
      );
    },
  );
}
