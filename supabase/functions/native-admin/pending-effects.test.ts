import { strict as assert } from "node:assert";
import { type AdminDeps, handleNativeAdmin } from "./index.ts";
import { adminFailure } from "./errors.ts";
import { NativeError } from "../_shared/native-auth.ts";
import { account, authDeps, claims, config, request, user } from "../native-account-authorize/testdata/auth.ts";
import { adminClient, publicKey, signedJwt } from "./jwt-fixture.ts";

function fixture(active = false): { deps: AdminDeps; calls: string[] } {
  const calls: string[] = [];
  return { calls, deps: {
    ...authDeps(), adminAuth: { enabled: active, clientId: adminClient },
    environment: "production", preOwner: () => Promise.resolve(account),
    gate: () => Promise.resolve(true), begin: () => Promise.resolve(true),
    resolve: () => Promise.resolve(account),
    fetch: (input) => Promise.resolve(Response.json(String(input).endsWith("/.well-known/jwks.json")
      ? { keys: [publicKey] } : String(input).endsWith("/verify")
      ? { ...claims, client_id: active ? adminClient : config.clientId } : user)),
    execute: (_actor, _issuer, action) => { calls.push(action); return Promise.resolve({ effects: [], next_cursor: null }); },
  } };
}
const payload = { version: 1, action: "list_pending_effects" };
Deno.test("owner reads pending effects without enrichment or provider writes", async () => {
  const f = fixture(); const response = await handleNativeAdmin(request(payload), f.deps);
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).effects, []);
  assert.deepEqual(f.calls, ["list_pending_effects"]);
});
Deno.test("Gestion JWT can read pending effects", async () => {
  const f = fixture(true); const token = await signedJwt();
  const response = await handleNativeAdmin(request(payload, { Authorization: `Bearer ${token}` }), f.deps);
  assert.equal(response.status, 200); assert.equal(f.calls.length, 1);
});
for (const token of ["opaque-hub-fixture", "garbage"]) {
  Deno.test("active Gestion refuses pending read with " + token, async () => {
    const f = fixture(true);
    const response = await handleNativeAdmin(request(payload, { Authorization: `Bearer ${token}` }), f.deps);
    assert.equal(response.status, 401); assert.deepEqual(f.calls, []);
  });
}
for (const kind of ["non-owner", "expired owner"]) {
  Deno.test("pending read refuses " + kind, async () => {
    const f = fixture(); f.deps.begin = () => Promise.reject(new NativeError(403, "forbidden"));
    const response = await handleNativeAdmin(request(payload), f.deps);
    assert.equal(response.status, 403); assert.deepEqual(f.calls, []);
  });
}
Deno.test("pending cursor is a UUID and extra authority fields are rejected", async () => {
  for (const params of [{ cursor: "bad" }, { actor: account }, { target_hash: "bad" }]) {
    const f = fixture(); const response = await handleNativeAdmin(request({ ...payload, ...params }), f.deps);
    assert.equal(response.status, 400); assert.deepEqual(f.calls, []);
  }
});

for (const [sql, code] of [["native_admin_change_in_progress", "account_change_in_progress"], ["native_admin_effects_pending", "account_effects_pending"]]) {
  Deno.test("distinct conflict response: " + sql, () => {
    const error = adminFailure({ code: "40001", message: sql });
    assert.equal(error.status, 409); assert.equal(error.code, code);
  });
}
