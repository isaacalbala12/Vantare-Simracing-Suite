// Disposable Docker PostgreSQL only. OAuth and Brevo are doubles; SQL is not mocked.
import { handleNativeMailConsent } from "../functions/native-mail-consent/index.ts";
import { executeMail } from "../functions/native-admin/mail.ts";
import { drainMailErasures } from "../functions/_shared/mail-erasure.ts";
import { handleUnsubscribe } from "../functions/mail-unsubscribe/index.ts";
import { unsubscribeToken } from "../functions/mail-unsubscribe/tokens.ts";
import {
  assert,
  authDeps,
  config,
  request,
  user,
} from "../functions/native-account-authorize/testdata/auth.ts";
const enabled = Deno.env.get("MARKETING_SQL_E2E") === "true";
const container = Deno.env.get("MARKETING_SQL_TEST_CONTAINER") ?? "";
const database = Deno.env.get("MARKETING_SQL_TEST_DATABASE") ?? "";
const literal = (value: unknown) =>
  value === null || value === undefined
    ? "null"
    : typeof value === "boolean"
    ? String(value)
    : "'" + String(value).replaceAll("'", "''") + "'";
async function sql(query: string): Promise<string> {
  if (
    !enabled || !/^vantare-[a-z0-9-]+$/.test(container) ||
    !/^admin_[a-z0-9_]+$/.test(database)
  ) throw new Error("disposable marketing SQL test not configured");
  const child = new Deno.Command("docker", {
    args: [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      database,
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(query));
  await writer.close();
  const result = await child.output();
  if (!result.success) throw new Error(new TextDecoder().decode(result.stderr));
  return new TextDecoder().decode(result.stdout).trim();
}
async function rpc(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const fields: Record<string, string[]> = {
    mail_consent_execute: [
      "p_account",
      "p_email",
      "p_action",
      "p_locale",
      "p_consent",
      "p_source",
    ],
    mail_admin_execute: ["p_actor", "p_action", "p_params", "p_environment"],
    mail_record_consent: [
      "p_account",
      "p_email",
      "p_locale",
      "p_consent",
      "p_evidence",
      "p_waitlist",
    ],
    mail_forget_waitlist: ["p_email"],
    mail_unsubscribe: ["p_email"],
    mail_unsubscribe_budget: ["p_token_hash"],
    mail_erasure_claim: [],
    mail_erasure_finish: ["p_id", "p_lease", "p_http_status"],
  };
  const keys = fields[name];
  if (!keys) throw new Error("SQL test RPC not allowed");
  const values = keys.map((k) =>
    literal(k === "p_params" ? JSON.stringify(args[k]) : args[k])
  ).join(",");
  const result = await sql(`select to_jsonb(public.${name}(${values}));`);
  return result ? JSON.parse(result) : null;
}
Deno.test({
  name:
    "marketing E2E: verified OAuth request -> real SQL consent -> Brevo double -> forget and provider erasure",
  ignore: !enabled,
  fn: async () => {
    await sql(
      `insert into private.clerk_issuers(issuer,authorized_parties,enabled) values(${
        literal(config.issuer)
      },array['https://app.invalid'],true) on conflict(issuer) do nothing;`,
    );
    const auth = authDeps();
    const deps = {
      ...auth,
      rpc,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) =>
        String(url).endsWith("/verify")
          ? await auth.fetch!(url, init)
          : Response.json({
            ...user,
            email_addresses: user.email_addresses.map((e) => ({
              ...e,
              verification: { status: "verified" },
            })),
          }),
      resolve: async (issuer: string, subject: string) =>
        await sql(
          `select public.native_resolve_account(${literal(issuer)},${
            literal(subject)
          });`,
        ),
    };
    const initial = await handleNativeMailConsent(
      request({ version: 1, action: "get" }),
      deps,
    );
    assert(
      initial.status === 200 && (await initial.json()).consent === false,
      "no implicit consent",
    );
    const save = await handleNativeMailConsent(
      request({
        version: 1,
        action: "set",
        consent: true,
        locale: "pt-BR",
        source: "onboarding",
      }),
      deps,
    );
    assert(
      save.status === 200 && (await save.json()).consent === true,
      "onboarding calls real consent SQL",
    );
    const check = await handleNativeMailConsent(
      request({ version: 1, action: "get" }),
      deps,
    );
    assert(
      check.status === 200 && (await check.json()).consent === true,
      "settings reads same permission",
    );
    assert(
      await sql(
        "select evidence from private.mail_contacts where email='tester@example.invalid';",
      ) === "marketing.onboarding.v1",
    );
    const owner = "00000000-0000-4000-8000-000000001710";
    await sql(
      `insert into public.profiles(id)values('${owner}');select * from public.operational_access_set('${owner}','owner','grant','test:e2e','E2E fixture','test:e2e',null);`,
    );
    const run = (p_action: string, p_params: Record<string, unknown>) =>
      rpc("mail_admin_execute", {
        p_actor: owner,
        p_action,
        p_params,
        p_environment: "sandbox",
      }) as Promise<Record<string, unknown>>;
    const vars: Record<string, string> = {
      MARKETING_SEND_ENABLED: "true",
      MARKETING_CLEANUP_ENABLED: "true",
      BREVO_API_KEY: "local-fake",
      BREVO_MARKETING_LISTS: JSON.stringify({
        free: 1,
        pro: 2,
        pro_plus: 3,
        launch: 4,
        testers: 5,
        creators: 6,
        waitlist: 7,
      }),
      MARKETING_UNSUBSCRIBE_KEY: "local-e2e-unsubscribe-key-32-characters",
    };
    const env = (k: string) => vars[k];
    const writes: Array<Record<string, unknown>> = [];
    const fetcher: typeof fetch = (url, init) => {
      assert(String(url).startsWith("https://api.brevo.com/v3/contacts"));
      writes.push(JSON.parse(String(init?.body)));
      return Promise.resolve(new Response(null, { status: 204 }));
    };
    await executeMail("mail_sync", {}, run, { env, fetch: fetcher });
    assert(
      writes.some((w) =>
        w.emailBlacklisted === false && JSON.stringify(w.listIds) === "[1]"
      ),
      "verified consenting account reaches its effective Brevo group",
    );
    const withdraw = await handleNativeMailConsent(
      request({
        version: 1,
        action: "set",
        consent: false,
        locale: "pt-BR",
        source: "settings",
      }),
      deps,
    );
    assert(withdraw.status === 200);
    writes.length = 0;
    await executeMail("mail_sync", {}, run, { env, fetch: fetcher });
    assert(
      writes.every((w) => w.emailBlacklisted !== false),
      "withdrawal in settings suppresses provider contact",
    );
    await rpc("mail_record_consent", {
      p_account: null,
      p_email: "wait-e2e@example.invalid",
      p_locale: "it",
      p_consent: true,
      p_evidence: "marketing.waitlist.web.v1",
      p_waitlist: true,
    });
    const token = await unsubscribeToken(
      "wait-e2e@example.invalid",
      vars.MARKETING_UNSUBSCRIBE_KEY,
    );
    const url = `https://project.invalid/?t=${token}`;
    assert(
      (await handleUnsubscribe(new Request(url), {
        env,
        budget: async (hash) =>
          await rpc("mail_unsubscribe_budget", {
            p_token_hash: hash ?? null,
          }) === true,
        forget: async (email) => {
          await rpc("mail_forget_waitlist", { p_email: email });
        },
      })).status === 200,
    );
    assert(
      await sql(
        "select consent from private.mail_contacts where email='wait-e2e@example.invalid';",
      ) === "t",
      "scanner GET does not withdraw",
    );
    assert(
      (await handleUnsubscribe(
        new Request(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "action=forget",
        }),
        {
          env,
          budget: async (hash) =>
            await rpc("mail_unsubscribe_budget", {
              p_token_hash: hash ?? null,
            }) === true,
          forget: async (email) => {
            await rpc("mail_forget_waitlist", { p_email: email });
          },
        },
      )).status === 200,
    );
    assert(
      await sql(
        "select count(*) from private.mail_contacts where email='wait-e2e@example.invalid';",
      ) === "0",
    );
    let deletes = 0;
    const drain = (status: number) =>
      drainMailErasures({
        env,
        rpc,
        fetch: (url, init) => {
          assert(
            init?.method === "DELETE" &&
              String(url).includes("wait-e2e%40example.invalid"),
          );
          deletes++;
          return Promise.resolve(new Response(null, { status }));
        },
      });
    await drain(503);
    assert(
      await sql(
        "select count(*) from private.mail_contact_erasures where state='pending' and email='wait-e2e@example.invalid';",
      ) === "1",
      "failed provider delete remains queued with the minimum address needed to retry",
    );
    await sql(
      "update private.mail_contact_erasures set next_attempt_at=now()-interval '1 second' where email='wait-e2e@example.invalid';",
    );
    await drain(404);
    assert(
      deletes === 2 &&
        await sql(
            "select count(*) from private.mail_contact_erasures where state='completed' and email is null;",
          ) === "1",
      "real SQL ACK removes provider-erasure PII",
    );
  },
});
