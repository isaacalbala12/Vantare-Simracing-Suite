// No network/Store permissions: all provider and SQL boundaries are synthetic.
import { type AdminDeps, handleNativeAdmin } from "./index.ts";
import { NativeError } from "../_shared/native-auth.ts";
import { account, assert, authDeps, request, subject, user } from "../native-account-authorize/testdata/auth.ts";

const target = "00000000-0000-4000-8000-000000001999";
type Event = { request_id: string; effect_id: string; effect: string; target_hash: string; outcome: string };
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
    recordEffect: (_actor: string, event: Event) => {
      calls.push(event.outcome);
      if (event.outcome === fail) return Promise.reject(new Error("audit unavailable"));
      events.push(event);
      return Promise.resolve(true);
    },
    execute: (_actor: string, _issuer: string, action: string) => {
      if (action === "get_account") return Promise.resolve({account: {account_id: target, clerk_subject: subject, owner: false, subscriptions: []}});
      assert(action === "set_blocked");
      calls.push("sql-state");
      if (fail === "state") return Promise.reject(new Error("state unavailable"));
      return Promise.resolve({});
    },
    fetch: (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(url).endsWith("/unban")) {
        calls.push("unban");
        return Promise.resolve(new Response(null, {status: fail === "provider" ? 500 : 200}));
      }
      return authDeps().fetch!(url, init);
    },
  };
  return {calls, events, deps};
}
const unblock = () => request({version: 1, action: "set_blocked", account_id: target, blocked: false});

Deno.test("R10 effects: unban intent and result survive a subsequent SQL state failure", async () => {
  const f = fixture("state");
  const response = await handleNativeAdmin(unblock(), f.deps);
  assert(response.status === 503);
  assert(JSON.stringify(f.calls) === JSON.stringify(["started", "unban", "succeeded", "sql-state"]));
  assert(f.events.length === 2);
  assert(f.events[0].request_id === response.headers.get("X-Request-ID"));
  assert(f.events[0].effect_id === f.events[1].effect_id);
  assert(/^[0-9a-f]{64}$/.test(f.events[0].target_hash));
  assert(!JSON.stringify(f.events).includes(subject));
});
for (const fail of ["started", "succeeded", "provider"])
  Deno.test(`R10 effects: fail closed at ${fail}, no automatic provider retry`, async () => {
    const f = fixture(fail);
    const response = await handleNativeAdmin(unblock(), f.deps);
    assert(response.status === 503);
    const expected = fail === "started" ? ["started"] : fail === "succeeded" ? ["started", "unban", "succeeded"] : ["started", "unban", "unknown"];
    assert(JSON.stringify(f.calls) === JSON.stringify(expected));
    assert(f.events.filter(e => e.outcome === "started").length === (fail === "started" ? 0 : 1));
  });
for (const role of ["non-owner", "expired owner"])
  Deno.test(`R10 effects: ${role} cannot record an intent or invoke Clerk`, async () => {
    const f = fixture();
    const deps: AdminDeps = {...f.deps, begin: () => Promise.reject(new NativeError(403, "forbidden"))};
    assert((await handleNativeAdmin(unblock(), deps)).status === 403);
    assert(f.calls.length === 0);
  });
Deno.test("R10 effects: garbage cannot record an intent", async () => {
  const f = fixture();
  const deps = {...f.deps, fetch: () => Promise.resolve(new Response(null, {status: 400}))};
  assert((await handleNativeAdmin(unblock(), deps)).status === 401);
  assert(f.calls.length === 0);
});
