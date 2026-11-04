// No network/Store permissions: all provider and SQL boundaries are synthetic.
import { type AdminDeps, handleNativeAdmin } from "./index.ts";
import { NativeError } from "../_shared/native-auth.ts";
import { adminClient, publicKey, signedJwt } from "./jwt-fixture.ts";
import { createLocalOAuthVerifier } from "./local-auth.ts";
import {
  account,
  assert,
  authDeps,
  request,
  subject,
} from "../native-account-authorize/testdata/auth.ts";

const target = "00000000-0000-4000-8000-000000001999";
type Event = {
  request_id: string;
  effect_id: string;
  effect: string;
  target_hash: string;
  outcome: string;
};
function fixture(fail?: string) {
  const calls: string[] = [];
  const events: Event[] = [];
  const deps = {
    ...authDeps(),
    adminAuth: { enabled: false, clientId: "" },
    gate: () => Promise.resolve(true),
    environment: "sandbox" as const,
    resolve: () => Promise.resolve(account),
    begin: () => Promise.resolve(true),
    recordEffect: (_actor: string, event: Event, effectAccount: string) => {
      assert(effectAccount === target);
      calls.push(event.outcome);
      if (event.outcome === fail) {
        return Promise.reject(new Error("audit unavailable"));
      }
      events.push(event);
      return Promise.resolve(true);
    },
    execute: (_actor: string, _issuer: string, action: string) => {
      if (action === "get_account") {
        return Promise.resolve({
          account: {
            account_id: target,
            clerk_subject: subject,
            owner: false,
            subscriptions: [],
          },
        });
      }
      assert(action === "set_blocked");
      calls.push("sql-state");
      if (fail === "state") {
        return Promise.reject(new Error("state unavailable"));
      }
      return Promise.resolve({});
    },
    fetch: (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(url).endsWith("/unban")) {
        calls.push("unban");
        return Promise.resolve(
          new Response(null, { status: fail === "provider" ? 500 : 200 }),
        );
      }
      return authDeps().fetch!(url, init);
    },
  };
  const leased = {
    ...deps,
    claimChange: () => Promise.resolve("00000000-0000-4000-8000-000000001996"),
    releaseChange: () => Promise.resolve(true),
    finishChange: (a: string, i: string) => deps.execute(a, i, "set_blocked"),
  };
  return { calls, events, deps: leased };
}
const unblock = () =>
  request({
    version: 1,
    action: "set_blocked",
    account_id: target,
    blocked: false,
  });

Deno.test("R10 effects: unban intent and result survive a subsequent SQL state failure", async () => {
  const f = fixture("state");
  const response = await handleNativeAdmin(unblock(), f.deps);
  assert(response.status === 503);
  assert((await response.json()).error === "account_change_incomplete");
  assert(
    JSON.stringify(f.calls) ===
      JSON.stringify(["started", "unban", "succeeded", "sql-state"]),
  );
  assert(f.events.length === 2);
  assert(f.events[0].request_id === response.headers.get("X-Request-ID"));
  assert(f.events[0].effect_id === f.events[1].effect_id);
  assert(/^[0-9a-f]{64}$/.test(f.events[0].target_hash));
  assert(!JSON.stringify(f.events).includes(subject));
});
for (const fail of ["started", "succeeded", "provider"]) {
  Deno.test(`R10 effects: fail closed at ${fail}, no automatic provider retry`, async () => {
    const f = fixture(fail);
    const response = await handleNativeAdmin(unblock(), f.deps);
    assert(response.status === 503);
    const expected = fail === "started"
      ? ["started"]
      : fail === "succeeded"
      ? ["started", "unban", "succeeded"]
      : ["started", "unban", "unknown"];
    assert(JSON.stringify(f.calls) === JSON.stringify(expected));
    assert(
      f.events.filter((e) => e.outcome === "started").length ===
        (fail === "started" ? 0 : 1),
    );
  });
}
for (const role of ["non-owner", "expired owner"]) {
  Deno.test(`R10 effects: ${role} cannot record an intent or invoke Clerk`, async () => {
    const f = fixture();
    const deps: AdminDeps = {
      ...f.deps,
      begin: () => Promise.reject(new NativeError(403, "forbidden")),
    };
    assert((await handleNativeAdmin(unblock(), deps)).status === 403);
    assert(f.calls.length === 0);
  });
}
Deno.test("R10 effects: garbage cannot record an intent", async () => {
  const f = fixture();
  const deps = {
    ...f.deps,
    fetch: () => Promise.resolve(new Response(null, { status: 400 })),
  };
  assert((await handleNativeAdmin(unblock(), deps)).status === 401);
  assert(f.calls.length === 0);
});

for (const fail of ["none", "clerk", "cleanup", "result"]) {
  Deno.test(`R10 effects: deletion and Storage cleanup audit ${fail}`, async () => {
    const f = fixture();
    const events: Event[] = [];
    const deps: AdminDeps = {
      ...f.deps,
      recordEffect: (_actor, event) => {
        f.calls.push(`${event.effect}:${event.outcome}`);
        if (
          fail === "result" && event.effect === "storage_cleanup" &&
          event.outcome === "succeeded"
        ) {
          return Promise.resolve(false);
        }
        events.push(event);
        return Promise.resolve(true);
      },
      execute: (_actor, _issuer, action) => {
        if (action === "get_account") {
          return Promise.resolve({
            account: {
              account_id: target,
              clerk_subject: subject,
              owner: false,
              subscriptions: [],
            },
          });
        }
        assert(action === "get_account_deletion");
        return Promise.resolve({
          deletion: {
            account_id: target,
            clerk_subject: subject,
            deleted_at: "2026-11-03T00:00:00Z",
          },
        });
      },
      polar: {
        getAccessToken: () => "synthetic",
        fetchFn: () => Promise.resolve(new Response(null, { status: 404 })),
      },
      fetch: (url, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          f.calls.push("clerk-delete");
          // Already absent is a successful idempotent deletion after tombstone.
          return Promise.resolve(
            new Response(null, { status: fail === "clerk" ? 500 : 404 }),
          );
        }
        return authDeps().fetch!(url, init);
      },
      cleanupDeletion: () => {
        f.calls.push("cleanup");
        if (fail === "cleanup") {
          return Promise.reject(new Error("sensitive provider error"));
        }
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
    assert(response.status === (fail === "none" ? 200 : 503));
    const expected = [
      "clerk_delete:started",
      "clerk-delete",
      fail === "clerk" ? "clerk_delete:unknown" : "clerk_delete:succeeded",
    ];
    if (fail !== "clerk") {
      expected.push(
        "storage_cleanup:started",
        "cleanup",
        fail === "cleanup"
          ? "storage_cleanup:unknown"
          : "storage_cleanup:succeeded",
      );
    }
    assert(JSON.stringify(f.calls) === JSON.stringify(expected));
    assert(
      events.every((e) =>
        e.request_id === response.headers.get("X-Request-ID")
      ),
    );
    assert(
      new Set(events.map((e) => e.effect_id)).size ===
        (fail === "clerk" ? 1 : 2),
    );
    assert(
      events.filter((e) => e.outcome === "succeeded").length ===
        (fail === "none" ? 2 : fail === "clerk" ? 0 : 1),
    );
    assert(!JSON.stringify(events).includes(subject));
    assert(!(await response.text()).includes("sensitive provider error"));
  });
}

Deno.test("R10 effects: active Gestión rejects Hub JWT before any intent", async () => {
  const f = fixture();
  const deps: AdminDeps = {
    ...f.deps,
    adminAuth: { enabled: true, clientId: adminClient },
    verifyLocal: createLocalOAuthVerifier(),
    fetch: (url) => {
      assert(String(url).endsWith("/.well-known/jwks.json"));
      return Promise.resolve(Response.json({ keys: [publicKey] }));
    },
  };
  const response = await handleNativeAdmin(
    request({
      version: 1,
      action: "set_blocked",
      account_id: target,
      blocked: false,
    }, {
      Authorization: `Bearer ${await signedJwt({
        client_id: "native-test",
        azp: "native-test",
      })}`,
    }),
    deps,
  );
  assert(response.status === 401 && f.calls.length === 0);
});

for (const value of [false, null, {}, "true", "throw"]) {
  Deno.test(
    "R10 effects: recorder requires true, got " + JSON.stringify(value),
    async () => {
      const f = fixture();
      const deps: AdminDeps = {
        ...f.deps,
        recordEffect: () => {
          if (value === "throw") throw new Error("private recorder");
          // Deliberately violate the dependency's typed ACK, like a malformed RPC.
          return Promise.resolve(value) as Promise<boolean>;
        },
      };
      const response = await handleNativeAdmin(unblock(), deps);
      assert(response.status === 503);
      assert((await response.json()).error === "account_change_incomplete");
      assert(JSON.stringify(f.calls) === "[]");
    },
  );
}
