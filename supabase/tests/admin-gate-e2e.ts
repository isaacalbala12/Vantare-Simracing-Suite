// Only the disposable PostgreSQL command supplied by run-commercial-local.py.
// Clerk/JWKS are fixtures; JWT signatures, SQL gate, owner and actions are real.
import {
  type AdminDeps,
  handleNativeAdmin,
} from "../functions/native-admin/index.ts";
import { createLocalOAuthVerifier } from "../functions/native-admin/local-auth.ts";
import {
  adminClient,
  publicKey,
  signedJwt,
} from "../functions/native-admin/jwt-fixture.ts";
import {
  account,
  assert,
  authDeps,
  claims,
  config,
  request,
  subject,
  user,
} from "../functions/native-account-authorize/testdata/auth.ts";

const command: { program: string; args: string[] } = JSON.parse(Deno.args[0]);
assert(
  command.args.includes("127.0.0.1"),
  "disposable loopback connection required",
);
async function sql(query: string): Promise<string> {
  const result = await new Deno.Command(command.program, {
    args: [...command.args, "-q", "-c", "set statement_timeout='5s'; " + query],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    throw new Error(
      "disposable SQL fixture failed: " +
        new TextDecoder().decode(result.stderr),
    );
  }
  return new TextDecoder().decode(result.stdout).trim();
}
const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
async function fixture(active: boolean) {
  await sql(
    `insert into public.profiles(id) values(${
      literal(account)
    }) on conflict do nothing;
    insert into private.clerk_issuers(issuer,authorized_parties,enabled)
      values(${
      literal(config.issuer)
    },array['https://app.invalid'],true) on conflict do nothing;
    insert into public.account_identities(issuer,subject,account_id)
      values(${literal(config.issuer)},${literal(subject)},${
      literal(account)
    }) on conflict do nothing;
    select * from public.operational_access_set(${
      literal(account)
    },'owner','grant',
      'test:r10-e2e','Admin gate test','test:r10-e2e',null);
    delete from private.native_admin_gate_rate;`,
  );
  const calls = { rpc: 0, clerk: 0, jwks: 0 };
  const deps: AdminDeps = {
    ...authDeps(),
    adminAuth: { enabled: active, clientId: adminClient },
    verifyLocal: createLocalOAuthVerifier(),
    environment: "sandbox",
    gateRpc: {
      rpc: async (name) => {
        assert(name === "native_admin_gate");
        calls.rpc++;
        return {
          data: JSON.parse(
            await sql(
              "set role service_role; select to_json(public.native_admin_gate());",
            ),
          ),
          error: null,
        };
      },
    },
    fetch: (input, init) => {
      if (String(input).endsWith("/.well-known/jwks.json")) {
        calls.jwks++;
        return Promise.resolve(Response.json({ keys: [publicKey] }));
      }
      calls.clerk++;
      if (String(input).endsWith("/verify")) {
        const token = JSON.parse(String(init?.body)).access_token;
        if (!active && token !== "opaque-hub-fixture") {
          return Promise.resolve(new Response(null, { status: 400 }));
        }
        return Promise.resolve(
          Response.json({
            ...claims,
            client_id: active ? adminClient : config.clientId,
          }),
        );
      }
      return Promise.resolve(Response.json(user));
    },
    resolve: async (issuer, verifiedSubject) =>
      JSON.parse(
        await sql(`set role service_role;
      select to_json(public.native_resolve_account(${literal(issuer)},${
          literal(verifiedSubject)
        }));`),
      ),
    begin: async (actor) =>
      JSON.parse(
        await sql(`set role service_role;
      select to_json(public.native_admin_begin(${literal(actor)}));`),
      ),
    execute: async (actor, issuer, action, _params, environment) => {
      assert(action === "get_rollout");
      return JSON.parse(
        await sql(`set role service_role;
        select public.native_admin_execute(${literal(actor)},${
          literal(issuer)
        },'get_rollout','{}',${literal(environment)});`),
      );
    },
  };
  const call = (token: string) =>
    handleNativeAdmin(
      request({ version: 1, action: "get_rollout" }, {
        Authorization: `Bearer ${token}`,
      }),
      deps,
    );
  const used = async () =>
    Number(
      await sql(
        "select coalesce((select requests from private.native_admin_gate_rate),0);",
      ),
    );
  return { calls, call, used };
}
Deno.test("R10 SQL E2E: active Gestión garbage cannot starve a real SQL owner", async () => {
  const { calls, call, used } = await fixture(true);
  const owner = await signedJwt();
  assert((await call(owner)).status === 200 && await used() === 1);
  const forged = owner.replace(/\.[^.]+$/, "." + "A".repeat(342));
  const hub = await signedJwt({
    client_id: config.clientId,
    aud: config.clientId,
  });
  for (let n = 0; n < 200; n++) {
    assert(
      (await call(["x", forged, hub, "opaque-hub-fixture"][n % 4])).status ===
        401,
    );
  }
  assert(
    await used() === 1 && calls.rpc === 1 && calls.clerk === 2 &&
      calls.jwks === 1,
  );
  assert((await call(owner)).status === 200 && await used() === 2);
  assert(
    Number(calls.rpc) === 2 && Number(calls.clerk) === 4 && calls.jwks === 1,
  );
});
Deno.test("R10 SQL E2E: inactive Gestión preserves opaque Hub and its safety counter", async () => {
  const { calls, call, used } = await fixture(false);
  assert(
    (await call("opaque-hub-fixture")).status === 200 && await used() === 1,
  );
  assert((await call("x")).status === 401 && await used() === 2);
  assert(calls.rpc === 2 && calls.clerk === 3 && calls.jwks === 0);
});
