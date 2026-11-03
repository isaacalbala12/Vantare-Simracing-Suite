import { type AdminDeps, handleNativeAdmin } from "./index.ts";
import {
  account,
  assert,
  authDeps,
  claims,
  config,
  now,
  request,
  user,
} from "../native-account-authorize/testdata/auth.ts";
import { adminClient, publicKey, signedJwt } from "./jwt-fixture.ts";
import { createLocalOAuthVerifier } from "./local-auth.ts";

function fixture(enabled = true, clientId = adminClient) {
  const calls = { jwks: 0, verify: 0, gate: 0, action: 0 };
  const mode = { adminAuth: { enabled, clientId } };
  const deps: AdminDeps = {
    ...authDeps(),
    ...mode,
    ...{ preOwner: () => Promise.resolve(account) },
    environment: "sandbox",
    fetch: (input) => {
      if (String(input).endsWith("/.well-known/jwks.json")) {
        calls.jwks++;
        return Promise.resolve(Response.json({ keys: [publicKey] }));
      }
      if (String(input).endsWith("/verify")) {
        calls.verify++;
        return Promise.resolve(
          Response.json({
            ...claims,
            client_id: enabled ? clientId : config.clientId,
          }),
        );
      }
      return Promise.resolve(Response.json(user));
    },
    gate: () => {
      calls.gate++;
      return Promise.resolve(true);
    },
    begin: () => Promise.resolve(true),
    resolve: () => Promise.resolve(account),
    execute: () => {
      calls.action++;
      return Promise.resolve({});
    },
  };
  return { calls, deps };
}
function call(token: string, deps: AdminDeps) {
  return handleNativeAdmin(
    request({ version: 1, action: "get_rollout" }, {
      Authorization: `Bearer ${token}`,
    }),
    deps,
  );
}
Deno.test("R10 inactive Gestión preserves opaque Hub introspection and safety counter", async () => {
  const { calls, deps } = fixture(false);
  assert((await call("opaque-hub-fixture", deps)).status === 200);
  assert(
    calls.jwks === 0 && calls.verify === 1 && calls.gate === 1 &&
      calls.action === 1,
  );
});
Deno.test("R10 active Gestión accepts only its locally signed OAuth JWT before the counter", async () => {
  const { calls, deps } = fixture();
  assert((await call(await signedJwt(), deps)).status === 200);
  assert(
    calls.jwks === 1 && calls.verify === 1 && calls.gate === 1 &&
      calls.action === 1,
  );
});
for (
  const kind of [
    "opaque",
    "garbage",
    "Hub",
    "expired",
    "issuer",
    "signature",
    "session",
    "algorithm",
  ]
) {
  Deno.test(`R10 active Gestión rejects ${kind} without counter or Clerk introspection`, async () => {
    const { calls, deps } = fixture();
    const token = kind === "opaque"
      ? "opaque-hub-fixture"
      : kind === "garbage"
      ? "x"
      : kind === "Hub"
      ? await signedJwt({ client_id: config.clientId, aud: config.clientId })
      : kind === "expired"
      ? await signedJwt({ exp: now.getTime() / 1000 - 61 })
      : kind === "issuer"
      ? await signedJwt({ iss: "https://foreign.invalid" })
      : kind === "session"
      ? await signedJwt({}, { typ: "JWT" })
      : kind === "algorithm"
      ? await signedJwt({}, { alg: "HS256" })
      : (await signedJwt()).replace(/\.[^.]+$/, "." + "A".repeat(342));
    assert((await call(token, deps)).status === 401);
    assert(calls.verify === 0 && calls.gate === 0 && calls.action === 0);
    assert(calls.jwks <= 1);
  });
}
for (const clientId of ["", config.clientId]) {
  Deno.test(`R10 active Gestión with missing or Hub client configuration fails closed ${clientId}`, async () => {
    const { calls, deps } = fixture(true, clientId);
    assert((await call(await signedJwt(), deps)).status === 503);
    assert(calls.verify === 0 && calls.gate === 0 && calls.action === 0);
  });
}

Deno.test("R10 JWKS cache coalesces concurrent verification and bounds unknown-kid refreshes", async () => {
  const { calls, deps } = fixture();
  deps.verifyLocal = createLocalOAuthVerifier();
  let at = now.getTime();
  deps.now = () => new Date(at);
  const token = await signedJwt();
  const responses = await Promise.all(
    Array.from({ length: 10 }, () => call(token, deps)),
  );
  assert(responses.every((response) => response.status === 200));
  assert(calls.jwks === 1 && calls.gate === 10 && calls.verify === 10);
  const unknown = await signedJwt({}, { kid: "unknown-fixture-key" });
  for (let n = 0; n < 5; n++) {
    assert((await call(unknown, deps)).status === 401);
  }
  assert(Number(calls.jwks) === 2 && calls.gate === 10 && calls.verify === 10);
  at += 300_001;
  assert((await call(token, deps)).status === 200);
  assert(Number(calls.jwks) === 3);
});

Deno.test("R10 JWKS outage backs off without spending counter or Clerk API quota", async () => {
  const { calls, deps } = fixture();
  deps.verifyLocal = createLocalOAuthVerifier();
  let at = now.getTime();
  deps.now = () => new Date(at);
  deps.fetch = () => {
    calls.jwks++;
    return Promise.reject(new Error("JWKS unavailable fixture"));
  };
  const token = await signedJwt();
  for (let n = 0; n < 3; n++) assert((await call(token, deps)).status === 503);
  assert(calls.jwks === 1 && calls.gate === 0 && calls.verify === 0);
  at += 15_001;
  assert((await call(token, deps)).status === 503);
  assert(Number(calls.jwks) === 2);
});

for (const code of ["non-owner", "expired-owner"]) {
  Deno.test(`R10 active Gestión still denies ${code} revoked after owner preflight`, async () => {
    const { calls, deps } = fixture();
    deps.begin = () => Promise.reject({ message: "native_admin_forbidden" });
    assert((await call(await signedJwt(), deps)).status === 403);
    assert(
      calls.jwks === 1 && calls.gate === 1 && calls.verify === 1 &&
        calls.action === 0,
    );
  });
}

for (
  const claims of [
    { aud: "foreign-client" },
    { aud: [adminClient, 42] },
    { azp: "foreign-client" },
    { client_id: "foreign-client" },
    { exp: "9999999999" },
    { exp: undefined },
    { nbf: now.getTime() / 1000 + 61 },
    { sub: "owner" },
  ]
) {
  Deno.test(`R10 signed JWT still rejects invalid claims ${JSON.stringify(claims)}`, async () => {
    const { calls, deps } = fixture();
    assert((await call(await signedJwt(claims), deps)).status === 401);
    assert(calls.jwks === 0 && calls.gate === 0 && calls.verify === 0);
  });
}
for (
  const claims of [{ aud: [adminClient] }, { aud: undefined, azp: adminClient }]
) {
  Deno.test(`R10 accepts configured audience or authorized party ${JSON.stringify(claims)}`, async () => {
    const { calls, deps } = fixture();
    assert((await call(await signedJwt(claims), deps)).status === 200);
    assert(calls.gate === 1 && calls.verify === 1);
  });
}

for (const role of ["non-owner", "expired-owner", "unmapped"]) {
  Deno.test(`R10 owner preflight: ${role} cannot reach quota, Clerk or account creation`, async () => {
    const { calls, deps } = fixture();
    let resolved = 0;
    const guarded = {
      ...deps,
      preOwner: () => Promise.reject({ message: "native_admin_forbidden" }),
      resolve: () => {
        resolved++;
        return Promise.resolve(account);
      },
    };
    assert((await call(await signedJwt(), guarded)).status === 403);
    assert(
      calls.gate === 0 && calls.verify === 0 && calls.action === 0 &&
        resolved === 0,
    );
  });
}
Deno.test("R10 active owner never calls account-creating resolver", async () => {
  const { deps } = fixture();
  let resolved = 0;
  const response = await call(await signedJwt(), {
    ...deps,
    resolve: () => {
      resolved++;
      return Promise.resolve(account);
    },
  });
  assert(response.status === 200 && resolved === 0);
});
for (const [offset, status] of [[-59, 200], [-60, 401], [-61, 401]]) {
  Deno.test(`R10 exp clock tolerance boundary ${offset}`, async () => {
    assert(
      (await call(
        await signedJwt({ exp: now.getTime() / 1000 + offset }),
        fixture().deps,
      )).status === status,
    );
  });
}
for (const [offset, status] of [[59, 200], [60, 200], [61, 401]]) {
  Deno.test(`R10 nbf clock tolerance boundary ${offset}`, async () => {
    assert(
      (await call(
        await signedJwt({ nbf: now.getTime() / 1000 + offset }),
        fixture().deps,
      )).status === status,
    );
  });
}
Deno.test("R10 JWKS rotation reloads once and coalesces concurrent new kids", async () => {
  const { deps, calls } = fixture();
  deps.verifyLocal = createLocalOAuthVerifier();
  const originalFetch = deps.fetch!;
  let rotated = false;
  deps.fetch = (input, init) => {
    if (rotated && String(input).endsWith("/.well-known/jwks.json")) {
      calls.jwks++;
      return Promise.resolve(
        Response.json({ keys: [{ ...publicKey, kid: "rotated-fixture" }] }),
      );
    }
    return originalFetch(input, init);
  };
  assert((await call(await signedJwt(), deps)).status === 200);
  rotated = true;
  const token = await signedJwt({}, { kid: "rotated-fixture" });
  const responses = await Promise.all(
    Array.from({ length: 10 }, () => call(token, deps)),
  );
  assert(responses.every((r) => r.status === 200));
  assert(calls.jwks === 2);
});
