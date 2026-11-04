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
for (const status of [401, 403, 422, 503, 0]) {
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
          ([401, 403, 422].includes(status) ? "failed" : "unknown"),
    );
    assert(
      !f.trace.includes("ack") && !JSON.stringify(f.rows).includes("private@"),
    );
  });
}
