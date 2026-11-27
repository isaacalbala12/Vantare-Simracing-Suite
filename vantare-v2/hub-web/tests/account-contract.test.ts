import { describe, expect, it } from "vitest";
import { accountLimits } from "../src/contract/generated/account";
import corpus from "../src/contract/generated/corpus/account.json";
import { isAccount } from "../src/contract/modules/account";
import { isHostMessage, isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

const envelope = (request: unknown) => ({ kind: "request", id: 1, request });
const sample = corpus.host.find((v) => v.kind === "response");
if (!sample?.result) throw new Error("Missing account corpus");
const view = sample.result.value;
describe("closed account contract", () => {
  it("validates every sample serialized by Rust", () => {
    for (const value of corpus.ui) expect(isUiMessage(value)).toBe(true);
    for (const value of corpus.host) expect(isHostMessage(value)).toBe(true);
  });
  it("rejects renderer URLs, tokens, arbitrary destinations and malformed credentials", () => {
    for (const request of [
      { method: "account.begin", url: "https://other.invalid" },
      { method: "account.portal", page: "https://other.invalid" },
      { method: "account.purchase", product: "arbitrary" },
      { method: "account.email", action: { action: "verify", code: "12345" } },
      {
        method: "account.email",
        action: { action: "verify", code: "１２３４５６" },
      },
      {
        method: "account.email",
        action: { action: "verify", code: "123456", token: "forbidden" },
      },
      {
        method: "account.email",
        action: {
          action: "begin",
          mode: "signInPassword",
          email: "qa@example.invalid",
          password: "",
        },
      },
      {
        method: "account.email",
        action: {
          action: "begin",
          mode: "signInCode",
          email: "invalid",
          password: "",
        },
      },
      {
        method: "account.email",
        action: {
          action: "begin",
          mode: "signInPassword",
          email: "qa@example.invalid",
          password: "x".repeat(accountLimits.password + 1),
        },
      },
      {
        method: "account.email",
        action: { action: "reset", password: "new", signOutOthers: "yes" },
      },
      { method: "account.get", code: "forbidden" },
    ])
      expect(isUiMessage(envelope(request))).toBe(false);
  });
  it("rejects secret fields, URL messages and unbounded or external photos", () => {
    expect(isAccount(view)).toBe(true);
    for (const value of [
      { ...view, token: "forbidden" },
      { ...view, error: "https://issuer.invalid/?code=private" },
      { ...view, photo: "https://photo.invalid" },
      { ...view, name: "x".repeat(accountLimits.name + 1) },
      {
        ...view,
        photo: `data:image/jpeg;base64,/9j/${"A".repeat(accountLimits.photoBase64)}`,
      },
      {
        ...view,
        email: {
          mode: "signInCode",
          stage: "code",
          restarted: false,
          retryAfterSeconds: accountLimits.retryAfterSeconds + 1,
          message: "",
        },
      },
      { ...view, plan: { kind: "verified", policy: { revision: 1 } } },
    ])
      expect(isAccount(value)).toBe(false);
  });
  it("simulates stage-specific email and logout only with explicit intentions", () => {
    const host = createMockHost("acceso-reposo");
    expect(
      host({
        kind: "request",
        id: 1,
        request: {
          method: "account.email",
          action: { action: "verify", code: "123456" },
        },
      }),
    ).toMatchObject({ kind: "failure", error: { kind: "accountInvalid" } });
    expect(
      host({
        kind: "request",
        id: 2,
        request: {
          method: "account.email",
          action: { action: "open", mode: "signInCode" },
        },
      }),
    ).toMatchObject({
      kind: "response",
      result: { value: { gate: "email", email: { stage: "form" } } },
    });
    expect(
      host({
        kind: "request",
        id: 3,
        request: {
          method: "account.email",
          action: {
            action: "begin",
            mode: "signInCode",
            email: "qa@example.invalid",
            password: "",
          },
        },
      }),
    ).toMatchObject({
      kind: "response",
      result: { value: { email: { stage: "code" } } },
    });
    expect(
      host({
        kind: "request",
        id: 4,
        request: { method: "account.email", action: { action: "finish" } },
      }),
    ).toMatchObject({ kind: "failure", error: { kind: "accountInvalid" } });
    expect(
      host({ kind: "request", id: 5, request: { method: "account.logout" } }),
    ).toMatchObject({
      kind: "response",
      result: { value: { session: "signedOut", email: null } },
    });
  });
});

it("accepts the hostile profile name sanitized by Rust in the shared corpus", () => {
  const sample = corpus.host.find(
    (value) =>
      value.kind === "response" &&
      value.result?.method === "account.get" &&
      value.result.value.name === "Pilot qa",
  );
  expect(sample).toBeDefined();
  expect(isHostMessage(sample)).toBe(true);
});

it("does not let a signed-out mock bypass access with account.back", () => {
  const host = createMockHost("acceso-base");
  expect(host(envelope({ method: "account.back" }))).toMatchObject({
    kind: "failure",
    error: { kind: "denied" },
  });
  const reply = host(envelope({ method: "account.get" }));
  expect(reply).toMatchObject({
    kind: "response",
    result: {
      method: "account.get",
      value: { gate: "choose", session: "signedOut" },
    },
  });
});
it("lets a known mock session return only from its manual chooser", () => {
  const host = createMockHost("visual-dark:ajustes-con-diseno");
  expect(host(envelope({ method: "account.back" }))).toMatchObject({
    kind: "failure",
    error: { kind: "denied" },
  });
  host(envelope({ method: "account.choose" }));
  expect(host(envelope({ method: "account.back" }))).toMatchObject({
    kind: "response",
    result: {
      method: "account.back",
      value: { gate: "none", session: "signedIn" },
    },
  });
});
describe("license view (v71)", () => {
  const licensed = corpus.host.find(
    (v) => v.kind === "response" && v.result?.method === "account.check",
  )?.result?.value;
  if (!licensed?.license) throw new Error("Missing licensed account corpus");
  const withLicense = (license: unknown, extra: object = {}) => ({
    ...licensed,
    ...extra,
    license,
  });
  it("accepts the host sample and every allowed shape", () => {
    expect(isAccount(licensed)).toBe(true);
    expect(isAccount(withLicense(null))).toBe(true);
    expect(isAccount(withLicense(null, { verified: false }))).toBe(true);
    for (const license of [
      { tester: false, status: "active", untilMs: null },
      { tester: true, status: "active", untilMs: 0 },
      { tester: true, status: "expiring", untilMs: Number.MAX_SAFE_INTEGER },
      { tester: true, status: "grace", untilMs: 1_796_896_800_000 },
    ])
      expect(isAccount(withLicense(license))).toBe(true);
  });
  it("rejects a missing or extra key, an unknown status and a bad date", () => {
    const { license: _drop, ...missing } = licensed;
    expect(isAccount(missing)).toBe(false);
    expect(isAccount({ ...licensed, licence: null })).toBe(false);
    const good = { tester: true, status: "active", untilMs: 1 };
    for (const license of [
      { tester: true, status: "active" },
      { ...good, role: "owner" },
      { ...good, tester: "yes" },
      { ...good, status: "expired" },
      { ...good, status: "Active" },
      { ...good, untilMs: -1 },
      { ...good, untilMs: 1.5 },
      { ...good, untilMs: Number.MAX_SAFE_INTEGER + 1 },
      { ...good, untilMs: "1" },
      { tester: true, status: "expiring", untilMs: null },
      { tester: true, status: "grace", untilMs: null },
      "active",
      [],
    ])
      expect(isAccount(withLicense(license)), JSON.stringify(license)).toBe(
        false,
      );
  });
  it("rejects a license on an unverified or blocked account", () => {
    expect(isAccount(withLicense(licensed.license, { verified: false }))).toBe(
      false,
    );
    expect(isAccount(withLicense(licensed.license, { blocked: true }))).toBe(
      false,
    );
  });
});
