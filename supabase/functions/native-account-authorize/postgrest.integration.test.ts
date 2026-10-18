import { testToken } from "./testdata/signing.ts";
// Optional, strictly loopback integration against a disposable migrated database.
// See README for fixture SQL. This key is public test data, never a project key.
import { handleNativeAccountAuthorize, signDataToken } from "./index.ts";
import { assert, config, subject, user } from "./testdata/auth.ts";

const account = "00000000-0000-4000-8000-000000001452";
const other = "00000000-0000-4000-8000-000000001453";
const localUrl = Deno.env.get("LOCAL_POSTGREST_URL");

Deno.test({
  name:
    "local PostgREST verifies issued JWT, executes tester RPC, enforces RLS and rejects anonymous/tampered/expired tokens",
  ignore: !localUrl,
  fn: async () => {
    assert(
      localUrl &&
        ["127.0.0.1", "localhost"].includes(new URL(localUrl).hostname),
      "integration only supports loopback",
    );
    const fixturePath = Deno.env.get("LOCAL_POSTGREST_PRIVATE_JWK_FILE");
    assert(
      fixturePath,
      "a generated TEST key file is required; configure its public JWK in PostgREST",
    );
    const testPrivateJwk = await Deno.readTextFile(fixturePath);
    const now = new Date();
    const serviceToken = await testToken(
      {
        role: "service_role",
        exp: Math.floor(now.getTime() / 1000) + 300,
      },
      { alg: "ES256", typ: "JWT", kid: JSON.parse(testPrivateJwk).kid },
      testPrivateJwk,
    );
    const call = (path: string, token: string | null, body?: unknown) =>
      fetch(`${localUrl}/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const response = await handleNativeAccountAuthorize(
      new Request("https://local.invalid/authorize", {
        method: "POST",
        headers: {
          Authorization: "Bearer fixture-oauth",
          "Content-Type": "application/json",
        },
        body: '{"version":1}',
      }),
      {
        config,
        now: () => now,
        signing: {
          privateJwk: testPrivateJwk,
          supabaseUrl: "http://127.0.0.1:54321",
        },
        fetch: (url) =>
          Promise.resolve(Response.json(
            String(url).endsWith("verify")
              ? {
                object: "clerk_idp_oauth_access_token",
                client_id: config.clientId,
                subject,
                scopes: ["openid", "profile"],
                revoked: false,
                expired: false,
                expiration: now.getTime() / 1000 + 3600,
              }
              : user,
          )),
        resolve: async (issuer, subject) => {
          const resolved = await call(
            "rpc/native_resolve_account",
            serviceToken,
            { issuer, subject },
          );
          assert(resolved.status === 200, "real resolver RPC rejected");
          return await resolved.json();
        },
      },
    );
    assert(response.status === 200);
    const authorized = await response.json();
    assert(
      authorized.account_id === account &&
        authorized.expires_at <= now.getTime() / 1000 + 300,
    );
    const token = authorized.data_access_token;
    const role = await call("rpc/testing_center_current_role", token, {});
    assert(
      role.status === 200 && await role.json() === "tester",
      "signed token not accepted by RPC",
    );
    // Existing SQL contract: 20260802180000 grants authenticated EXECUTE on a
    // SECURITY DEFINER wrapper; 20260802150000 permits a seeded active tester.
    // B03 changes its identity lookup to current_account(), not its grants.
    // Do not claim this legacy route is closed by the separate Edge admission.
    const direct = await call("rpc/testing_center_submit_report", token, {
      p_contract_version: "testing-center.v1",
      p_channel: "testers",
      p_action_text: "Open Hub",
      p_expected_text: "Hub appears",
      p_observed_text: "Hub hangs",
      p_context_text: null,
      p_app_version: "0.1.0",
      p_os_family: "windows",
      p_os_version: "11",
      p_module: "hub",
      p_include_diagnostic: false,
      p_include_logs: false,
      p_diagnostic_payload: null,
      p_diagnostic_digest: null,
      p_idempotency_key: `integration-${crypto.randomUUID()}`,
    });
    assert(
      direct.status === 200,
      `legacy tester RPC returned ${direct.status}`,
    );
    const reports = await direct.json();
    assert(reports.length === 1 && typeof reports[0].report_id === "string");
    const reportPath = `testing_center_reports?report_id=eq.${
      encodeURIComponent(reports[0].report_id)
    }`;
    const ownReport = await call(reportPath, token);
    assert(
      ownReport.status === 200 && (await ownReport.json()).length === 1,
      "legacy report not visible to its reporter",
    );
    const reset = await call("rpc/reset_active_device", token, {
      device_fingerprint: "b".repeat(64),
    });
    assert(reset.status === 204, "own reset failed");
    const own = await call("profiles?select=id", token);
    assert(
      own.status === 200 && (await own.json()).length === 1,
      "own RLS profile missing",
    );
    const otherToken = await signDataToken(
      other,
      now,
      now.getTime() / 1000 + 300,
      { privateJwk: testPrivateJwk, supabaseUrl: "http://127.0.0.1:54321" },
      { issuer: config.issuer, subject },
    );
    const hiddenReport = await call(reportPath, otherToken.token);
    assert(
      hiddenReport.status === 200 && (await hiddenReport.json()).length === 0,
      "legacy report exposed to mismatched identity",
    );
    const hidden = await call("profiles?select=id", otherToken.token);
    assert(
      hidden.status === 200 && (await hidden.json()).length === 0,
      "RLS exposed another account profile",
    );
    const expired = await signDataToken(
      account,
      new Date(now.getTime() - 600000),
      now.getTime() / 1000 - 300,
      { privateJwk: testPrivateJwk, supabaseUrl: "http://127.0.0.1:54321" },
      { issuer: config.issuer, subject },
    );
    for (
      const bearer of [null, `${token.slice(0, -8)}tampered`, expired.token]
    ) {
      const denied = await call("rpc/testing_center_current_role", bearer, {});
      assert(denied.status === 401, `invalid bearer received ${denied.status}`);
      await denied.body?.cancel();
    }
  },
});
