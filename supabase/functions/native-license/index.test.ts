import { handleNativeLicenseRequest, type NativeLicenseDeps } from "./index.ts";
import {
  handleLicenseCredentialRequest,
  loadCredentialAccount,
  signCredential,
} from "../_shared/license-credential.ts";

const fingerprint = "a".repeat(64);
const accountId = "00000000-0000-4000-8000-000000000444";
const subject = `user_${"u".repeat(27)}`;
const token = "test-oauth-access-token";
const now = new Date("2026-10-02T12:00:00Z");
const config = {
  secretKey: "test-server-secret",
  clientId: "test-native-client",
  issuer: "https://clerk.example.invalid",
};
const body = { version: 1, deviceFingerprint: fingerprint };
const verification = {
  object: "clerk_idp_oauth_access_token",
  id: `oat_${"a".repeat(32)}`,
  client_id: config.clientId,
  subject,
  scopes: ["openid", "profile", "offline_access"],
  revoked: false,
  revocation_reason: null,
  expired: false,
  expiration: now.getTime() / 1000 + 3600,
  created_at: now.getTime() / 1000 - 10,
  updated_at: now.getTime() / 1000 - 10,
};
const state = {
  accountId,
  deviceMatches: true,
  grants: [{
    capability: "vantare.plan.pro",
    valid_until: "2026-11-02T12:00:00Z",
    provider: "polar",
    environment: "production",
    source_type: "subscription",
  }, {
    capability: "vantare.channel.nightly",
    valid_until: "2026-10-03T12:00:00Z",
    provider: "vantare",
    environment: "production",
    source_type: "subscription_recovery",
  }],
  operationalAssignments: [{
    role: "owner",
    expires_at: null,
    policy_version: 1,
  }],
};

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function request(
  value: unknown = body,
  headers: Record<string, string> = {},
): Request {
  return new Request("https://local.invalid/native-license", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: "public-anon",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(value),
  });
}

function deps(overrides: NativeLicenseDeps = {}): NativeLicenseDeps {
  return {
    config,
    environment: "production",
    now: () => now,
    fetch: () => Promise.resolve(Response.json(verification)),
    load: () => Promise.resolve(state),
    sign: (claims) =>
      Promise.resolve({
        version: 1,
        algorithm: "Ed25519",
        key_id: "fixture-key",
        claims,
        signature: "fixture-signature",
      }),
    ...overrides,
  };
}

async function expectError(response: Response, status: number, error: string) {
  assert(
    response.status === status,
    `expected ${status}, got ${response.status}`,
  );
  assert(response.headers.get("Cache-Control") === "no-store");
  const value = await response.json();
  assert(JSON.stringify(Object.keys(value).sort()) === '["error","message"]');
  assert(value.error === error && typeof value.message === "string");
  assert(!JSON.stringify(value).includes(token));
  assert(!JSON.stringify(value).includes(accountId));
}

Deno.test("native and TPA issue exactly the same signed credential and grants", async () => {
  const keys = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]) as CryptoKeyPair;
  const sign: NonNullable<NativeLicenseDeps["sign"]> = (claims) =>
    signCredential(claims, "fixture-key", keys.privateKey);
  let verifications = 0;
  let loads = 0;
  const native = await handleNativeLicenseRequest(
    request(),
    deps({
      sign,
      config: { ...config, issuer: `${config.issuer}/` },
      fetch: (input, init) => {
        verifications++;
        const options = init as {
          method: string;
          redirect: string;
          signal: AbortSignal;
          headers: HeadersInit;
          body: string;
        };
        assert(
          input ===
            "https://api.clerk.com/oauth_applications/access_tokens/verify",
        );
        assert(
          options.method === "POST" && options.redirect === "error" &&
            options.signal,
        );
        assert(
          new Headers(options.headers).get("Authorization") ===
            `Bearer ${config.secretKey}`,
        );
        assert(options.body === JSON.stringify({ access_token: token }));
        return Promise.resolve(Response.json(verification));
      },
      load: (issuer, verifiedSubject, device) => {
        loads++;
        assert(
          issuer === config.issuer && verifiedSubject === subject &&
            device === fingerprint,
        );
        return Promise.resolve(state);
      },
    }),
  );
  const legacy = await handleLicenseCredentialRequest(
    request({ deviceFingerprint: fingerprint }),
    {
      environment: "production",
      now: () => now,
      sign,
      store: { load: () => Promise.resolve(state) },
    },
  );
  assert(
    native.status === 200 && legacy.status === 200 && verifications === 1 &&
      loads === 1,
  );
  assert(native.headers.get("Cache-Control") === "no-store");
  const nativeBody = await native.json();
  assert(JSON.stringify(nativeBody) === JSON.stringify(await legacy.json()));
  assert(
    JSON.stringify(Object.keys(nativeBody).sort()) ===
      '["credential","online_capabilities"]',
  );
  assert(nativeBody.credential.claims.subject === accountId);
  assert(nativeBody.online_capabilities[0] === "vantare.channel.nightly");
  const { signature, ...payload } = nativeBody.credential;
  const bytes = Uint8Array.from(
    atob(signature.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
  assert(
    await crypto.subtle.verify(
      "Ed25519",
      keys.publicKey,
      bytes,
      new TextEncoder().encode(JSON.stringify(payload)),
    ),
  );
});

for (
  const invalidBody of [
    {},
    null,
    [],
    { ...body, version: 2 },
    { ...body, version: "1" },
    { version: 1 },
    { ...body, deviceFingerprint: fingerprint.toUpperCase() },
    { ...body, deviceFingerprint: ` ${fingerprint}` },
    { ...body, deviceFingerprint: "a".repeat(63) },
    { ...body, deviceFingerprint: null },
    { ...body, email: "ignored@example.invalid" },
    { ...body, accountId },
    { ...body, issuer: config.issuer },
    { ...body, capabilities: [] },
  ]
) {
  Deno.test(`native rejects strict-body violation ${JSON.stringify(invalidBody)}`, async () => {
    await expectError(
      await handleNativeLicenseRequest(
        request(invalidBody),
        deps({
          fetch: () => {
            throw new Error("verification must not run");
          },
        }),
      ),
      400,
      "invalid_request",
    );
  });
}

for (
  const authorization of ["", "Bearer", "Bearer ", "Basic token", "Bearer a b"]
) {
  Deno.test(`native rejects missing or malformed bearer ${authorization}`, async () => {
    await expectError(
      await handleNativeLicenseRequest(
        request(body, { Authorization: authorization }),
        deps(),
      ),
      401,
      "unauthorized",
    );
  });
}

Deno.test("native enforces byte limits on body, declared length and bearer", async () => {
  const valid = JSON.stringify(body);
  for (
    const raw of [
      valid.padEnd(1025),
      JSON.stringify({ ...body, extra: "é".repeat(512) }),
    ]
  ) {
    await expectError(
      await handleNativeLicenseRequest(
        new Request(request(), { body: raw }),
        deps(),
      ),
      413,
      "request_too_large",
    );
  }
  await expectError(
    await handleNativeLicenseRequest(
      request(body, { "Content-Length": "1025" }),
      deps(),
    ),
    413,
    "request_too_large",
  );
  assert(
    (await handleNativeLicenseRequest(
      new Request(request(), { body: valid.padEnd(1024) }),
      deps(),
    )).status === 200,
  );
  assert(
    (await handleNativeLicenseRequest(
      request(body, { Authorization: `Bearer ${"a".repeat(16384)}` }),
      deps(),
    )).status === 200,
  );
  await expectError(
    await handleNativeLicenseRequest(
      request(body, { Authorization: `Bearer ${"a".repeat(16385)}` }),
      deps(),
    ),
    413,
    "request_too_large",
  );
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(valid.padEnd(1025)));
      controller.close();
    },
  });
  await expectError(
    await handleNativeLicenseRequest(
      new Request(request(), { body: stream }),
      deps(),
    ),
    413,
    "request_too_large",
  );
});

Deno.test("native rejects methods, malformed JSON and media type", async () => {
  for (const method of ["GET", "OPTIONS", "PUT"]) {
    await expectError(
      await handleNativeLicenseRequest(
        new Request("https://local.invalid", { method }),
        deps(),
      ),
      405,
      "method_not_allowed",
    );
  }
  await expectError(
    await handleNativeLicenseRequest(
      new Request(request(), { body: "{" }),
      deps(),
    ),
    400,
    "invalid_request",
  );
  await expectError(
    await handleNativeLicenseRequest(
      request(body, { "Content-Type": "text/plain" }),
      deps(),
    ),
    400,
    "invalid_request",
  );
});

for (
  const [name, overrides, status] of [
    ["revoked", { revoked: true }, 401],
    ["expired", { expired: true }, 401],
    ["elapsed expiry", { expiration: now.getTime() / 1000 }, 401],
    ["wrong client", { client_id: "other-client" }, 403],
    ["organization subject", { subject: "org_other" }, 403],
    ["UUID subject", { subject: accountId }, 403],
    ["missing openid", { scopes: ["profile"] }, 403],
    ["missing profile", { scopes: ["openid"] }, 403],
    ["session object", { object: "session" }, 503],
    ["missing client proof", { client_id: null }, 503],
    ["missing expiry proof", { expiration: null }, 503],
    ["string expiry", { expiration: "9999999999" }, 503],
    ["missing revoked proof", { revoked: null }, 503],
    ["missing expired proof", { expired: null }, 503],
    ["scope string", { scopes: "openid profile" }, 503],
  ] as const
) {
  Deno.test(`native rejects Clerk ${name} before account resolution`, async () => {
    let loads = 0;
    const response = await handleNativeLicenseRequest(
      request(),
      deps({
        fetch: () =>
          Promise.resolve(Response.json({ ...verification, ...overrides })),
        load: () => {
          loads++;
          return Promise.resolve(state);
        },
      }),
    );
    await expectError(
      response,
      status,
      status === 401
        ? "unauthorized"
        : status === 403
        ? "forbidden"
        : "bridge_unavailable",
    );
    assert(loads === 0);
  });
}

Deno.test("native fails closed for Clerk inactive, invalid JSON and upstream failures", async () => {
  for (
    const [upstream, status, error] of [
      [400, 401, "unauthorized"],
      [404, 401, "unauthorized"],
      [401, 503, "bridge_unavailable"],
      [403, 503, "bridge_unavailable"],
      [429, 429, "rate_limited"],
      [500, 503, "bridge_unavailable"],
    ] as const
  ) {
    await expectError(
      await handleNativeLicenseRequest(
        request(),
        deps({
          fetch: () => Promise.resolve(new Response("", { status: upstream })),
        }),
      ),
      status,
      error,
    );
  }
  await expectError(
    await handleNativeLicenseRequest(
      request(),
      deps({ fetch: () => Promise.resolve(Response.json({ active: false })) }),
    ),
    401,
    "unauthorized",
  );
  for (
    const raw of [
      "{",
      "null",
      "[]",
      "{}",
      '{"sub":"user_unverified","email":"ignored@example.invalid"}',
    ]
  ) {
    await expectError(
      await handleNativeLicenseRequest(
        request(),
        deps({ fetch: () => Promise.resolve(new Response(raw)) }),
      ),
      503,
      "bridge_unavailable",
    );
  }
  await expectError(
    await handleNativeLicenseRequest(
      request(),
      deps({ fetch: () => Promise.reject(new Error("timeout")) }),
    ),
    503,
    "bridge_unavailable",
  );
});

Deno.test("native config, account, grants and signing failures do not issue access", async () => {
  for (
    const partial of [{ secretKey: "" }, { clientId: "" }, {
      issuer: "http://clerk.invalid",
    }, { issuer: "https://clerk.invalid/path" }]
  ) {
    await expectError(
      await handleNativeLicenseRequest(
        request(),
        deps({ config: { ...config, ...partial } }),
      ),
      503,
      "bridge_unavailable",
    );
  }
  await expectError(
    await handleNativeLicenseRequest(
      request(),
      deps({ load: () => Promise.resolve({ ...state, deviceMatches: false }) }),
    ),
    409,
    "device_limit",
  );
  await expectError(
    await handleNativeLicenseRequest(
      request(),
      deps({ load: () => Promise.reject({ message: "account_conflict" }) }),
    ),
    409,
    "account_conflict",
  );
  await expectError(
    await handleNativeLicenseRequest(
      request(),
      deps({
        load: () =>
          Promise.resolve({
            ...state,
            grants: [{ ...state.grants[0], capability: "unknown" }],
          }),
      }),
    ),
    409,
    "account_conflict",
  );
  await expectError(
    await handleNativeLicenseRequest(
      request(),
      deps({ sign: () => Promise.reject(new Error("signing failed")) }),
    ),
    503,
    "bridge_unavailable",
  );
});

Deno.test("native never logs tokens, emails or UUIDs even when upstream throws them", async () => {
  const methods = ["log", "warn", "error", "info", "debug"] as const;
  const originals = methods.map((method) => console[method]);
  let logs = 0;
  try {
    for (const method of methods) {
      console[method] = () => {
        logs++;
      };
    }
    const rejected = () =>
      Promise.reject(
        new Error(`${token} private@example.invalid ${accountId}`),
      );
    for (
      const overrides of [{ fetch: rejected }, { load: rejected }, {
        sign: rejected,
      }]
    ) {
      await expectError(
        await handleNativeLicenseRequest(request(), deps(overrides)),
        503,
        "bridge_unavailable",
      );
    }
  } finally {
    methods.forEach((method, index) => {
      console[method] = originals[index];
    });
  }
  assert(logs === 0, "handler logged sensitive upstream data");
});

Deno.test("beta modules: per-account, rollout, unknown rejection and owner without module rows", async () => {
  const modules = ["analysis", "calendar", "engineer", "strategy"];
  for (const module of modules) {
    const capability = `vantare.module.${module}`;
    for (const global of [false, true]) {
      const response = await handleNativeLicenseRequest(
        request(),
        deps({
          load: () =>
            Promise.resolve({
              accountId,
              deviceMatches: true,
              grants: global ? [] : [{
                capability,
                valid_until: null,
                provider: "vantare",
                environment: "production",
                source_type: "support",
              }],
              moduleRollout: [{ module: capability, enabled_for_all: global }],
            }),
        }),
      );
      assert(response.status === 200);
      const result = await response.json();
      assert(
        JSON.stringify(result.credential.claims.capabilities) ===
          JSON.stringify([{ key: capability, perpetual: true }]),
      );
    }
  }
  for (
    const invalid of [
      {
        grants: [{
          capability: "vantare.module.unknown",
          valid_until: null,
          provider: "vantare",
          environment: "production",
          source_type: "support",
        }],
      },
      {
        grants: [],
        moduleRollout: [{
          module: "vantare.module.unknown",
          enabled_for_all: true,
        }],
      },
      {
        grants: [{
          capability: "vantare.module.engineer",
          valid_until: now.toISOString(),
          provider: "vantare",
          environment: "production",
          source_type: "support",
        }],
      },
    ]
  ) {
    const response = await handleNativeLicenseRequest(
      request(),
      deps({
        load: () =>
          Promise.resolve({ accountId, deviceMatches: true, ...invalid }),
      }),
    );
    assert(response.status === 409);
  }
  const response = await handleNativeLicenseRequest(
    request(),
    deps({
      load: () =>
        Promise.resolve({
          accountId,
          deviceMatches: true,
          grants: [],
          operationalAssignments: state.operationalAssignments,
        }),
    }),
  );
  assert(response.status === 200);
  const result = await response.json();
  assert(result.credential.claims.capabilities.length === 1);
  assert(
    result.credential.claims.capabilities[0].key ===
      "vantare.operational.owner",
  );
});

Deno.test("disabled rollout adds nothing and overlaps are deduplicated", async () => {
  for (const enabled of [false, true]) {
    const response = await handleNativeLicenseRequest(
      request(),
      deps({
        load: () =>
          Promise.resolve({
            accountId,
            deviceMatches: true,
            grants: [{
              capability: "vantare.module.strategy",
              valid_until: null,
              provider: "vantare",
              environment: "production",
              source_type: "support",
            }],
            moduleRollout: [{
              module: "vantare.module.strategy",
              enabled_for_all: enabled,
            }, { module: "vantare.module.analysis", enabled_for_all: false }],
          }),
      }),
    );
    assert(response.status === 200);
    const result = await response.json();
    assert(result.credential.claims.capabilities.length === 1);
  }
});

Deno.test("credential loader reads rollout with admin and propagates query failures", async () => {
  for (const fail of [false, true]) {
    const queried: string[] = [];
    const admin = {
      from(table: string) {
        queried.push(table);
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () =>
            Promise.resolve({
              data: { fingerprint_hash: fingerprint },
              error: null,
            }),
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve(resolve({
              data: table === "module_rollout"
                ? [{ module: "vantare.module.calendar", enabled_for_all: true }]
                : [],
              error: fail && table === "module_rollout"
                ? new Error("rollout unavailable")
                : null,
            }));
          },
        };
        return query;
      },
    } as unknown as Parameters<typeof loadCredentialAccount>[0];
    let rejected = false;
    try {
      const loaded = await loadCredentialAccount(admin, accountId, fingerprint);
      assert(loaded.moduleRollout?.[0].module === "vantare.module.calendar");
      assert(loaded.deviceMatches);
    } catch {
      rejected = true;
    }
    assert(rejected === fail);
    assert(queried.includes("module_rollout"));
  }
});

Deno.test("legacy Wails credential omits native modules from account and global rollout", async () => {
  const moduleState = {
    accountId,
    deviceMatches: true,
    grants: [{
      capability: "vantare.module.engineer",
      valid_until: null,
      provider: "vantare",
      environment: "production",
      source_type: "support",
    }],
    moduleRollout: [{
      module: "vantare.module.strategy",
      enabled_for_all: true,
    }],
  };
  const response = await handleLicenseCredentialRequest(
    new Request("https://local.invalid/license-credential", {
      method: "POST",
      headers: {
        Authorization: "Bearer fixture",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ deviceFingerprint: fingerprint }),
    }),
    {
      environment: "production",
      now: () => now,
      store: { load: () => Promise.resolve(moduleState) },
      sign: deps().sign,
    },
  );
  assert(response.status === 200);
  const result = await response.json();
  assert(result.credential.claims.capabilities.length === 0);
});
