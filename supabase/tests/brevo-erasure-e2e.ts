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
  "native_admin_claim_mail_erasure",
  "mail_erasure_finish",
  "native_admin_record_mail_erasure",
  "native_admin_record_mail_sync",
  "native_admin_claim_mail_send",
  "native_admin_record_mail_send",
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
      name === "native_admin_claim_mail_erasure"
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
    ) === "pending",
  );
  const rows = await events();
  assert(
    !JSON.stringify(rows).includes("@example.invalid") &&
      !JSON.stringify(rows).includes("https://"),
  );
});
Deno.test("SQL invalid intent rejection prevents DELETE through the actual route", async () => {
  await setup(4);
  let http = 0;
  const response = await handleMailCleanup(request(), {
    env,
    rpc: (name, args) =>
      rpc(
        name,
        name === "native_admin_claim_mail_erasure"
          ? { ...args, p_request: null }
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
    "create function public.fixture_brevo_recorder_down() returns trigger language plpgsql as " +
      lit(
        "begin if new.effect='brevo_delete' and new.outcome='started' then raise exception 'fixture_recorder_unavailable'; end if; return new; end",
      ) +
      "; create trigger fixture_brevo_recorder_down before insert on private.admin_effects for each row execute function public.fixture_brevo_recorder_down();",
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

Deno.test("missing atomic claim RPC never falls back to unaudited legacy claim", async () => {
  const id = await setup(7);
  await sql(
    "alter function public.native_admin_claim_mail_erasure(uuid,uuid,uuid) rename to fixture_missing_atomic_claim",
  );
  let http = 0;
  try {
    for (let n = 0; n < 9; n++) {
      const response = await handleMailCleanup(request(), {
        env,
        rpc,
        fetch: () => {
          http++;
          return Promise.resolve(new Response(null, { status: 204 }));
        },
      });
      assert(
        response.status === 503 &&
          (await response.json()).code === "mail_cleanup_audit_unavailable",
      );
    }
    const job = JSON.parse(
      await sql(
        "select to_json(j) from private.mail_contact_erasures j where id=" +
          lit(id),
      ),
    );
    assert(job.state === "pending" && job.attempts === 0 && http === 0);
  } finally {
    await sql(
      "alter function public.fixture_missing_atomic_claim(uuid,uuid,uuid) rename to native_admin_claim_mail_erasure",
    );
  }
});

async function syncRoute(
  fetcher: typeof fetch,
  record: typeof rpc = rpc,
  now?: () => number,
  action = "mail_sync",
  params: Record<string, unknown> = {},
) {
  const syncEnv = (key: string) =>
    ({
      MARKETING_SEND_ENABLED: "true",
      BREVO_API_KEY: "fake",
      BREVO_MARKETING_SENDER: "sender@example.invalid",
      MARKETING_UNSUBSCRIBE_URL: "https://fixture.invalid/unsubscribe",
      MARKETING_UNSUBSCRIBE_KEY: "fake-unsubscribe-key-longer-than-32-chars",
      BREVO_MARKETING_LISTS: JSON.stringify({
        free: 1,
        pro: 2,
        pro_plus: 3,
        launch: 4,
        testers: 5,
        creators: 6,
        waitlist: 7,
      }),
    } as Record<string, string>)[key];
  return await handleNativeAdmin(
    adminRequest({ version: 1, action, ...params }),
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
      mail: { env: syncEnv, rpc: record, fetch: fetcher, now },
    },
  );
}
async function syncSetup(n: number) {
  const id = "19105900-0000-4000-8000-" + String(n).padStart(12, "0");
  await sql(
    "update private.mail_contacts set sync_lease_until=clock_timestamp()+interval '1 hour'; insert into private.mail_contacts(id,email,locale,evidence,consent,waitlist) values(" +
      lit(id) + "," + lit("sync" + n + "@example.invalid") +
      ",'es','fixture',true,true)",
  );
  return id;
}
async function syncEvents() {
  return JSON.parse(
    await sql(
      "select coalesce(json_agg(e),'[]'::json) from private.admin_effects e where action='mail_sync'",
    ),
  ) as Record<string, unknown>[];
}
Deno.test("real admin sync POST and PUT journal precedes fake provider and SQL ACK", async () => {
  const id = await syncSetup(1);
  let http = 0;
  const response = await syncRoute(async (_url, init?: RequestInit) => {
    http++;
    const rows = await syncEvents();
    assert(
      rows.some((r) =>
        r.outcome === "started" &&
        r.effect === (init?.method === "PUT"
            ? "brevo_contact_update"
            : "brevo_contact_upsert")
      ),
    );
    return new Response(null, { status: 204 });
  });
  assert(response.status === 200 && http === 2);
  const requestId = response.headers.get("X-Request-ID");
  const rows = (await syncEvents()).filter((r) => r.request_id === requestId);
  assert(rows.length === 4 && rows.every((r) => r.actor === account));
  assert(rows.filter((r) => r.outcome === "succeeded").length === 2);
  assert(
    await sql(
      "select sync_state ? 'sandbox' from private.mail_contacts where id=" +
        lit(id),
    ) === "t",
  );
  assert(
    !JSON.stringify(rows).includes("@example.invalid") &&
      !JSON.stringify(rows).includes("https://"),
  );
});
Deno.test("real sync unknown PUT stays pending, no sync ACK, existing owner reconciles", async () => {
  const id = await syncSetup(2);
  let http = 0;
  const response = await syncRoute(() => {
    http++;
    if (http === 2) {
      throw new Error("private@example.invalid https://transport.invalid");
    }
    return Promise.resolve(new Response(null, { status: 201 }));
  });
  assert(response.status === 503 && http === 2);
  assert(
    await sql(
      "select sync_state ? 'sandbox' from private.mail_contacts where id=" +
        lit(id),
    ) === "f",
  );
  const pending = JSON.parse(
    await sql(
      "select coalesce(json_agg(e),'[]'::json) from private.admin_pending_effects e where action='mail_sync'",
    ),
  );
  assert(pending.length === 1 && pending[0].latest_outcome === "unknown");
  assert(
    await sql(
      "set role service_role; select public.native_admin_reconcile_effect(" +
        lit(account) + "," + lit(pending[0].effect_id) + ")",
    ) === "t",
  );
  assert(
    await sql(
      "select count(*) from private.admin_pending_effects where action='mail_sync'",
    ) === "0",
  );
  const rows = await syncEvents();
  assert(
    !JSON.stringify(rows).includes("@example.invalid") &&
      !JSON.stringify(rows).includes("https://"),
  );
});
Deno.test("real sync recorder outage prevents provider and leaves projection dirty", async () => {
  const id = await syncSetup(3);
  let http = 0;
  const response = await syncRoute(
    () => {
      http++;
      return Promise.resolve(new Response(null, { status: 204 }));
    },
    (name, args) =>
      name === "native_admin_record_mail_sync"
        ? Promise.resolve(false)
        : rpc(name, args),
  );
  assert(
    response.status === 503 &&
      (await response.json()).error === "mail_sync_audit_unavailable" &&
      http === 0,
  );
  assert(
    await sql(
      "select sync_state ? 'sandbox' from private.mail_contacts where id=" +
        lit(id),
    ) === "f",
  );
});

for (const status of [400, 404]) {
  Deno.test(
    "real repeated sync rejection " + status +
      " closes failed without accumulating pending",
    async () => {
      const id = await syncSetup(status === 400 ? 4 : 5);
      let http = 0;
      for (let n = 0; n < 2; n++) {
        await sql(
          "update private.mail_contacts set sync_lease_until=clock_timestamp()-interval '1 second' where id=" +
            lit(id),
        );
        const response = await syncRoute(() => {
          http++;
          return Promise.resolve(new Response(null, { status }));
        });
        assert(response.status === 503);
        const requestId = response.headers.get("X-Request-ID");
        const rows = (await syncEvents()).filter((r) =>
          r.request_id === requestId
        );
        assert(
          rows.length === 2 &&
            rows.some((r) =>
              r.outcome === "failed" && r.provider_status === status
            ),
        );
        assert(
          await sql(
            "select count(*) from private.admin_pending_effects where request_id=" +
              lit(requestId),
          ) === "0",
        );
      }
      assert(
        http === 2 &&
          await sql(
              "select sync_state ? 'sandbox' from private.mail_contacts where id=" +
                lit(id),
            ) === "f",
      );
    },
  );
}
for (const stalePhase of [1, 2]) {
  Deno.test(
    "real stale sync intent skips HTTP phase " + stalePhase +
      " and closes not-dispatched",
    async () => {
      const id = await syncSetup(5 + stalePhase);
      let http = 0, elapsed = 0, starts = 0;
      const response = await syncRoute(() => {
        http++;
        return Promise.resolve(new Response(null, { status: 204 }));
      }, async (name, args) => {
        const result = await rpc(name, args);
        if (
          name === "native_admin_record_mail_sync" &&
          args.p_outcome === "started" && ++starts === stalePhase
        ) elapsed += 5000;
        return result;
      }, () => elapsed);
      assert(
        response.status === 503 &&
          (await response.json()).error === "mail_sync_intent_expired" &&
          http === stalePhase - 1,
      );
      const requestId = response.headers.get("X-Request-ID");
      const rows = (await syncEvents()).filter((r) =>
        r.request_id === requestId
      );
      assert(
        rows.some((r) => r.outcome === "failed" && r.provider_status === null),
      );
      assert(
        await sql(
          "select count(*) from private.admin_pending_effects where request_id=" +
            lit(requestId),
        ) === "0",
      );
      assert(
        await sql(
          "select sync_state ? 'sandbox' from private.mail_contacts where id=" +
            lit(id),
        ) === "f",
      );
    },
  );
}

async function sendSetup(n: number) {
  const campaign = "19106200-0000-4000-8000-" + String(n).padStart(12, "0");
  const delivery = "19106300-0000-4000-8000-" + String(n).padStart(12, "0");
  const email = "smtp" + n + "@example.invalid";
  await sql(
    "insert into private.mail_contacts(email,locale,evidence,consent,waitlist) values(" +
      lit(email) +
      ",'es','fixture',true,true); insert into private.mail_campaigns(id,environment,state,target_group,approved_by,content) values(" +
      lit(campaign) + ",'sandbox','sending','waitlist'," + lit(account) +
      ',\'{"es":{"subject":"fixture","body":"fixture"}}\'); insert into private.mail_deliveries(id,campaign_id,email,locale) values(' +
      lit(delivery) + "," + lit(campaign) + "," + lit(email) + ",'es')",
  );
  return { campaign, delivery, email };
}
const sendRoute = (
  campaign: string,
  fetcher: typeof fetch,
  record: typeof rpc = rpc,
) =>
  syncRoute(fetcher, record, () => 0, "mail_send_batch", {
    campaign_id: campaign,
    revision: 1,
  });
async function sendEvents(requestId: string | null) {
  return JSON.parse(
    await sql(
      "select coalesce(json_agg(e),'[]'::json) from private.admin_effects e where effect='brevo_smtp_send' and request_id=" +
        lit(requestId),
    ),
  ) as Record<string, unknown>[];
}
Deno.test("real SMTP started and succeeded precede fake provider and delivery ACK", async () => {
  const job = await sendSetup(1);
  let http = 0;
  const response = await sendRoute(job.campaign, async () => {
    http++;
    assert(
      await sql(
        "select count(*) from private.admin_effects where effect='brevo_smtp_send' and outcome='started'",
      ) !== "0",
    );
    return Response.json({ messageId: "private-provider-receipt" }, {
      status: 201,
    });
  }, async (name, args) => {
    return await rpc(name, args);
  });
  assert(response.status === 200 && http === 1);
  const rows = await sendEvents(response.headers.get("X-Request-ID"));
  assert(
    rows.length === 2 &&
      rows.some((r) => r.outcome === "succeeded" && r.provider_status === 201),
  );
  assert(
    !JSON.stringify(rows).includes("@") &&
      !JSON.stringify(rows).includes("https://") &&
      !JSON.stringify(rows).includes("private-provider-receipt"),
  );
  assert(
    await sql(
      "select status from private.mail_deliveries where id=" +
        lit(job.delivery),
    ) === "accepted",
  );
});
Deno.test("real SMTP unknown uses existing pending/reconcile and never resends", async () => {
  const job = await sendSetup(2);
  let http = 0;
  const response = await sendRoute(job.campaign, () => {
    http++;
    throw new Error("private@example.invalid transport");
  });
  assert(
    response.status === 200 && http === 1 &&
      await sql(
          "select status from private.mail_deliveries where id=" +
            lit(job.delivery),
        ) === "uncertain",
  );
  const rows = await sendEvents(response.headers.get("X-Request-ID"));
  const intent = rows.find((r) => r.outcome === "started");
  assert(intent && rows.some((r) => r.outcome === "unknown"));
  assert(
    await sql(
      "select count(*) from private.admin_pending_effects where effect_id=" +
        lit(intent.effect_id),
    ) === "1",
  );
  assert(
    await sql(
      "set role service_role; select public.native_admin_reconcile_effect(" +
        lit(account) + "," + lit(intent.effect_id) + ")",
    ) === "t",
  );
  await sendRoute(job.campaign, () => {
    http++;
    return Promise.resolve(Response.json({ messageId: "forbidden" }));
  });
  assert(http === 1);
});
Deno.test("nine real SMTP recorder failures roll back quota and claim before provider", async () => {
  const job = await sendSetup(3);
  let http = 0;
  await sql(
    "create function public.fixture_smtp_recorder_down() returns trigger language plpgsql as " +
      lit(
        "begin if new.effect='brevo_smtp_send' and new.outcome='started' then raise exception 'fixture_recorder_unavailable'; end if; return new; end",
      ) +
      "; create trigger fixture_smtp_recorder_down before insert on private.admin_effects for each row execute function public.fixture_smtp_recorder_down()",
  );
  try {
    for (let n = 0; n < 9; n++) {
      const response = await sendRoute(job.campaign, () => {
        http++;
        return Promise.resolve(Response.json({ messageId: "forbidden" }));
      });
      assert(
        response.status === 503 &&
          (await response.json()).error === "mail_send_audit_unavailable",
      );
    }
    assert(
      http === 0 &&
        await sql(
            "select status from private.mail_deliveries where id=" +
              lit(job.delivery),
          ) === "pending",
    );
    assert(
      await sql(
        "select count(*) from private.mail_quota_reservations where id=" +
          lit(job.delivery),
      ) === "0",
    );
  } finally {
    await sql(
      "drop trigger fixture_smtp_recorder_down on private.admin_effects; drop function public.fixture_smtp_recorder_down()",
    );
  }
});
Deno.test("real SMTP withdrawal after atomic claim closes not-dispatched and never sends", async () => {
  const job = await sendSetup(4);
  let http = 0;
  const response = await sendRoute(job.campaign, () => {
    http++;
    return Promise.resolve(Response.json({ messageId: "forbidden" }));
  }, async (name, args) => {
    const value = await rpc(name, args);
    if (name === "native_admin_claim_mail_send") {
      await sql("select public.mail_unsubscribe(" + lit(job.email) + ")");
    }
    return value;
  });
  assert(
    response.status === 200 && http === 0 &&
      await sql(
          "select status from private.mail_deliveries where id=" +
            lit(job.delivery),
        ) === "skipped",
  );
  const rows = await sendEvents(response.headers.get("X-Request-ID"));
  assert(
    rows.some((r) => r.outcome === "failed" && r.provider_status === null),
  );
});
Deno.test("real SMTP lost result journal prevents delivery ACK and leaves pending evidence", async () => {
  const job = await sendSetup(5);
  let http = 0;
  const response = await sendRoute(
    job.campaign,
    () => {
      http++;
      return Promise.resolve(
        Response.json({ messageId: "private-provider-receipt" }, {
          status: 201,
        }),
      );
    },
    (name, args) =>
      name === "native_admin_record_mail_send"
        ? Promise.resolve(false)
        : rpc(name, args),
  );
  assert(
    response.status === 503 && http === 1 &&
      await sql(
          "select status from private.mail_deliveries where id=" +
            lit(job.delivery),
        ) === "dispatching",
  );
  const rows = await sendEvents(response.headers.get("X-Request-ID"));
  assert(rows.length === 1 && rows[0].outcome === "started");
  assert(
    await sql(
      "select count(*) from private.admin_pending_effects where effect_id=" +
        lit(rows[0].effect_id),
    ) === "1",
  );
});
