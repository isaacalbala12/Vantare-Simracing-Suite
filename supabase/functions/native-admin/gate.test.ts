import { type AdminDeps, handleNativeAdmin } from "./index.ts";
import {
  account,
  assert,
  authDeps,
  request,
} from "../native-account-authorize/testdata/auth.ts";

for (const identity of ["hub-owner", "garbage", "non-owner", "expired-owner"]) {
  Deno.test(`R10 gate characterization: exhausted global budget with ${identity}`, async () => {
    let clerk = 0, resolved = 0, gates = 0, executed = 0;
    const budget = {
      gate: () => {
        gates++;
        return Promise.resolve(false);
      },
    };
    const deps: AdminDeps = {
      ...authDeps(),
      ...budget,
      environment: "sandbox",
      fetch: (url, init) => {
        clerk++;
        return identity === "garbage"
          ? Promise.resolve(new Response(null, { status: 400 }))
          : authDeps().fetch!(url, init);
      },
      resolve: () => {
        resolved++;
        return Promise.resolve(account);
      },
      begin: () =>
        identity === "hub-owner"
          ? Promise.resolve(true)
          : Promise.reject({ message: "native_admin_forbidden" }),
      execute: () => {
        executed++;
        return Promise.resolve({});
      },
    };
    const response = await handleNativeAdmin(
      request({ version: 1, action: "get_rollout" }),
      deps,
    );
    assert(gates === 0);
    assert(clerk === (identity === "garbage" ? 1 : 2));
    assert(resolved === (identity === "garbage" ? 0 : 1));
    assert(executed === (identity === "hub-owner" ? 1 : 0));
    assert(
      response.status ===
        (identity === "hub-owner" ? 200 : identity === "garbage" ? 401 : 403),
    );
  });
}
