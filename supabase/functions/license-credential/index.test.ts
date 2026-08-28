import {
  CREDENTIAL_ALGORITHM,
  CREDENTIAL_ISSUER,
  CredentialAuthError,
  handleLicenseCredentialRequest,
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

Deno.test("credential request signs exact independent capabilities without PII", async () => {
  const keys = await crypto.subtle.generateKey(
    "Ed25519",
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const request = credentialRequest({ deviceFingerprint: fingerprint });
  const response = await handleLicenseCredentialRequest(request, {
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
  const response = await handleLicenseCredentialRequest(
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

Deno.test("recovery capability is online-only and never enters the envelope", async () => {
  const keys = await crypto.subtle.generateKey(
    "Ed25519",
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const response = await handleLicenseCredentialRequest(
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
    body.credential.claims.capabilities.length !== 0 ||
    body.online_capabilities.join(",") !== "vantare.plan.pro"
  ) {
    throw new Error(`recovery leaked offline: ${JSON.stringify(body)}`);
  }
});

Deno.test("credential request rejects arbitrary identity and device fields", async () => {
  const response = await handleLicenseCredentialRequest(
    credentialRequest({ deviceFingerprint: fingerprint, accountId }),
  );
  if (response.status !== 400) throw new Error(`status=${response.status}`);
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
  const response = await handleLicenseCredentialRequest(
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

Deno.test("credential request requires a bearer before resolving an account", async () => {
  const response = await handleLicenseCredentialRequest(
    new Request("http://local", {
      method: "POST",
      body: JSON.stringify({ deviceFingerprint: fingerprint }),
    }),
  );
  const body = await response.json();
  if (response.status !== 401 || body.error !== "unauthorized") {
    throw new Error(JSON.stringify(body));
  }
});

Deno.test("credential request rejects a non-UUID account returned by the RPC", async () => {
  const response = await handleLicenseCredentialRequest(
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

Deno.test("TPA rejection stays HTTP 401 instead of becoming availability failure", async () => {
  const response = await handleLicenseCredentialRequest(
    credentialRequest({ deviceFingerprint: fingerprint }),
    {
      environment: "production",
      store: {
        load: () => Promise.reject(new CredentialAuthError()),
      },
    },
  );
  const body = await response.json();
  if (response.status !== 401 || body.error !== "unauthorized") {
    throw new Error(JSON.stringify(body));
  }
});

Deno.test("PostgREST auth status is classified as a credential rejection", () => {
  if (!isCredentialAuthFailure(403, { code: "42501" })) {
    throw new Error("a role rejection must stay an authentication failure");
  }
  if (!isCredentialAuthFailure(401, { message: "Invalid JWT" })) {
    throw new Error("a gateway JWT rejection must stay an authentication failure");
  }
});

Deno.test("generic credential store failure stays HTTP 503", async () => {
  const response = await handleLicenseCredentialRequest(
    credentialRequest({ deviceFingerprint: fingerprint }),
    {
      environment: "production",
      store: {
        load: () => Promise.reject(new Error("db down")),
      },
    },
  );
  const body = await response.json();
  if (response.status !== 503 || body.error !== "credential_state_unavailable") {
    throw new Error(JSON.stringify(body));
  }
});

Deno.test("license credential config delegates Clerk JWT validation to PostgREST TPA", async () => {
  const config = await Deno.readTextFile(
    new URL("../../config.toml", import.meta.url),
  );
  if (
    !/\[functions\.license-credential\]\s+verify_jwt\s*=\s*false/.test(
      config,
    )
  ) {
    throw new Error("license-credential must use the PostgREST TPA boundary");
  }
});
