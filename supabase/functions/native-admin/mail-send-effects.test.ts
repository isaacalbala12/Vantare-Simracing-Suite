import { executeMail, type MailDeps } from "./mail.ts";
import { assert } from "../native-account-authorize/testdata/auth.ts";
import { NativeError } from "../_shared/native-auth.ts";
import { handleNativeAdmin } from "./index.ts";
import {
  account,
  authDeps,
  request,
} from "../native-account-authorize/testdata/auth.ts";
const id = "19106000-0000-4000-8000-000000000001";
function fixture() {
  const trace: string[] = [];
  const rows: Record<string, unknown>[] = [];
  let claimed = false;
  const claim = () => {
    if (claimed) return { delivery: null };
    claimed = true;
    return {
      delivery: { id, email: "private@example.invalid", locale: "es" },
      content: { subject: "fixture", body: "fixture" },
    };
  };
  const run = (name: string) => {
    if (name === "mail_claim") return Promise.resolve(claim());
    if (name === "mail_can_send") return Promise.resolve({ allowed: true });
    if (name === "mail_finish") trace.push("ack");
    return Promise.resolve({});
  };
  const deps = {
    actor: id,
    environment: "sandbox",
    requestId: id,
    env: (key: string) =>
      ({
        MARKETING_SEND_ENABLED: "true",
        BREVO_API_KEY: "fake",
        BREVO_MARKETING_SENDER: "sender@example.invalid",
        MARKETING_UNSUBSCRIBE_URL: "https://fixture.invalid/unsubscribe",
        MARKETING_UNSUBSCRIBE_KEY: "fake-fixture-unsubscribe-key-32-chars",
      } as Record<string, string>)[key],
    rpc: (name: string, args: Record<string, unknown>): Promise<unknown> => {
      if (name === "native_admin_claim_mail_send") {
        const result = claim();
        if (result.delivery) {
          trace.push("started");
          rows.push({ ...args, p_outcome: "started" });
        }
        return Promise.resolve(result);
      }
      rows.push(args);
      trace.push(String(args.p_outcome));
      return Promise.resolve(true);
    },
    fetch: (() => {
      trace.push("http");
      return Promise.resolve(
        Response.json({ messageId: "private-provider-receipt" }, {
          status: 201,
        }),
      );
    }) as typeof fetch,
  };
  return { trace, rows, run, deps };
}
Deno.test("SMTP actual caller journals atomic started and result before SQL ACK, without email URL or receipt", async () => {
  const f = fixture();
  await executeMail(
    "mail_send_batch",
    { campaign_id: id, revision: 1 },
    f.run,
    f.deps as MailDeps,
  );
  assert(JSON.stringify(f.trace) === '["started","http","succeeded","ack"]');
  assert(
    f.rows.every((r) => r.p_actor === id && r.p_request === id) &&
      !JSON.stringify(f.rows).includes("private") &&
      !JSON.stringify(f.rows).includes("https://"),
  );
});
for (const phase of ["claim", "result"]) {
  Deno.test(
    "SMTP audit outage blocks dispatch or SQL ACK at " + phase,
    async () => {
      const f = fixture();
      const original = f.deps.rpc;
      f.deps.rpc = (name, args) =>
        ((name === "native_admin_claim_mail_send") === (phase === "claim"))
          ? Promise.reject(new Error("private@example.invalid recorder"))
          : original(name, args);
      let error: unknown;
      try {
        await executeMail(
          "mail_send_batch",
          { campaign_id: id, revision: 1 },
          f.run,
          f.deps as MailDeps,
        );
      } catch (e) {
        error = e;
      }
      assert(
        error instanceof NativeError &&
          error.code === "mail_send_audit_unavailable" &&
          !f.trace.includes("ack"),
      );
      assert(f.trace.includes("http") === (phase === "result"));
    },
  );
}
for (const status of [400, 401, 403, 404, 422, 503, 0, 204]) {
  Deno.test("SMTP provider outcome classification " + status, async () => {
    const f = fixture();
    f.deps.fetch = () => {
      f.trace.push("http");
      if (!status) {
        throw new Error("private@example.invalid transport");
      }
      return Promise.resolve(new Response(null, { status }));
    };
    await executeMail(
      "mail_send_batch",
      { campaign_id: id, revision: 1 },
      f.run,
      f.deps as MailDeps,
    );
    assert(
      f.rows.length === 2 &&
        f.rows[1].p_outcome ===
          ([400, 401, 403, 404, 422].includes(status) ? "failed" : "unknown"),
    );
    assert(
      f.trace.filter((x) => x === "http").length === 1 &&
        f.trace.at(-1) === "ack",
    );
  });
}
Deno.test("SMTP consent withdrawn after atomic claim closes not-dispatched before skipped ACK", async () => {
  const f = fixture();
  const run = (name: string) =>
    name === "mail_can_send"
      ? Promise.resolve({ allowed: false })
      : f.run(name);
  await executeMail(
    "mail_send_batch",
    { campaign_id: id, revision: 1 },
    run,
    f.deps as MailDeps,
  );
  assert(
    JSON.stringify(f.trace) === '["started","failed","ack"]' &&
      f.rows[1].p_provider_status === null,
  );
});

for (
  const [message, status] of [
    ["mail_revision_conflict", 409],
    ["native_admin_forbidden", 403],
    ["native_admin_not_found", 404],
    ["native_admin_invalid", 400],
  ] as const
) {
  Deno.test("SMTP claim preserves known SQL response " + message, async () => {
    const f = fixture();
    f.deps.rpc = () => Promise.reject({ message });
    const response = await handleNativeAdmin(
      request({
        version: 1,
        action: "mail_send_batch",
        campaign_id: id,
        revision: 1,
      }),
      {
        ...authDeps(),
        adminAuth: { enabled: false, clientId: "" },
        environment: "sandbox",
        gate: () => Promise.resolve(true),
        resolve: () => Promise.resolve(account),
        begin: () => Promise.resolve(true),
        mail: f.deps,
        mailExecute: f.run,
      },
    );
    assert(response.status === status && !f.trace.includes("http"));
  });
}
for (const phase of ["consent", "unsubscribe", "stale"]) {
  Deno.test(
    "SMTP pre-dispatch failure closes started before ACK: " + phase,
    async () => {
      const f = fixture();
      let elapsed = 0;
      const deps: MailDeps = { ...f.deps, now: () => elapsed };
      const original = f.deps.rpc;
      deps.rpc = async (name, args) => {
        const result = await original(name, args);
        if (name === "native_admin_claim_mail_send") {
          if (phase === "stale") elapsed = 5000;
          if (
            phase === "unsubscribe" && result && typeof result === "object" &&
            "delivery" in result && result.delivery
          ) {
            Object.defineProperty(result.delivery, "email", {
              get: () => {
                throw Error("synthetic token construction error");
              },
            });
          }
        }
        return result;
      };
      const run = (name: string) =>
        name === "mail_can_send" && phase === "consent"
          ? Promise.reject(Error("consent SQL unavailable"))
          : f.run(name);
      await executeMail(
        "mail_send_batch",
        { campaign_id: id, revision: 1 },
        run,
        deps,
      );
      assert(JSON.stringify(f.trace) === '["started","failed","ack"]');
      assert(f.rows[1].p_provider_status === null);
    },
  );
}

for (const value of [false, null, {}, "true", "throw", "reject"]) {
  Deno.test(
    "SMTP result confirmation accepts only true: " + JSON.stringify(value),
    async () => {
      const f = fixture();
      const original = f.deps.rpc;
      const deps: MailDeps = {
        ...f.deps,
        rpc: (name, args) => {
          if (name === "native_admin_claim_mail_send") {
            return original(name, args);
          }
          if (value === "throw") {
            throw new Error("private recorder");
          }
          if (value === "reject") {
            return Promise.reject(new Error("private recorder"));
          }
          return Promise.resolve(value);
        },
      };
      let error: unknown;
      try {
        await executeMail(
          "mail_send_batch",
          { campaign_id: id, revision: 1 },
          f.run,
          deps,
        );
      } catch (caught) {
        error = caught;
      }
      assert(
        error instanceof NativeError &&
          error.code === "mail_send_audit_unavailable",
      );
      assert(JSON.stringify(f.trace) === '["started","http"]');
    },
  );
}

Deno.test("SMTP requires actor before the claim RPC", async () => {
  const f = fixture();
  let calls = 0;
  const deps: MailDeps = {
    ...f.deps,
    actor: undefined,
    rpc: () => {
      calls++;
      return Promise.resolve({ delivery: null });
    },
  };
  let error: unknown;
  try {
    await executeMail(
      "mail_send_batch",
      { campaign_id: id, revision: 1 },
      f.run,
      deps,
    );
  } catch (caught) {
    error = caught;
  }
  assert(
    error instanceof NativeError &&
      error.code === "mail_send_audit_unavailable",
  );
  assert(calls === 0 && JSON.stringify(f.trace) === "[]");
});
