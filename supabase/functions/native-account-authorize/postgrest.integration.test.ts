// Optional, strictly loopback integration against a disposable migrated database.
// See README for fixture SQL. This key is public test data, never a project key.
import { handleNativeAccountAuthorize, signDataToken } from "./index.ts";
import { assert, config, subject, user } from "./testdata/auth.ts";

const key = "local-postgrest-test-only-signing-secret-1452";
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
    const now = new Date();
    const encode = (value: unknown) =>
      btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_")
        .replace(/=+$/, "");
    const input = `${encode({ alg: "HS256", typ: "JWT" })}.${
      encode({
        role: "service_role",
        exp: Math.floor(now.getTime() / 1000) + 300,
      })
    }`;
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(key),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        new TextEncoder().encode(input),
      ),
    );
    const serviceToken = `${input}.${
      btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_")
        .replace(/=+$/, "")
    }`;
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
        signing: { secret: key, supabaseUrl: localUrl },
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
    const submitted = await call("rpc/testing_center_submit_report", token, {
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
      submitted.status === 200,
      `report submission failed with HTTP ${submitted.status}`,
    );
    const report = (await submitted.json())[0];
    const own = await call(
      `testing_center_reports?report_id=eq.${
        encodeURIComponent(report.report_id)
      }`,
      token,
    );
    assert(
      own.status === 200 && (await own.json()).length === 1,
      "own RLS report missing",
    );
    const otherToken = await signDataToken(
      other,
      now,
      now.getTime() / 1000 + 300,
      { secret: key, supabaseUrl: localUrl },
    );
    const hidden = await call(
      `testing_center_reports?report_id=eq.${
        encodeURIComponent(report.report_id)
      }`,
      otherToken.token,
    );
    assert(
      hidden.status === 200 && (await hidden.json()).length === 0,
      "RLS exposed another account report",
    );
    const expired = await signDataToken(
      account,
      new Date(now.getTime() - 600000),
      now.getTime() / 1000 - 300,
      { secret: key, supabaseUrl: localUrl },
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
