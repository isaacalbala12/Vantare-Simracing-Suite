import { type ConsentDeps, handleNativeMailConsent } from "./index.ts";
import {
  account,
  assert,
  authDeps,
  request,
  user,
} from "../native-account-authorize/testdata/auth.ts";
const verified = {
  ...user,
  email_addresses: [
    ...user.email_addresses.map((e) => ({
      ...e,
      verification: { status: "verified" },
    })),
    {
      id: "other",
      email_address: "not-primary@example.invalid",
      verification: { status: "verified" },
    },
  ],
};
const body = {
  version: 1,
  action: "set",
  consent: true,
  locale: "pt-BR",
  source: "onboarding",
};
function deps(overrides: ConsentDeps = {}): ConsentDeps {
  const auth = authDeps();
  return {
    ...auth,
    fetch: async (url, init) =>
      String(url).endsWith("/verify")
        ? await auth.fetch!(url, init)
        : Response.json(verified),
    resolve: () => Promise.resolve(account),
    rpc: (name, p) => {
      assert(
        name === "mail_consent_execute" && p.p_account === account &&
          p.p_email === "tester@example.invalid",
      );
      return Promise.resolve({
        consent: p.p_consent ?? false,
        locale: p.p_locale ?? null,
        revision: 1,
      });
    },
    ...overrides,
  };
}
Deno.test("native consent derives primary verified email and UUID on server, records one permission", async () => {
  const response = await handleNativeMailConsent(request(body), deps());
  const result = await response.json();
  assert(
    response.status === 200 && result.consent === true &&
      result.locale === "pt-BR" &&
      !JSON.stringify(result).includes("example.invalid"),
  );
  assert(
    (await handleNativeMailConsent(
      request({ version: 1, action: "get" }),
      deps(),
    )).status === 200,
  );
});
Deno.test("native consent rejects user-picked address/account/evidence and invalid locale before SQL", async () => {
  for (
    const extra of [
      { email: "victim@example.invalid" },
      { account_id: account },
      { evidence: "forged" },
      { locale: "pt-PT" },
      { source: "arbitrary" },
      { consent: undefined },
    ]
  ) {
    const response = await handleNativeMailConsent(
      request({ ...body, ...extra }),
      deps({
        rpc: () => {
          throw new Error("unexpected SQL");
        },
      }),
    );
    assert(response.status === 400);
  }
});
Deno.test("native consent refuses unverified/blocked/wrong primary profiles and handles tombstone/rate limit", async () => {
  for (
    const profile of [{ ...verified, email_addresses: user.email_addresses }, {
      ...verified,
      banned: true,
    }, { ...verified, primary_email_address_id: "missing" }]
  ) {
    const auth = authDeps();
    const response = await handleNativeMailConsent(
      request(body),
      deps({
        fetch: async (url, init) =>
          String(url).endsWith("/verify")
            ? await auth.fetch!(url, init)
            : Response.json(profile),
        rpc: () => {
          throw new Error("unexpected SQL");
        },
      }),
    );
    assert(response.status === 403);
  }
  assert(
    (await handleNativeMailConsent(
      request(body),
      deps({ rpc: () => Promise.reject(new Error("account_deleted")) }),
    )).status === 401,
  );
  assert(
    (await handleNativeMailConsent(
      request(body),
      deps({ rpc: () => Promise.resolve({ rate_limited: true }) }),
    )).status === 429,
  );
});
