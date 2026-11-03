/// <reference lib="dom.iterable" />
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
    console.error(
      "Disposable SQL fixture:",
      new TextDecoder().decode(result.stderr),
    );
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
    preOwner: async (issuer, verifiedSubject) => {
      try {
        return JSON.parse(
          await sql(`set role service_role;
          select to_json(public.native_admin_preflight(${literal(issuer)},${
            literal(verifiedSubject)
          }));`),
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("native_admin_forbidden")
        ) {
          throw { message: "native_admin_forbidden" };
        }
        throw error;
      }
    },
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
    fetch: (input, init?: RequestInit) => {
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
    claimChange: async (actor, request, account) =>
      JSON.parse(
        await sql(
          `set role service_role; select coalesce(to_json(public.native_admin_claim_change(${
            literal(actor)
          },${literal(request)},${literal(account)})),'null'::json);`,
        ),
      ),
    releaseChange: async (actor, request, account, token) =>
      JSON.parse(
        await sql(
          `set role service_role; select to_json(public.native_admin_release_change(${
            literal(actor)
          },${literal(request)},${literal(account)},${literal(token)}));`,
        ),
      ),
    recordEffect: async (actor, event) =>
      JSON.parse(
        await sql(`set role service_role;
        select to_json(public.native_admin_record_effect(${literal(actor)},${
          literal(JSON.stringify(event))
        }::jsonb));`),
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
  return { calls, call, used, deps };
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

Deno.test("R10 SQL E2E: registered non-owner and unknown signed subjects cannot spend or create", async () => {
  const { calls, call, used } = await fixture(true);
  const nonOwner = "user_bbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const unknown = "user_ccccccccccccccccccccccccccc";
  await sql(
    `insert into public.profiles(id) values('00000000-0000-4000-8000-000000001919') on conflict do nothing;
    insert into public.account_identities(issuer,subject,account_id) values(${
      literal(config.issuer)
    },${
      literal(nonOwner)
    },'00000000-0000-4000-8000-000000001919') on conflict do nothing;`,
  );
  const counts = () =>
    sql(
      "select (select count(*) from public.profiles)||':'||(select count(*) from public.account_identities);",
    );
  const before = await counts();
  for (const sub of [nonOwner, unknown]) {
    assert((await call(await signedJwt({ sub }))).status === 403);
  }
  assert(await used() === 0 && calls.rpc === 0 && calls.clerk === 0);
  assert(await counts() === before);
});

Deno.test("R10 SQL E2E: Clerk intent/result persist when the following SQL state update fails", async () => {
  const { deps } = await fixture(false);
  const target = "00000000-0000-4000-8000-000000001925";
  const targetSubject = "user_eeeeeeeeeeeeeeeeeeeeeeeeeee";
  await sql(
    `insert into public.profiles(id) values(${
      literal(target)
    }) on conflict do nothing;
    insert into public.account_identities(issuer,subject,account_id) values(${
      literal(config.issuer)
    },${literal(targetSubject)},${literal(target)}) on conflict do nothing;`,
  );
  deps.finishChange = () =>
    Promise.reject(new Error("synthetic state transaction failure"));
  let unbanned = false;
  const originalFetch = deps.fetch!;
  deps.fetch = async (url, init?: RequestInit) => {
    if (String(url).endsWith("/unban")) {
      // The real service-only journal MUST already contain the intention.
      assert(
        Number(
          await sql(
            `select count(*) from private.admin_effects where outcome='started' and target_hash=encode(sha256(convert_to(${
              literal(targetSubject)
            },'UTF8')),'hex');`,
          ),
        ) === 1,
      );
      unbanned = true;
      return new Response(null, { status: 200 });
    }
    return originalFetch(url, init);
  };
  deps.execute = async (actor, issuer, action, params, environment) => {
    if (action === "set_blocked") {
      throw new Error("synthetic state transaction failure");
    }
    assert(action === "get_account");
    return JSON.parse(
      await sql(
        `set role service_role; select public.native_admin_execute(${
          literal(actor)
        },${literal(issuer)},${literal(action)},${
          literal(JSON.stringify(params))
        }::jsonb,${literal(environment)});`,
      ),
    );
  };
  const response = await handleNativeAdmin(
    request({
      version: 1,
      action: "set_blocked",
      account_id: target,
      blocked: false,
    }, { Authorization: "Bearer opaque-hub-fixture" }),
    deps,
  );
  assert(response.status === 503 && unbanned);
  const requestId = response.headers.get("X-Request-ID")!;
  const outcomes = JSON.parse(
    await sql(
      `select json_agg(outcome order by occurred_at) from private.admin_effects where request_id=${
        literal(requestId)
      }::uuid;`,
    ),
  );
  assert(JSON.stringify(outcomes) === JSON.stringify(["started", "succeeded"]));
});

Deno.test("5b SQL E2E: concurrent ban/unban on one account cannot overlap", async () => {
  const { deps } = await fixture(false);
  const target = "00000000-0000-4000-8000-000000001955";
  const targetSubject = "user_fffffffffffffffffffffffffff";
  await sql(
    `insert into public.profiles(id) values(${
      literal(target)
    }) on conflict do nothing;
    insert into public.account_identities(issuer,subject,account_id) values(${
      literal(config.issuer)
    },${literal(targetSubject)},${literal(target)}) on conflict do nothing;`,
  );
  deps.execute = async (actor, issuer, action, params, environment) =>
    JSON.parse(
      await sql(
        `set role service_role; select public.native_admin_execute(${
          literal(actor)
        },${literal(issuer)},${literal(action)},${
          literal(JSON.stringify(params))
        }::jsonb,${literal(environment)});`,
      ),
    );
  deps.finishChange = async (
    actor,
    issuer,
    params,
    environment,
    request,
    token,
  ) =>
    JSON.parse(
      await sql(
        `set role service_role; select public.native_admin_finish_change(${
          literal(actor)
        },${literal(issuer)},${literal(JSON.stringify(params))}::jsonb,${
          literal(environment)
        },${literal(request)},${literal(token)});`,
      ),
    );
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => entered = resolve);
  let release!: () => void;
  const resume = new Promise<void>((resolve) => release = resolve);
  const original = deps.fetch!;
  const writes: string[] = [];
  deps.fetch = async (url, init?: RequestInit) => {
    if (String(url).endsWith("/ban")) {
      writes.push("ban");
      entered();
      await resume;
      return new Response(null, { status: 200 });
    }
    if (String(url).endsWith("/unban")) {
      writes.push("unban");
      return new Response(null, { status: 200 });
    }
    return original(url, init);
  };
  const call = (blocked: boolean) =>
    handleNativeAdmin(
      request({
        version: 1,
        action: "set_blocked",
        account_id: target,
        blocked,
      }, { Authorization: "Bearer opaque-hub-fixture" }),
      deps,
    );
  const first = call(true);
  let firstResponse: Response | undefined;
  try {
    await Promise.race([
      ready,
      first.then(async (response) => {
        throw new Error(
          "ban finished before provider barrier: " + response.status + " " +
            await response.text(),
        );
      }),
    ]);
    assert((await call(false)).status === 409);
    assert(JSON.stringify(writes) === JSON.stringify(["ban"]));
  } finally {
    release();
    firstResponse = await first;
  }
  assert(firstResponse.status === 200);
  assert(
    await sql(
      `select blocked from private.admin_account_blocks where account_id=${
        literal(target)
      };`,
    ) === "t",
  );
  assert((await call(false)).status === 200);
  assert(
    await sql(
      `select blocked from private.admin_account_blocks where account_id=${
        literal(target)
      };`,
    ) === "f",
  );
});
