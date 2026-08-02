import {
  CREDENTIAL_ALGORITHM,
  CREDENTIAL_ISSUER,
  handleLicenseCredentialRequest,
  normalizeGrants,
  signCredential,
} from "./index.ts";

const userId = "00000000-0000-4000-8000-000000000073";
const fingerprint = "a".repeat(64);
const auth =
  async () => ({ ok: true, token: "jwt", userId, email: null } as const);
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
  const request = new Request("http://local", {
    method: "POST",
    body: JSON.stringify({ deviceFingerprint: fingerprint }),
  });
  const response = await handleLicenseCredentialRequest(request, {
    requireAuth: auth,
    environment: "production",
    now: () => new Date("2026-08-02T12:00:00.000Z"),
    store: {
      load: async () => ({
        deviceMatches: true,
        grants: [
          productionGrant(
            "vantare.plan.pro",
            "2026-09-02T12:00:00.000Z",
          ),
          productionGrant("vantare.edition.launch_v1", null, "order"),
          productionGrant("vantare.channel.testers", null, "benefit_grant"),
        ],
      }),
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
    credential.claims.subject !== userId ||
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
    new Request("http://local", {
      method: "POST",
      body: JSON.stringify({ deviceFingerprint: fingerprint }),
    }),
    {
      requireAuth: auth,
      environment: "production",
      store: { load: async () => ({ deviceMatches: false, grants: [] }) },
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

Deno.test("normalization rejects sandbox, legacy, and support grants", () => {
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
    new Request("http://local", {
      method: "POST",
      body: JSON.stringify({ deviceFingerprint: fingerprint }),
    }),
    {
      requireAuth: auth,
      environment: "production",
      now: () => new Date("2026-08-02T12:00:00.000Z"),
      store: {
        load: async () => ({
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
    new Request("http://local", {
      method: "POST",
      body: JSON.stringify({ deviceFingerprint: fingerprint, userId }),
    }),
    { requireAuth: auth },
  );
  if (response.status !== 400) throw new Error(`status=${response.status}`);
});
