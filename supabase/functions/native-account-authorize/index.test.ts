import {
  type AuthorizeDeps,
  handleNativeAccountAuthorize,
  signDataToken,
} from "./index.ts";
import {
  account,
  assert,
  authDeps,
  claims,
  config,
  now,
  request,
  subject,
  user,
} from "./testdata/auth.ts";

const signing = {
  secret: "test-only-local-signing-secret-at-least-32-bytes",
  supabaseUrl: "https://supabase.example.invalid",
};
function deps(overrides: AuthorizeDeps = {}): AuthorizeDeps {
  return {
    ...authDeps(),
    signing,
    resolve: (issuer, sub) => {
      assert(issuer === config.issuer && sub === subject);
      return Promise.resolve(account);
    },
    ...overrides,
  };
}

Deno.test("data authorization signs actual HS256, internal UUID and bounded expiry; no apikey", async () => {
  const response = await handleNativeAccountAuthorize(
    request({ version: 1 }),
    deps(),
  );
  assert(
    response.status === 200 &&
      response.headers.get("Cache-Control") === "no-store",
  );
  const result = await response.json();
  assert(
    Object.keys(result).sort().join() ===
      "account_id,data_access_token,expires_at,version",
  );
  assert(
    result.account_id === account && result.version === 1 &&
      result.expires_at === now.getTime() / 1000 + 300,
  );
  const [header, payload, signature] = result.data_access_token.split(".");
  const decode = (value: string) =>
    Uint8Array.from(
      atob(value.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
  const tokenClaims = JSON.parse(new TextDecoder().decode(decode(payload)));
  assert(
    tokenClaims.sub === account && tokenClaims.role === "authenticated" &&
      tokenClaims.aud === "authenticated",
  );
  assert(
    tokenClaims.iss === `${signing.supabaseUrl}/auth/v1` &&
      tokenClaims.exp - tokenClaims.iat === 300,
  );
  assert(!payload.includes(subject));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signing.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  assert(
    await crypto.subtle.verify(
      "HMAC",
      key,
      decode(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    ),
  );
  assert(
    !await crypto.subtle.verify(
      "HMAC",
      key,
      decode(signature),
      new TextEncoder().encode(`${header}.${payload}tampered`),
    ),
  );
});

Deno.test("data token never outlives verified OAuth", async () => {
  const signed = await signDataToken(
    account,
    now,
    now.getTime() / 1000 + 12,
    signing,
  );
  assert(signed.expires === now.getTime() / 1000 + 12);
});

for (
  const [name, body, headers, status] of [
    ["anonymous", { version: 1 }, { Authorization: "" }, 401],
    ["empty bearer", { version: 1 }, { Authorization: "Bearer " }, 401],
    ["oversized bearer", { version: 1 }, {
      Authorization: `Bearer ${"a".repeat(16385)}`,
    }, 413],
    ["extra identity", { version: 1, account_id: account }, {}, 400],
    ["wrong version", { version: 2 }, {}, 400],
    ["missing version", {}, {}, 400],
    ["array", [], {}, 400],
    ["null", null, {}, 400],
    ["content type", { version: 1 }, { "Content-Type": "text/plain" }, 400],
    ["declared oversized", { version: 1 }, { "Content-Length": "1025" }, 413],
  ] as const
) {
  Deno.test(`authorization rejects ${name} before privileged resolution`, async () => {
    const response = await handleNativeAccountAuthorize(
      request(body, headers),
      deps({
        resolve: () => {
          throw new Error("must not resolve");
        },
      }),
    );
    assert(response.status === status);
  });
}
for (
  const [name, verification, expected] of [
    ["inactive", { active: false }, 401],
    ["revoked", { ...claims, revoked: true }, 401],
    ["expired flag", { ...claims, expired: true }, 401],
    ["expired time", { ...claims, expiration: 1 }, 401],
    ["wrong client", { ...claims, client_id: "other" }, 401],
    ["session token", { ...claims, object: "session" }, 503],
    ["wrong subject", { ...claims, subject: "machine_123" }, 401],
    ["missing scope", { ...claims, scopes: ["openid"] }, 401],
    ["unknown shape", {}, 503],
    ["null expiry", { ...claims, expiration: null }, 503],
  ] as const
) {
  Deno.test(`authorization fails closed on OAuth ${name}`, async () => {
    let resolved = false;
    const response = await handleNativeAccountAuthorize(
      request({ version: 1 }),
      deps({
        fetch: () => Promise.resolve(Response.json(verification)),
        resolve: () => {
          resolved = true;
          return Promise.resolve(account);
        },
      }),
    );
    assert(response.status === expected && !resolved);
    const value = JSON.stringify(await response.json());
    assert(
      !value.includes(account) && !value.includes("test-oauth") &&
        !value.includes(config.secretKey),
    );
  });
}
for (const flag of ["banned", "locked"]) {
  Deno.test(`blocked Clerk account (${flag}) is forbidden`, async () => {
    const response = await handleNativeAccountAuthorize(
      request({ version: 1 }),
      deps({
        fetch: (url) =>
          Promise.resolve(Response.json(
            String(url).endsWith("verify") ? claims : { ...user, [flag]: true },
          )),
        resolve: () => {
          throw new Error("must not bootstrap blocked account");
        },
      }),
    );
    assert(response.status === 403);
  });
}
for (
  const [upstream, expected] of [
    [400, 401],
    [404, 401],
    [401, 503],
    [403, 503],
    [429, 429],
    [500, 503],
  ]
) {
  Deno.test(`OAuth upstream ${upstream} maps to ${expected}`, async () => {
    const response = await handleNativeAccountAuthorize(
      request({ version: 1 }),
      deps({
        fetch: () => Promise.resolve(new Response("", { status: upstream })),
      }),
    );
    assert(response.status === expected);
  });
}
Deno.test("received multibyte body and streaming limit are enforced", async () => {
  const chunks = new TextEncoder().encode(
    JSON.stringify({ version: 1, text: "é".repeat(600) }),
  );
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(chunks);
      controller.close();
    },
  });
  const response = await handleNativeAccountAuthorize(
    new Request("https://local.invalid", {
      method: "POST",
      headers: {
        Authorization: "Bearer test",
        "Content-Type": "application/json",
      },
      body: stream,
    }),
    deps(),
  );
  assert(response.status === 413);
});
Deno.test("missing signing key or invalid resolver UUID never emits token", async () => {
  for (
    const overrides of [{ signing: { ...signing, secret: "" } }, {
      resolve: () => Promise.resolve(subject),
    }]
  ) {
    const response = await handleNativeAccountAuthorize(
      request({ version: 1 }),
      deps(overrides),
    );
    assert(
      response.status === 503 &&
        !(await response.text()).includes("data_access_token"),
    );
  }
});
Deno.test("canonical issuer, no redirect and Clerk server secret are reused", async () => {
  const response = await handleNativeAccountAuthorize(
    request({ version: 1 }),
    deps({
      config: { ...config, issuer: `${config.issuer}/` },
      fetch: (url, init) => {
        assert(
          new Headers((init as RequestInit)?.headers).get("Authorization") ===
              `Bearer ${config.secretKey}` &&
            (init as RequestInit)?.redirect === "error",
        );
        assert((init as RequestInit)?.signal instanceof AbortSignal);
        return Promise.resolve(
          Response.json(String(url).endsWith("verify") ? claims : user),
        );
      },
    }),
  );
  assert(response.status === 200);
});
