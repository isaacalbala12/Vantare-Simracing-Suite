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
    assert(gates === 1);
    assert(clerk === 0 && resolved === 0 && executed === 0);
    assert(response.status === 429);
    assert((await response.json()).error === "rate_limited");
  });
}

for (const identity of ["hub-owner", "garbage", "non-owner", "expired-owner"]) {
  Deno.test(`R10 available global budget preserves authorization for ${identity}`, async () => {
    let clerk = 0, gates = 0, executed = 0;
    const response = await handleNativeAdmin(
      request({ version: 1, action: "get_rollout" }),
      {
        ...authDeps(),
        environment: "sandbox",
        gate: () => {
          gates++;
          return Promise.resolve(true);
        },
        fetch: (url, init) => {
          assert(gates === 1);
          clerk++;
          return identity === "garbage"
            ? Promise.resolve(new Response(null, { status: 400 }))
            : authDeps().fetch!(url, init);
        },
        resolve: () => Promise.resolve(account),
        begin: () =>
          identity === "hub-owner"
            ? Promise.resolve(true)
            : Promise.reject({ message: "native_admin_forbidden" }),
        execute: () => {
          executed++;
          return Promise.resolve({});
        },
      },
    );
    assert(gates === 1 && clerk === (identity === "garbage" ? 1 : 2));
    assert(executed === (identity === "hub-owner" ? 1 : 0));
    assert(
      response.status ===
        (identity === "hub-owner" ? 200 : identity === "garbage" ? 401 : 403),
    );
  });
}

Deno.test("R10 gate failure is unavailable without any Clerk or action call", async () => {
  const response = await handleNativeAdmin(
    request({ version: 1, action: "get_rollout" }),
    {
      ...authDeps(),
      gate: () => Promise.reject(new Error("synthetic SQL failure")),
      fetch: () => {
        throw new Error("Clerk must not be called");
      },
      execute: () => {
        throw new Error("action must not be called");
      },
    },
  );
  assert(response.status === 503);
  assert((await response.json()).error === "bridge_unavailable");
});

Deno.test("R10 malformed request consumes no global budget", async () => {
  let gates = 0;
  const response = await handleNativeAdmin(
    request({ version: 1, action: "unknown" }),
    {
      gate: () => {
        gates++;
        return Promise.resolve(true);
      },
    },
  );
  assert(response.status === 400 && gates === 0);
});

Deno.test("R10 mail actions use the same pre-Clerk global gate", async () => {
  const response = await handleNativeAdmin(
    request({ version: 1, action: "mail_list" }),
    {
      gate: () => Promise.resolve(false),
      fetch: () => {
        throw new Error("Clerk must not be called");
      },
      mailExecute: () => {
        throw new Error("mail must not be called");
      },
    },
  );
  assert(response.status === 429);
});
