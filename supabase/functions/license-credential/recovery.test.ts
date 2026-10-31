// ADR 0102 / #1814: recovery uses the existing v1 temporal authority.
import { issueCredential, normalizeGrants, signCredential } from "../_shared/license-credential.ts";
import { deriveSubscriptionTransition, mergeRecoveryCycle } from "../billing-webhook/subscription-lifecycle.ts";
import fixture from "./fixtures/recovery-v1.json" with { type: "json" };

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(JSON.stringify({ actual, expected }));
}
const start = new Date(fixture.credential.claims.issued_at);
const until = fixture.recovery_until;
const keys = ["vantare.channel.nightly", "vantare.plan.pro"];
const recovery = (capability: string, valid_until: string | null = until) => ({
  capability, valid_until, provider: "vantare", environment: "production", source_type: "subscription_recovery",
});
const paid = (capability: string, valid_until: string) => ({
  capability, valid_until, provider: "polar", environment: "production", source_type: "subscription",
});
const grants = keys.map((key) => ({ key, paid_through: until }));

Deno.test("Pro/Plus recovery before, at and after the original deadline", () => {
  for (const delta of [-1, 0, 1]) {
    equal(normalizeGrants(keys.map((key) => recovery(key)), new Date(Date.parse(until) + delta), "production"),
      { ok: true, grants: delta < 0 ? grants : [], onlineCapabilities: [] });
  }
  for (const invalid of [null, "bad-date"]) {
    equal(normalizeGrants([recovery(keys[1], invalid)], start, "production"), { ok: false });
  }
});

Deno.test("renewal/replay keeps original recovery; longer payment wins in either order", () => {
  const previous = { status: "active", paidThrough: "2026-10-30T12:00:00.000Z" };
  const transition = deriveSubscriptionTransition({ status: "past_due", cancelAtPeriodEnd: false,
    currentPeriodEnd: null, remoteModifiedAt: fixture.first_failure_at, previous, now: start });
  if (transition.recovery.action !== "open") throw new Error("recovery not opened");
  const original = mergeRecoveryCycle(null, transition.recovery);
  equal(original.recoveryUntil, until);
  const retry = mergeRecoveryCycle(original, { cyclePaidThrough: previous.paidThrough, failureAt: "2026-11-02T12:00:00.000Z" });
  equal(retry, original);
  for (const now of [start, new Date("2026-11-02T12:00:00.000Z")]) {
    equal(normalizeGrants(keys.map((key) => recovery(key, retry.recoveryUntil)), now, "production"),
      { ok: true, grants, onlineCapabilities: [] });
  }
  for (const paidUntil of ["2026-11-02T12:00:00.000Z", "2026-12-01T12:00:00.000Z"]) {
    const expected = paidUntil > until ? paidUntil : until;
    for (const rows of [[recovery(keys[1]), paid(keys[1], paidUntil)], [paid(keys[1], paidUntil), recovery(keys[1])]]) {
      equal(normalizeGrants(rows, start, "production"), { ok: true,
        grants: [{ key: keys[1], paid_through: expected }], onlineCapabilities: [] });
    }
  }
});

Deno.test("payment closes recovery; effective refund exclusion preserves independent rights", () => {
  const later = "2026-12-01T12:00:00.000Z";
  const transition = deriveSubscriptionTransition({ status: "active", cancelAtPeriodEnd: false,
    currentPeriodEnd: later, remoteModifiedAt: start.toISOString(), previous: { status: "past_due", paidThrough: start.toISOString() }, now: start });
  equal(transition.recovery, { action: "close" });
  const independent = { capability: "vantare.edition.launch_v1", valid_until: null, provider: "polar", environment: "production", source_type: "order" };
  const launch = { key: independent.capability, perpetual: true, scope_version: "launch_v1" };
  equal(normalizeGrants([paid(keys[1], transition.commercialGrant.validUntil!), independent], start, "production"),
    { ok: true, grants: [launch, { key: keys[1], paid_through: later }], onlineCapabilities: [] });
  // Effective-view fixture: SQL excluded the refunded source and its recovery.
  // The unchanged commercial LF/CRLF gate separately verifies SQL/source isolation.
  equal(normalizeGrants([independent], start, "production"), { ok: true, grants: [launch], onlineCapabilities: [] });
});

Deno.test("server issues the recovery fixture consumed by the installed Rust v1 verifier", async () => {
  // Public deterministic TEST seed 0x42; never a production key/trust root.
  const pkcs8 = new Uint8Array([0x30,0x2e,0x02,0x01,0x00,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x04,0x22,0x04,0x20, ...new Uint8Array(32).fill(0x42)]);
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, "Ed25519", false, ["sign"]);
  // First issuance has only 48h left; renewal has only 24h left.
  for (const expected of [fixture.credential, fixture.renewed_credential]) {
    const response = await issueCredential({ accountId: expected.claims.subject, deviceMatches: true,
      grants: keys.map((key) => recovery(key)) }, expected.claims.device_fingerprint, "production", {
      now: () => new Date(expected.claims.issued_at), sign: (claims) => signCredential(claims, expected.key_id, privateKey),
    });
    equal(response.status, 200);
    equal(await response.json(), { credential: expected, online_capabilities: [] });
  }
});
