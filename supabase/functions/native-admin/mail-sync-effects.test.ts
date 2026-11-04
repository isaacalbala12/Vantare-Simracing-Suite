import { executeMail, type MailDeps } from "./mail.ts";
import { NativeError } from "../_shared/native-auth.ts";
import { assert } from "../native-account-authorize/testdata/auth.ts";
const id = "19105000-0000-4000-8000-000000000101";
function fixture() {
  const trace: string[] = [];
  const rows: Record<string, unknown>[] = [];
  const deps = {
    actor: id,
    requestId: id,
    env: (key: string) =>
      ({
        MARKETING_SEND_ENABLED: "true",
        BREVO_API_KEY: "fake",
        BREVO_MARKETING_LISTS: JSON.stringify({
          free: 1,
          pro: 2,
          pro_plus: 3,
          launch: 4,
          testers: 5,
          creators: 6,
          waitlist: 7,
        }),
      } as Record<string, string>)[key],
    rpc: (_name: string, args: Record<string, unknown>) => {
      rows.push(args);
      trace.push(String(args.p_outcome));
      return Promise.resolve(true);
    },
    fetch: ((_url: unknown, init?: RequestInit) => {
      trace.push(init?.method ?? "POST");
      return Promise.resolve(Response.json({}));
    }) as typeof fetch,
  };
  const run = (action: string) => {
    if (action === "mail_sync_ack") trace.push("ack");
    return Promise.resolve(
      action === "mail_sync_page"
        ? { contacts: [{ id, email: "private@example.invalid", revision: 1 }] }
        : action === "mail_sync_lease"
        ? { allowed: true, lease: id, consent: true, groups: ["free"] }
        : {},
    );
  };
  return { deps, run, trace, rows };
}
Deno.test("sync real caller journals both HTTP phases before ACK without email or URL", async () => {
  const f = fixture();
  await executeMail("mail_sync", {}, f.run, f.deps as MailDeps);
  assert(
    JSON.stringify(f.trace) ===
      '["started","POST","succeeded","started","PUT","succeeded","ack"]',
  );
  assert(
    f.rows.length === 4 &&
      f.rows.every((r) => r.p_actor === id && r.p_request === id),
  );
  assert(
    !JSON.stringify(f.rows).includes("private@") &&
      !JSON.stringify(f.rows).includes("https://"),
  );
});
for (const phase of ["started", "succeeded"]) {
  Deno.test("sync recorder failure blocks HTTP/ACK at " + phase, async () => {
    const f = fixture();
    const record = f.deps.rpc;
    f.deps.rpc = (name, args) =>
      args.p_outcome === phase ? Promise.resolve(false) : record(name, args);
    let error: unknown;
    try {
      await executeMail("mail_sync", {}, f.run, f.deps as MailDeps);
    } catch (e) {
      error = e;
    }
    assert(
      error instanceof NativeError && error.status === 503 &&
        !f.trace.includes("ack"),
    );
    assert(f.trace.includes("POST") === (phase !== "started"));
  });
}
for (const status of [400, 401, 403, 404, 422, 503, 0]) {
  Deno.test("sync failed/unknown provider outcome " + status, async () => {
    const f = fixture();
    f.deps.fetch = () => {
      f.trace.push("POST");
      if (!status) {
        throw new Error("private@example.invalid https://private.invalid");
      }
      return Promise.resolve(new Response(null, { status }));
    };
    try {
      await executeMail("mail_sync", {}, f.run, f.deps as MailDeps);
    } catch {
      /* Expected provider failure. */
    }
    assert(
      f.rows.length === 2 &&
        f.rows[1].p_outcome ===
          ([400, 401, 403, 404, 422].includes(status) ? "failed" : "unknown"),
    );
    assert(
      !f.trace.includes("ack") && !JSON.stringify(f.rows).includes("private@"),
    );
  });
}

Deno.test("sync stale started never dispatches HTTP or ACK and closes failed without HTTP status", async () => {
  const f = fixture();
  let elapsed = 0;
  const original = f.deps.rpc;
  const deps = {
    ...f.deps,
    now: () => elapsed,
    rpc: async (name: string, args: Record<string, unknown>) => {
      const reply = await original(name, args);
      if (args.p_outcome === "started") elapsed = 5000;
      return reply;
    },
  };
  let error: unknown;
  try {
    await executeMail("mail_sync", {}, f.run, deps as MailDeps);
  } catch (e) {
    error = e;
  }
  assert(
    error instanceof NativeError && error.code === "mail_sync_intent_expired",
  );
  assert(
    !f.trace.includes("POST") && !f.trace.includes("PUT") &&
      !f.trace.includes("ack"),
  );
  assert(
    f.rows.length === 2 && f.rows[1].p_outcome === "failed" &&
      f.rows[1].p_provider_status === null,
  );
});
Deno.test("sync dispatch before freshness boundary preserves the normal two requests", async () => {
  const f = fixture();
  let elapsed = 0;
  const original = f.deps.rpc;
  const deps = {
    ...f.deps,
    now: () => elapsed,
    rpc: async (name: string, args: Record<string, unknown>) => {
      const reply = await original(name, args);
      if (args.p_outcome === "started") elapsed += 4999;
      return reply;
    },
  };
  await executeMail("mail_sync", {}, f.run, deps as MailDeps);
  assert(
    f.trace.includes("POST") && f.trace.includes("PUT") &&
      f.trace.includes("ack"),
  );
});

for (const value of [false, null, {}, "true", "throw", "reject"]) {
  Deno.test(
    "sync audit confirmation accepts only true: " + JSON.stringify(value),
    async () => {
      const f = fixture();
      const deps: MailDeps = {
        ...f.deps,
        rpc: () => {
          if (value === "throw") throw new Error("private recorder");
          if (value === "reject") {
            return Promise.reject(new Error("private recorder"));
          }
          return Promise.resolve(value);
        },
      };
      let error: unknown;
      try {
        await executeMail("mail_sync", {}, f.run, deps);
      } catch (caught) {
        error = caught;
      }
      assert(
        error instanceof NativeError &&
          error.code === "mail_sync_audit_unavailable",
      );
      assert(JSON.stringify(f.trace) === "[]");
    },
  );
}

for (
  const [outcome, status] of [["succeeded", 200], ["failed", 403], [
    "unknown",
    503,
  ]] as const
) {
  Deno.test(
    "sync result recorder failure blocks ACK for " + outcome,
    async () => {
      const f = fixture();
      const original = f.deps.rpc;
      f.deps.rpc = (name, args) =>
        args.p_outcome === outcome
          ? Promise.resolve(false)
          : original(name, args);
      f.deps.fetch = () => {
        f.trace.push("POST");
        return Promise.resolve(Response.json({}, { status }));
      };
      let error: unknown;
      try {
        await executeMail("mail_sync", {}, f.run, f.deps as MailDeps);
      } catch (caught) {
        error = caught;
      }
      assert(
        error instanceof NativeError &&
          error.code === "mail_sync_audit_unavailable",
      );
      assert(JSON.stringify(f.trace) === '["started","POST"]');
    },
  );
}
