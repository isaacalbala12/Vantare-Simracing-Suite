import {
  CREDENTIAL_ALGORITHM,
  CREDENTIAL_ISSUER,
  issueCredential,
  type CredentialDeps,
  isCredentialAuthFailure,
  normalizeGrants,
  normalizeOperationalAssignments,
  OPERATIONAL_LEASE_MS,
  signCredential,
} from "./index.ts";

const accountId = "00000000-0000-4000-8000-000000000073";
const fingerprint = "a".repeat(64);
const sessionToken = "clerk-session-token";
const credentialRequest = (body: Record<string, unknown>) =>
  new Request("http://local", {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify(body),
  });
const productionGrant = (
  capability: string,
  validUntil: string | null,
  sourceType = "subscription",
) => ({
  capability,
  valid_until: validUntil,
  provider: "polar",
  environment: "production",
  source_type: sourceType,
});

Deno.test("Founders is signed as its own perpetual order right, never as a subscription", () => {
  const now = new Date("2026-10-26T18:00:00Z");
  const result = normalizeGrants(
    [productionGrant("vantare.plan.founders", null, "order")],
    now,
    "production",
  );
  if (
    !result.ok ||
    JSON.stringify(result.grants) !==
      '[{"key":"vantare.plan.founders","perpetual":true}]'
  ) {
    throw new Error("Founders must retain an independent perpetual right");
  }
  for (
    const invalid of [
      productionGrant("vantare.plan.founders", null),
      productionGrant("vantare.plan.founders", "2027-01-01T00:00:00Z", "order"),
    ]
  ) {
    if (normalizeGrants([invalid], now, "production").ok) {
      throw new Error("Invalid Founders source or expiry accepted");
    }
  }
});

Deno.test("R4 Founders keeps perpetual Nightly only for its own paid order", () => {
  const now = new Date("2026-10-26T18:00:00Z");
  const founder = {
    ...productionGrant("vantare.plan.founders", null, "order"),
    source_id: "founder-order",
  };
  const nightly = {
    ...productionGrant("vantare.channel.nightly", null, "order"),
    source_id: "founder-order",
  };
  const result = normalizeGrants([founder, nightly], now, "production");
  if (
    !result.ok ||
    !result.grants.some((g) =>
      g.key === "vantare.channel.nightly" && g.perpetual
    )
  ) throw Error("Founder lost Nightly");
  if (
    normalizeGrants([nightly], now, "production").ok ||
    normalizeGrants(
      [founder, { ...nightly, source_id: "other-order" }],
      now,
      "production",
    ).ok
  ) throw Error("unbound perpetual Nightly accepted");
});

Deno.test("credential request signs exact independent capabilities without PII", async () => {
  const keys = await crypto.subtle.generateKey(
    "Ed25519",
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const request = credentialRequest({ deviceFingerprint: fingerprint });
  const response = await issueForFixture(request, {
    environment: "production",
    now: () => new Date("2026-08-02T12:00:00.000Z"),
    store: {
      load: async (token) => {
        if (token !== sessionToken) throw new Error("session token changed");
        return {
          accountId,
          deviceMatches: true,
          grants: [
            productionGrant(
              "vantare.plan.pro",
              "2026-09-02T12:00:00.000Z",
            ),
            productionGrant("vantare.edition.launch_v1", null, "order"),
            productionGrant("vantare.channel.testers", null, "benefit_grant"),
          ],
        };
      },
    },
    sign: (claims) => signCredential(claims, "test-key", keys.privateKey),
  });
  const body = await response.json();
  const credential = body.credential;
  if (
    response.status !== 200 ||
    credential.claims.issuer !== CREDENTIAL_ISSUER
  ) {
    throw new Error(JSON.stringify(body));
  }
  if (
    credential.claims.subject !== accountId ||
    credential.claims.email !== undefined
  ) {
    throw new Error("credential leaked or lost identity");
  }
  const payload = {
    version: credential.version,
    algorithm: credential.algorithm,
    key_id: credential.key_id,
    claims: credential.claims,
  };
  const valid = await crypto.subtle.verify(
    CREDENTIAL_ALGORITHM,
    keys.publicKey,
    Uint8Array.from(
      atob(
        credential.signature.replaceAll("-", "+").replaceAll("_", "/") +
          "==",
      ),
      (c) => c.charCodeAt(0),
    ),
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  if (!valid) throw new Error("credential signature is invalid");
  const keysInOrder = credential.claims.capabilities.map(
    (grant: { key: string }) => grant.key,
  ).join(",");
  if (
    keysInOrder !==
      "vantare.channel.testers,vantare.edition.launch_v1,vantare.plan.pro"
  ) throw new Error(keysInOrder);
});

Deno.test("credential request rejects a different active device", async () => {
  const response = await issueForFixture(
    credentialRequest({ deviceFingerprint: fingerprint }),
    {
      environment: "production",
      store: {
        load: async () => ({ accountId, deviceMatches: false, grants: [] }),
      },
    },
  );
  const body = await response.json();
  if (response.status !== 409 || body.error !== "device_limit") {
    throw new Error(JSON.stringify(body));
  }
});

Deno.test("normalization rejects an unbounded Pro grant and expired grants", () => {
  const now = new Date("2026-08-02T12:00:00.000Z");
  if (
    normalizeGrants(
      [productionGrant("vantare.plan.pro", null)],
      now,
      "production",
    ).ok
  ) throw new Error("unbounded Pro accepted");
  const result = normalizeGrants(
    [
      productionGrant("vantare.plan.pro", "2026-08-02T11:59:59.000Z"),
    ],
    now,
    "production",
  );
  if (!result.ok || result.grants.length !== 0) {
    throw new Error("expired grant survived");
  }
});

Deno.test("normalization rejects perpetual nightly and expiring Launch grants", () => {
  const now = new Date("2026-08-02T12:00:00.000Z");
  if (
    normalizeGrants(
      [
        productionGrant("vantare.channel.nightly", null, "benefit_grant"),
      ],
      now,
      "production",
    ).ok
  ) {
    throw new Error("perpetual Nightly accepted");
  }
  if (
    normalizeGrants(
      [
        productionGrant(
          "vantare.edition.launch_v1",
          "2027-08-02T12:00:00.000Z",
          "order",
        ),
      ],
      now,
      "production",
    ).ok
  ) {
    throw new Error("expiring Launch accepted");
  }
});

Deno.test("normalization keeps the latest paid-through instant", () => {
  const result = normalizeGrants(
    [
      productionGrant("vantare.plan.pro", "2026-09-02T12:00:00.000Z"),
      productionGrant("vantare.plan.pro", "2026-10-02T12:00:00.000+02:00"),
    ],
    new Date("2026-08-02T12:00:00.000Z"),
    "production",
  );
  if (
    !result.ok || result.grants.length !== 1 ||
    result.grants[0].paid_through !== "2026-10-02T10:00:00.000Z"
  ) {
    throw new Error(`unexpected normalized grant: ${JSON.stringify(result)}`);
  }
});

Deno.test("normalization rejects cross-environment and unsupported grants", () => {
  const now = new Date("2026-08-02T12:00:00.000Z");
  const future = "2026-09-02T12:00:00.000Z";
  const invalid = [
    { ...productionGrant("vantare.plan.pro", future), environment: "sandbox" },
    { ...productionGrant("vantare.plan.pro", future), provider: "legacy" },
    productionGrant("vantare.plan.pro", future, "support"),
  ];
  for (const grant of invalid) {
    if (normalizeGrants([grant], now, "production").ok) {
      throw new Error(`unsafe grant accepted: ${JSON.stringify(grant)}`);
    }
  }
});

Deno.test("ADR 0102 recovery enters the v1 signature with the original deadline", async () => {
  const keys = await crypto.subtle.generateKey(
    "Ed25519",
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const response = await issueForFixture(
    credentialRequest({ deviceFingerprint: fingerprint }),
    {
      environment: "production",
      now: () => new Date("2026-08-02T12:00:00.000Z"),
      store: {
        load: async () => ({
          accountId,
          deviceMatches: true,
          grants: [{
            ...productionGrant(
              "vantare.plan.pro",
              "2026-08-05T12:00:00.000Z",
              "subscription_recovery",
            ),
            provider: "vantare",
          }],
        }),
      },
      sign: (claims) => signCredential(claims, "test-key", keys.privateKey),
    },
  );
  const body = await response.json();
  if (
    response.status !== 200 ||
    JSON.stringify(body.credential.claims.capabilities) !==
      JSON.stringify([{ key: "vantare.plan.pro", paid_through: "2026-08-05T12:00:00.000Z" }]) ||
    body.online_capabilities.length !== 0
  ) {
    throw new Error(`recovery signature missing or unbounded: ${JSON.stringify(body)}`);
  }
});

Deno.test("classified legacy grants are retained for audit but issue no capability", () => {
  const result = normalizeGrants(
    [{
      ...productionGrant("beta_access", null),
      provider: "legacy",
      environment: "legacy",
      source_type: "legacy",
    }],
    new Date("2026-08-03T12:00:00.000Z"),
    "production",
  );
  if (!result.ok || result.grants.length !== 0) {
    throw new Error(`legacy authority leaked: ${JSON.stringify(result)}`);
  }
});

Deno.test("operational roles receive exact bounded offline leases", () => {
  const now = new Date("2026-08-03T12:00:00.000Z");
  const cases = [
    ["tester", "vantare.operational.tester"],
    ["nightly_tester", "vantare.operational.nightly_tester"],
    ["owner", "vantare.operational.owner"],
  ] as const;
  for (const [role, capability] of cases) {
    const result = normalizeOperationalAssignments(
      [{ role, expires_at: null, policy_version: 1 }],
      now,
    );
    if (!result.ok || result.grants.length !== 1) {
      throw new Error(`role rejected: ${role}`);
    }
    const expected = new Date(
      now.getTime() + OPERATIONAL_LEASE_MS[role],
    ).toISOString();
    if (
      result.grants[0].key !== capability ||
      result.grants[0].paid_through !== expected ||
      result.grants[0].perpetual !== undefined
    ) {
      throw new Error(`unexpected ${role} lease: ${JSON.stringify(result)}`);
    }
  }
});

Deno.test("operational assignment expiry caps its offline lease", () => {
  const result = normalizeOperationalAssignments(
    [{
      role: "owner",
      expires_at: "2026-08-04T12:00:00.000Z",
      policy_version: 1,
    }],
    new Date("2026-08-03T12:00:00.000Z"),
  );
  if (
    !result.ok ||
    result.grants[0]?.paid_through !== "2026-08-04T12:00:00.000Z"
  ) {
    throw new Error(
      `assignment expiry was not respected: ${JSON.stringify(result)}`,
    );
  }
});

Deno.test("expired operational assignments issue no capability", () => {
  const result = normalizeOperationalAssignments(
    [{
      role: "tester",
      expires_at: "2026-08-03T11:59:59.000Z",
      policy_version: 1,
    }],
    new Date("2026-08-03T12:00:00.000Z"),
  );
  if (!result.ok || result.grants.length !== 0) {
    throw new Error(`expired role survived: ${JSON.stringify(result)}`);
  }
});

Deno.test("unknown, duplicated, or future-policy operational roles fail closed", () => {
  const now = new Date("2026-08-03T12:00:00.000Z");
  const invalid = [
    [{ role: "staff", expires_at: null, policy_version: 1 }],
    [{ role: "tester", expires_at: null, policy_version: 2 }],
    [
      { role: "tester", expires_at: null, policy_version: 1 },
      { role: "owner", expires_at: null, policy_version: 1 },
    ],
  ];
  for (const rows of invalid) {
    if (normalizeOperationalAssignments(rows, now).ok) {
      throw new Error(
        `unsafe operational state accepted: ${JSON.stringify(rows)}`,
      );
    }
  }
});

Deno.test("credential request combines commercial and operational authorities without relabeling", async () => {
  const keys = await crypto.subtle.generateKey(
    "Ed25519",
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const response = await issueForFixture(
    credentialRequest({ deviceFingerprint: fingerprint }),
    {
      environment: "production",
      now: () => new Date("2026-08-03T12:00:00.000Z"),
      store: {
        load: async () => ({
          accountId,
          deviceMatches: true,
          grants: [
            productionGrant(
              "vantare.plan.pro",
              "2026-09-03T12:00:00.000Z",
            ),
          ],
          operationalAssignments: [{
            role: "nightly_tester",
            expires_at: null,
            policy_version: 1,
          }],
        }),
      },
      sign: (claims) => signCredential(claims, "test-key", keys.privateKey),
    },
  );
  const body = await response.json();
  const grants = body.credential?.claims?.capabilities ?? [];
  if (
    response.status !== 200 ||
    grants.map((grant: { key: string }) => grant.key).join(",") !==
      "vantare.operational.nightly_tester,vantare.plan.pro"
  ) {
    throw new Error(
      `authorities were mixed incorrectly: ${JSON.stringify(body)}`,
    );
  }
});

Deno.test("credential request rejects a non-UUID account returned by the RPC", async () => {
  const response = await issueForFixture(
    credentialRequest({ deviceFingerprint: fingerprint }),
    {
      environment: "production",
      store: {
        load: async () => ({
          accountId: "user_external_subject",
          deviceMatches: true,
          grants: [],
        }),
      },
    },
  );
  const body = await response.json();
  if (response.status !== 401 || body.error !== "invalid_account") {
    throw new Error(JSON.stringify(body));
  }
});

Deno.test("PostgREST auth status is classified as a credential rejection", () => {
  if (!isCredentialAuthFailure(403, { code: "42501" })) {
    throw new Error("a role rejection must stay an authentication failure");
  }
  if (!isCredentialAuthFailure(401, { message: "Invalid JWT" })) {
    throw new Error(
      "a gateway JWT rejection must stay an authentication failure",
    );
  }
});

Deno.test("retired endpoint remains reachable without gateway JWT verification", async () => {
  const config = await Deno.readTextFile(
    new URL("../../config.toml", import.meta.url),
  );
  if (
    !/\[functions\.license-credential\]\s+verify_jwt\s*=\s*false/.test(
      config,
    )
  ) {
    throw new Error("gateway must allow the tombstone to return 410");
  }
});

// These are shared-issuer tests. The legacy HTTP entrypoint is tested separately
// and never loads account state or signs, irrespective of the request body.
async function issueForFixture(_request: Request, deps: CredentialDeps = {}) {
  const loaded = await deps.store!.load(sessionToken, fingerprint, "production");
  return issueCredential(loaded, fingerprint, "production", deps);
}
