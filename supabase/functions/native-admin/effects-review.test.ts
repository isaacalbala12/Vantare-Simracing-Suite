// Characterization written before the 5b changes; only provider/SQL doubles.
import { type AdminDeps, handleNativeAdmin } from "./index.ts";
import {
  account,
  assert,
  authDeps,
  request,
  subject,
} from "../native-account-authorize/testdata/auth.ts";

const target = "00000000-0000-4000-8000-000000001995";
// R2: cleanup failure must preserve the original pre-effect error.
Deno.test("5b R2: failed release never masks the original missing-account error", async () => {
  const f = fixture();
  const response = await handleNativeAdmin(request({version:1,action:"set_blocked",account_id:target,blocked:false}),{
    ...f.deps, execute:()=>Promise.reject({message:"native_admin_not_found"}),
    releaseChange:()=>Promise.reject(new Error("synthetic release failure")),
  });
  assert(response.status===404 && (await response.json()).error==="not_found");
  assert(f.calls.length===0);
});
function fixture(status = 200, blocked = false, sqlFailure = false) {
  const calls: string[] = [];
  const outcomes: string[] = [];
  const deps = {
    ...authDeps(),
    adminAuth: { enabled: false, clientId: "" },
    environment: "sandbox" as const,
    gate: () => Promise.resolve(true),
    resolve: () => Promise.resolve(account),
    begin: () => Promise.resolve(true),
    recordEffect: (
      _actor: string,
      event: { effect: string; outcome: string },
    ) => {
      outcomes.push(event.outcome);
      calls.push(event.effect + ":" + event.outcome);
      return Promise.resolve(true);
    },
    claimChange: () => Promise.resolve("00000000-0000-4000-8000-000000001996"),
    releaseChange: () => Promise.resolve(true),
    finishChange: () => {
      calls.push("state");
      if (sqlFailure) {
        return Promise.reject({ message: "native_admin_owner_conflict" });
      }
      return Promise.resolve({});
    },
    execute: (_a: string, _i: string, action: string) => {
      if (action === "get_account") {
        return Promise.resolve({
          account: {
            account_id: target,
            owner: false,
            clerk_subject: subject,
            subscriptions: [],
          },
        });
      }
      if (action === "set_blocked") {
        calls.push("state");
        if (sqlFailure) {
          return Promise.reject({ message: "native_admin_owner_conflict" });
        }
      }
      return Promise.resolve({});
    },
    fetch: (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(url).endsWith(blocked ? "/ban" : "/unban")) {
        calls.push("provider");
        return Promise.resolve(new Response(null, { status }));
      }
      return authDeps().fetch!(url, init);
    },
  };
  const call = () =>
    handleNativeAdmin(
      request({
        version: 1,
        action: "set_blocked",
        account_id: target,
        blocked,
      }),
      deps,
    );
  return { deps, call, calls, outcomes };
}
for (const status of [401, 403, 422]) {
  Deno.test(`5b: definitive Clerk ${status} is failed, not unknown`, async () => {
    const f = fixture(status);
    assert((await f.call()).status === 503);
    assert(
      JSON.stringify(f.outcomes) === JSON.stringify(["started", "failed"]),
    );
  });
}
Deno.test("5b: SQL 409 after unban is incomplete, not a safe conflict", async () => {
  const f = fixture(200, false, true);
  const response = await f.call();
  assert(
    response.status === 503 &&
      (await response.json()).error === "account_change_incomplete",
  );
});
Deno.test("5b: occupied account lease prevents even the ban SQL state and provider call", async () => {
  const f = fixture(200, true);
  const deps = { ...f.deps, claimChange: () => Promise.resolve(null) };
  const response = await handleNativeAdmin(
    request({
      version: 1,
      action: "set_blocked",
      account_id: target,
      blocked: true,
    }),
    deps,
  );
  assert(response.status === 409 && f.calls.length === 0);
});
Deno.test("5b: ban state precedes intent/provider and closes the journal", async () => {
  const f = fixture(200, true);
  assert((await f.call()).status === 200);
  assert(
    JSON.stringify(f.calls) ===
      JSON.stringify([
        "state",
        "clerk_ban:started",
        "provider",
        "clerk_ban:succeeded",
      ]),
  );
});

for (const status of [200, 201, 401, 500]) {
  Deno.test(`5b: Polar cancellation journal ${status}`, async () => {
    const f = fixture(200, true);
    const subscription = "synthetic-subscription";
    const events: Record<string, unknown>[] = [];
    const deps: AdminDeps = {
      ...f.deps,
      recordEffect: (_actor, event) => {
        events.push(event);
        return Promise.resolve(true);
      },
      execute: (_a, _i, action) => {
        assert(action === "get_account");
        return Promise.resolve({
          account: {
            account_id: target,
            owner: false,
            clerk_subject: subject,
            subscriptions: [subscription],
          },
        });
      },
      polar: {
        getAccessToken: () => "synthetic",
        fetchFn: (_url, init?: RequestInit) => {
          if (init?.method === "DELETE") {
            assert(
              events.some((e) =>
                e.effect === "polar_cancel" && e.outcome === "started"
              ),
            );
            return Promise.resolve(
              status < 300
                ? Response.json({ id: subscription, status: "canceled" }, {
                  status,
                })
                : new Response(null, { status }),
            );
          }
          return Promise.resolve(
            Response.json({ id: subscription, status: "active" }),
          );
        },
      },
    };
    const response = await handleNativeAdmin(
      request({
        version: 1,
        action: "set_blocked",
        account_id: target,
        blocked: true,
      }),
      deps,
    );
    assert(response.status === (status < 300 ? 200 : 503));
    const polar = events.filter((e) => e.effect === "polar_cancel");
    assert(
      polar.length === 2 && polar[0].outcome === "started" &&
        polar[1].outcome ===
          (status < 300 ? "succeeded" : status === 401 ? "failed" : "unknown"),
    );
    assert(polar[1].provider_status === status);
    assert(!JSON.stringify(events).includes(subscription));
  });
}

Deno.test("5b: delete intent failure prevents Clerk DELETE and Storage cleanup", async () => {
  const f = fixture();
  let external = false;
  const deps: AdminDeps = {
    ...f.deps,
    recordEffect: () => Promise.resolve(false),
    execute: (_a, _i, action) =>
      Promise.resolve(
        action === "get_account"
          ? {
            account: {
              account_id: target,
              owner: false,
              clerk_subject: subject,
              subscriptions: [],
            },
          }
          : {
            deletion: {
              account_id: target,
              clerk_subject: subject,
              deleted_at: "2026-11-03T00:00:00Z",
            },
          },
      ),
    polar: {
      getAccessToken: () => "synthetic",
      fetchFn: () => Promise.resolve(new Response(null, { status: 404 })),
    },
    fetch: (url, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        external = true;
        throw new Error("must not delete");
      }
      return authDeps().fetch!(url, init);
    },
    cleanupDeletion: () => {
      external = true;
      return Promise.resolve();
    },
  };
  const response = await handleNativeAdmin(
    request({
      version: 1,
      action: "delete_account",
      account_id: target,
      confirm_email: "tester@example.invalid",
    }),
    deps,
  );
  assert(response.status === 503 && !external);
});
