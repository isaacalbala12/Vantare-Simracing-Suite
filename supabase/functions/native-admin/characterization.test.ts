// Step 0 compatibility retained only for inactive Gestión (legacy Hub mode).
// P1/P2 rejection before quota/Clerk in active Gestión is in local-auth.test.ts.
// No network permissions: every SaaS/SQL boundary is a test double.
import { type AdminDeps, handleNativeAdmin } from "./index.ts";
import {
  account,
  assert,
  authDeps,
  claims,
  request,
  subject,
  user,
} from "../native-account-authorize/testdata/auth.ts";

function deps(overrides: AdminDeps = {}): AdminDeps {
  return {
    ...authDeps(),
    adminAuth: { enabled: false, clientId: "" },
    ...{ gate: () => Promise.resolve(true) },
    environment: "sandbox",
    resolve: () => Promise.resolve(account),
    begin: () => Promise.resolve(true),
    recordEffect: () => Promise.resolve(true),
    claimChange: () => Promise.resolve("00000000-0000-4000-8000-000000001996"),
    releaseChange: () => Promise.resolve(true),
    finishChange: (a, i, p, e) =>
      (overrides.execute ?? (() => Promise.resolve({})))(
        a,
        i,
        "set_blocked",
        p,
        e,
      ),
    execute: () => Promise.resolve({}),
    ...overrides,
  };
}
const rollout = () => request({ version: 1, action: "get_rollout" });

Deno.test("R10 P1 legacy compatibility: owner Hub OAuth grants admin access", async () => {
  let authorized = false;
  const response = await handleNativeAdmin(
    rollout(),
    deps({
      begin: () => {
        authorized = true;
        return Promise.resolve(true);
      },
      execute: () => Promise.resolve({ rollout: [] }),
    }),
  );
  assert(response.status === 200 && authorized);
  assert((await response.json()).ok === true);
});

Deno.test("R10 P2 legacy compatibility: garbage reaches Clerk within the global budget", async () => {
  const calls: string[] = [];
  const response = await handleNativeAdmin(
    request({ version: 1, action: "get_rollout" }, {
      Authorization: "Bearer garbage",
    }),
    deps({
      fetch: () => {
        calls.push("clerk");
        return Promise.resolve(new Response(null, { status: 400 }));
      },
      resolve: () => {
        calls.push("resolve");
        return Promise.resolve(account);
      },
      begin: () => {
        calls.push("budget");
        return Promise.resolve(true);
      },
    }),
  );
  assert(response.status === 401);
  assert(JSON.stringify(calls) === JSON.stringify(["clerk"]));
});

for (const role of ["non-owner", "expired owner"]) {
  Deno.test(`R10 P2 legacy compatibility: ${role} costs two Clerk calls and resolve`, async () => {
    const calls: string[] = [];
    const response = await handleNativeAdmin(
      rollout(),
      deps({
        fetch: (url) => {
          const verify = String(url).endsWith("/verify");
          calls.push(verify ? "verify" : "profile");
          return Promise.resolve(Response.json(verify ? claims : user));
        },
        resolve: () => {
          calls.push("resolve");
          return Promise.resolve(account);
        },
        // Real role/expiry predicates are characterized separately in pgTAP.
        begin: () => {
          calls.push("owner");
          return Promise.reject({ message: "native_admin_forbidden" });
        },
        execute: () => {
          throw new Error("unauthorized action executed");
        },
      }),
    );
    assert(response.status === 403);
    assert(
      JSON.stringify(calls) === JSON.stringify([
        "verify",
        "profile",
        "resolve",
        "owner",
      ]),
    );
  });
}

for (
  const code of [
    "creator_coupon_mismatch",
    "admin_report_owner_changed",
    "account_deleted",
  ]
) {
  Deno.test(`R10 P9 characterization: ${code} is a refreshable conflict`, async () => {
    const response = await handleNativeAdmin(
      rollout(),
      deps({
        execute: () => Promise.reject({ message: code }),
      }),
    );
    assert(response.status === 409);
    assert((await response.json()).error === "account_conflict");
  });
}

Deno.test("R10 P4 regression: durable intent and result precede unban state transaction failure", async () => {
  const calls: string[] = [];
  const target = "00000000-0000-4000-8000-000000001999";
  const response = await handleNativeAdmin(
    request({
      version: 1,
      action: "set_blocked",
      account_id: target,
      blocked: false,
    }),
    deps({
      recordEffect: (_actor, event) => {
        calls.push(event.outcome);
        return Promise.resolve(true);
      },
      fetch: (url, init) => {
        if (String(url).endsWith("/unban")) {
          calls.push("unban");
          return Promise.resolve(Response.json(user));
        }
        return authDeps().fetch!(url, init);
      },
      execute: (_actor, _issuer, action) => {
        if (action === "get_payment_sync") {
          return Promise.resolve({ needs_sync: false });
        }
        if (action === "get_account") {
          return Promise.resolve({
            account: {
              account_id: target,
              clerk_subject: subject,
              owner: false,
            },
          });
        }
        assert(action === "set_blocked");
        calls.push("sql-audit-failure");
        return Promise.reject({ message: "test_audit_failure" });
      },
    }),
  );
  assert(response.status === 503);
  assert(
    JSON.stringify(calls) ===
      JSON.stringify(["started", "unban", "succeeded", "sql-audit-failure"]),
  );
  // SQL rollback on audit failure is verified by native_admin.test.sql.
});

Deno.test("SQLSTATE40001 without known message is a refreshable conflict", async () => {
  const response = await handleNativeAdmin(
    rollout(),
    deps({
      execute: () =>
        Promise.reject({ code: "40001", message: "synthetic private detail" }),
    }),
  );
  assert(
    response.status === 409 &&
      (await response.json()).error === "account_conflict",
  );
});
