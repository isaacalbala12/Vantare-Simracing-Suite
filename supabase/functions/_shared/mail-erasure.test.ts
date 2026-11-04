import { drainMailErasures } from "./mail-erasure.ts";
import { handleMailCleanup } from "../mail-cleanup/index.ts";
import { assert } from "../native-account-authorize/testdata/auth.ts";
import { NativeError } from "./native-auth.ts";
const env = (key: string) =>
  ({
    MARKETING_CLEANUP_ENABLED: "true",
    BREVO_API_KEY: "local-fake",
    MAIL_CLEANUP_KEY: "local-cleanup-key-at-least-32-characters",
  })[key as "BREVO_API_KEY"];

type AuditEvent = {
  job_id: string;
  outcome: string;
  provider_status?: number;
};
function auditedFixture(status = 204) {
  const job = "19105000-0000-4000-8000-000000000001";
  const trace: string[] = [];
  const events: AuditEvent[] = [];
  let claimed = false;
  const options = {
    env,
    audit: async (event: AuditEvent) => {
      await Promise.resolve();
      events.push(event);
      trace.push(event.outcome);
      return true;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === "mail_erasure_expire") return Promise.resolve(0);
      if (name === "mail_erasure_claim") {
        if (claimed) return Promise.resolve({ job: null });
        claimed = true;
        return Promise.resolve({
          job: { id: job, lease: "private-lease", email: "old@example.invalid" },
        });
      }
      assert(name === "mail_erasure_finish" && args.p_http_status === status);
      trace.push("finish");
      return Promise.resolve(true);
    },
    fetch: () => {
      trace.push("http");
      if (status === 0) throw new Error("private transport old@example.invalid");
      return Promise.resolve(new Response(null, { status }));
    },
  };
  return { options, trace, events, job };
}
Deno.test("optional audit commits intent and provider result before queue ACK, without email", async () => {
  for (const status of [204, 404, 401, 403, 422, 503, 200, 0]) {
    const f = auditedFixture(status);
    const outcome = [204, 404].includes(status)
      ? "succeeded"
      : [401, 403, 422].includes(status)
      ? "failed"
      : "unknown";
    const result = await drainMailErasures(f.options);
    assert(result.processed === 1);
    assert(
      JSON.stringify(f.trace) ===
        JSON.stringify(["started", "http", outcome, "finish"]),
    );
    assert(
      JSON.stringify(f.events) === JSON.stringify([
        { job_id: f.job, outcome: "started" },
        {
          job_id: f.job,
          outcome,
          ...(status ? { provider_status: status } : {}),
        },
      ]),
    );
    assert(
      !JSON.stringify(f.events).includes("old@example.invalid") &&
        !JSON.stringify(f.events).includes("private-lease"),
    );
  }
});
for (const phase of ["started", "terminal"]) {
  for (const throws of [false, true]) {
    Deno.test("audit failure is closed and sanitized: " + phase + "/" + throws, async () => {
      const f = auditedFixture();
      f.options.audit = (event) => {
        f.events.push(event);
        f.trace.push(event.outcome);
        if ((event.outcome === "started") === (phase === "started")) {
          if (throws) throw new Error("private recorder old@example.invalid");
          return Promise.resolve(false);
        }
        return Promise.resolve(true);
      };
      let error: unknown;
      try {
        await drainMailErasures(f.options);
      } catch (caught) {
        error = caught;
      }
      assert(
        error instanceof NativeError && error.status === 503 &&
          error.code === "mail_cleanup_unconfirmed" &&
          !error.message.includes("old@example.invalid"),
      );
      assert(!f.trace.includes("finish"));
      assert(f.trace.includes("http") === (phase === "terminal"));
    });
  }
}
Deno.test("SQL ACK failure preserves audit of the already accepted DELETE", async () => {
  const f = auditedFixture(404);
  const original = f.options.rpc;
  f.options.rpc = (name, args) =>
    name === "mail_erasure_finish"
      ? Promise.resolve(false)
      : original(name, args);
  let error: unknown;
  try {
    await drainMailErasures(f.options);
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof NativeError && error.code === "mail_cleanup_unconfirmed");
  assert(
    JSON.stringify(f.trace) === '["started","http","succeeded"]' &&
      f.events[1].provider_status === 404,
  );
});
Deno.test("Brevo erasure retries timeout and 503, accepts DELETE 204/404, never sends", async () => {
  for (const status of [0, 401, 503, 204, 404]) {
    let claimed = false;
    let http = 0;
    let finished = 0;
    await drainMailErasures({
      env,
      rpc: (name, args) => {
        if (name === "mail_erasure_expire") return Promise.resolve(0);
        if (name === "mail_erasure_claim") {
          if (claimed) return Promise.resolve({ job: null });
          claimed = true;
          return Promise.resolve({
            job: {
              id: "local-job",
              lease: "local-lease",
              email: "old@example.invalid",
            },
          });
        }
        assert(
          name === "mail_erasure_finish" && args.p_http_status === status &&
            args.p_id === "local-job" && args.p_lease === "local-lease",
        );
        finished++;
        return Promise.resolve(true);
      },
      fetch: (url, init?: RequestInit) => {
        http++;
        assert(
          init?.method === "DELETE" &&
            String(url) ===
              "https://api.brevo.com/v3/contacts/old%40example.invalid?identifierType=email_id",
        );
        if (status === 0) throw new TypeError("local timeout");
        return Promise.resolve(new Response(null, { status }));
      },
    });
    assert(http === 1 && finished === 1);
  }
});
Deno.test("erasure worker is bounded, disabled by default and authenticates before SQL", async () => {
  let calls = 0;
  let threw = false;
  try {
    await drainMailErasures({
      env: () => undefined,
      rpc: (name) => {
        calls++;
        assert(name === "mail_erasure_expire");
        return Promise.resolve(1);
      },
    });
  } catch {
    threw = true;
  }
  assert(threw && calls === 1);
  const response = await handleMailCleanup(
    new Request("https://project.invalid/", {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
      body: '{"version":1}',
    }),
    {
      env,
      rpc: () => {
        calls++;
        throw new Error("unexpected");
      },
    },
  );
  assert(response.status === 401 && calls === 1);
  let claimed = 0;
  await drainMailErasures({
    env,
    rpc: (name) =>
      Promise.resolve(
        name === "mail_erasure_expire" ? 0 : name === "mail_erasure_claim"
          ? {
            job: {
              id: String(++claimed),
              lease: "lease",
              email: "x@example.invalid",
            },
          }
          : true,
      ),
    fetch: () => Promise.resolve(new Response(null, { status: 404 })),
  });
  assert(claimed === 5);
});
Deno.test("erasure cannot claim a false result as a confirmed ACK", async () => {
  let failed = false;
  try {
    await drainMailErasures({
      env,
      rpc: (name) =>
        Promise.resolve(
          name === "mail_erasure_expire"
            ? 0
            : name === "mail_erasure_claim"
            ? { job: { id: "id", lease: "lease", email: "x@example.invalid" } }
            : false,
        ),
      fetch: () => Promise.resolve(new Response(null, { status: 204 })),
    });
  } catch {
    failed = true;
  }
  assert(failed);
});

Deno.test("authenticated queue endpoint accepts only the closed maintenance request", async () => {
  let claims = 0;
  const deps = {
    env,
    rpc: (name: string) => {
      if (name === "mail_erasure_expire") return Promise.resolve(0);
      assert(name === "mail_erasure_claim");
      claims++;
      return Promise.resolve({ job: null });
    },
  };
  const make = (body: unknown) =>
    new Request("https://project.invalid/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("MAIL_CLEANUP_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const invalid = await handleMailCleanup(
    make({ version: 1, email: "chosen@example.invalid" }),
    deps,
  );
  assert(invalid.status === 400 && claims === 0);
  const valid = await handleMailCleanup(make({ version: 1 }), deps);
  assert(
    valid.status === 200 && Number(claims) === 1 &&
      (await valid.json()).processed === 0,
  );
});

Deno.test("retention runs even with missing Brevo key, and no job is claimed", async () => {
  const names: string[] = [];
  let http = 0;
  let disabled = false;
  try {
    await drainMailErasures({
      env: (key) => key === "MARKETING_CLEANUP_ENABLED" ? "true" : undefined,
      rpc: (name) => {
        names.push(name);
        return Promise.resolve(1);
      },
      fetch: () => {
        http++;
        throw new Error("must not call provider");
      },
    });
  } catch {
    disabled = true;
  }
  assert(
    disabled && http === 0 &&
      JSON.stringify(names) === '["mail_erasure_expire"]',
  );
});
