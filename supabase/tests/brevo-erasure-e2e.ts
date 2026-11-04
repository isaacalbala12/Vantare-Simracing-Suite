/// <reference lib="dom.iterable" />
import { handleNativeAdmin } from "../functions/native-admin/index.ts";
import {
  account,
  authDeps,
  claims,
  request as adminRequest,
  user,
} from "../functions/native-account-authorize/testdata/auth.ts";
import { handleMailCleanup } from "../functions/mail-cleanup/index.ts";
import { assert } from "../functions/native-account-authorize/testdata/auth.ts";

const command: { program: string; args: string[] } = JSON.parse(Deno.args[0]);
assert(command.args.includes("127.0.0.1"), "disposable loopback required");
const lit = (v: unknown): string =>
  v === null || v === undefined
    ? "null"
    : typeof v === "number"
    ? String(v)
    : "'" + String(v).replaceAll("'", "''") + "'";
async function sql(query: string): Promise<string> {
  const r = await new Deno.Command(command.program, {
    args: [...command.args, "-q", "-c", "set statement_timeout='8s'; " + query],
    stdout: "piped",
    stderr: "piped",
  }).output();
  assert(r.success, new TextDecoder().decode(r.stderr));
  return new TextDecoder().decode(r.stdout).trim();
}
const env = (k: string) =>
  ({
    MARKETING_CLEANUP_ENABLED: "true",
    BREVO_API_KEY: "fake",
    MAIL_CLEANUP_KEY: "fake-maintenance-key-32-characters-long",
  } as Record<string, string>)[k];
const request = () =>
  new Request("https://fixture.invalid/", {
    method: "POST",
    headers: { Authorization: "Bearer " + env("MAIL_CLEANUP_KEY") },
    body: '{"version":1}',
  });
async function setup(n: number) {
  const id = "19105500-0000-4000-8000-" + String(n).padStart(12, "0");
  await sql(
    "update private.mail_contact_erasures set lease_until=clock_timestamp()+interval '1 hour' where state='processing'; update private.mail_contact_erasures set next_attempt_at=clock_timestamp()+interval '1 hour' where state='pending'; " +
      "insert into private.mail_contact_erasures(id,email,email_fingerprint) values(" +
      lit(id) + "," + lit("synthetic" + n + "@example.invalid") +
      ",repeat('b',64));",
  );
  return id;
}
const rpcNames = new Set([
  "mail_erasure_expire",
  "mail_erasure_claim",
  "mail_erasure_finish",
  "native_admin_record_mail_erasure",
]);
async function rpc(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  assert(rpcNames.has(name));
  const params = Object.entries(args).map(([k, v]) => {
    assert(/^p_[a-z_]+$/.test(k));
    return k + " => " + lit(v);
  });
  return JSON.parse(
    await sql(
      "set role service_role; select coalesce(to_json(public." +
        name + "(" + params.join(",") + ")),'null'::json);",
    ),
  );
}
async function events(requestId?: string) {
  return JSON.parse(
    await sql(
      "select coalesce(json_agg(e order by occurred_at),'[]'::json) from private.admin_effects e " +
        "where effect='brevo_delete'" +
        (requestId ? " and request_id=" + lit(requestId) : ""),
    ),
  ) as Record<string, unknown>[];
}
Deno.test("real maintenance route commits started before fake DELETE and succeeded before ACK", async () => {
  const id = await setup(1);
  let http = 0;
  const response = await handleMailCleanup(request(), {
    env,
    rpc: async (name, args) => {
      if (name === "mail_erasure_finish") {
        const rows = await events();
        assert(
          rows.some((e) => e.outcome === "succeeded"),
          "result must precede SQL ACK",
        );
      }
      return await rpc(name, args);
    },
    fetch: async () => {
      http++;
      const rows = await events();
      assert(
        rows.some((e) => e.outcome === "started"),
        "intent must precede HTTP",
      );
      return new Response(null, { status: 204 });
    },
  });
  assert(response.status === 200 && http === 1);
  assert(
    await sql(
      "select state from private.mail_contact_erasures where id=" + lit(id),
    ) === "completed",
  );
  const requestId = response.headers.get("X-Request-ID");
  assert(requestId);
  const rows = await events(requestId);
  assert(
    rows.filter((e) => e.outcome === "started").length === 1 &&
      rows.filter((e) => e.outcome === "succeeded").length === 1,
  );
  assert(
    !JSON.stringify(rows).includes("@example.invalid") &&
      !JSON.stringify(rows).includes("https://"),
  );
});
Deno.test("uncertain fake DELETE is pending in existing view and existing reconcile closes it", async () => {
  await setup(2);
  const response = await handleMailCleanup(request(), {
    env,
    rpc,
    fetch: () => {
      throw new Error("synthetic private transport");
    },
  });
  assert(response.status === 200);
  const pending = JSON.parse(
    await sql(
      "select coalesce(json_agg(e),'[]'::json) from private.admin_pending_effects e where effect='brevo_delete'",
    ),
  );
  assert(pending.length === 1 && pending[0].latest_outcome === "unknown");
  const reviewer = "19105500-0000-4000-8000-000000000099";
  await sql(
    "insert into public.profiles(id) values(" + lit(reviewer) +
      "); select * from public.operational_access_set(" +
      lit(reviewer) +
      ",'owner','grant','fixture','Brevo reconcile','brevo-reconcile',null);",
  );
  assert(
    await sql(
      "set role service_role; select public.native_admin_reconcile_effect(" +
        lit(reviewer) + "," + lit(pending[0].effect_id) + ");",
    ) === "t",
  );
  assert(
    await sql(
      "select count(*) from private.admin_pending_effects where effect='brevo_delete'",
    ) === "0",
  );
});
Deno.test("real route recorder failure prevents fake DELETE and leaves job unacknowledged", async () => {
  const id = await setup(3);
  let http = 0;
  const response = await handleMailCleanup(request(), {
    env,
    rpc: (name, args) =>
      name === "native_admin_record_mail_erasure"
        ? Promise.resolve(false)
        : rpc(name, args),
    fetch: () => {
      http++;
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  });
  assert(response.status === 503 && http === 0);
  assert(
    await sql(
      "select state from private.mail_contact_erasures where id=" + lit(id),
    ) === "processing",
  );
  const rows = await events();
  assert(
    !JSON.stringify(rows).includes("@example.invalid") &&
      !JSON.stringify(rows).includes("https://"),
  );
});
Deno.test("SQL capability rejection prevents DELETE through the actual route", async () => {
  await setup(4);
  let http = 0;
  const response = await handleMailCleanup(request(), {
    env,
    rpc: (name, args) =>
      rpc(
        name,
        name === "native_admin_record_mail_erasure"
          ? { ...args, p_lease: "19105500-0000-4000-8000-000000000098" }
          : args,
      ),
    fetch: () => {
      http++;
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  });
  assert(response.status === 503 && http === 0);
});
Deno.test("real admin mail_cleanup records the verified actor and DELETE404", async () => {
  const id = await setup(5);
  await sql(
    "insert into public.profiles(id) values(" + lit(account) +
      ") on conflict do nothing; " +
      "select * from public.operational_access_set(" + lit(account) +
      ",'owner','grant','fixture','Brevo admin','brevo-admin',null);",
  );
  let http = 0;
  const response = await handleNativeAdmin(
    adminRequest({ version: 1, action: "mail_cleanup" }),
    {
      ...authDeps(),
      adminAuth: { enabled: false, clientId: "" },
      environment: "sandbox",
      gate: () => Promise.resolve(true),
      resolve: () => Promise.resolve(account),
      begin: async () =>
        JSON.parse(
          await sql(
            "set role service_role; select to_json(public.native_admin_begin(" +
              lit(account) + "));",
          ),
        ),
      fetch: (url) =>
        Promise.resolve(
          Response.json(String(url).endsWith("verify") ? claims : user),
        ),
      mailExecute: async (actor, action, params, environment) =>
        JSON.parse(
          await sql(
            "set role service_role; select public.mail_admin_execute(" +
              lit(actor) + "," + lit(action) + "," +
              lit(JSON.stringify(params)) + "::jsonb," + lit(environment) +
              ");",
          ),
        ),
      mail: {
        env,
        cleanup: { rpc },
        fetch: async () => {
          http++;
          const rows = await events();
          assert(
            rows.some((e) => e.outcome === "started" && e.actor === account),
          );
          return new Response(null, { status: 404 });
        },
      },
    },
  );
  assert(response.status === 200 && http === 1);
  assert(
    await sql(
      "select state from private.mail_contact_erasures where id=" + lit(id),
    ) === "completed",
  );
  const rows = await events(response.headers.get("X-Request-ID")!);
  assert(
    rows.length === 2 && rows.every((e) => e.actor === account) &&
      rows.some((e) => e.outcome === "succeeded" && e.provider_status === 404),
  );
  assert(
    !JSON.stringify(rows).includes("@example.invalid") &&
      !JSON.stringify(rows).includes("https://"),
  );
});

Deno.test("nine started recorder failures preserve pending job and attempts", async () => {
  const id = await setup(6);
  await sql(
    `create function public.fixture_brevo_recorder_down() returns trigger language plpgsql as $$begin
    if new.effect='brevo_delete' and new.outcome='started' then raise exception 'fixture_recorder_unavailable'; end if;
    return new; end$$;
    create trigger fixture_brevo_recorder_down before insert on private.admin_effects
    for each row execute function public.fixture_brevo_recorder_down();`,
  );
  let http = 0;
  const codes: unknown[] = [];
  try {
    for (let n = 0; n < 9; n++) {
      // Simulate the next maintenance run after the old claim lease expired.
      await sql(
        "update private.mail_contact_erasures set lease_until=clock_timestamp()-interval '1 second' where id=" +
          lit(id) + " and state='processing'",
      );
      const response = await handleMailCleanup(request(), {
        env,
        rpc,
        fetch: () => {
          http++;
          return Promise.resolve(new Response(null, { status: 204 }));
        },
      });
      codes.push((await response.json()).code);
    }
    const job = JSON.parse(
      await sql(
        "select to_json(j) from private.mail_contact_erasures j where id=" +
          lit(id),
      ),
    );
    assert(
      job.state === "pending" && job.attempts === 0 && job.email &&
        !job.failed_at,
      "audit outage must not exhaust erasure attempts: " +
        JSON.stringify({ state: job.state, attempts: job.attempts }),
    );
    assert(
      http === 0 &&
        codes.every((code) => code === "mail_cleanup_audit_unavailable"),
    );
  } finally {
    await sql(
      "drop trigger fixture_brevo_recorder_down on private.admin_effects; drop function public.fixture_brevo_recorder_down()",
    );
  }
});
