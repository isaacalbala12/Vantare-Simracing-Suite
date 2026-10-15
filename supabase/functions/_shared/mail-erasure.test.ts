import { drainMailErasures } from "./mail-erasure.ts";
import { handleMailCleanup } from "../mail-cleanup/index.ts";
import { assert } from "../native-account-authorize/testdata/auth.ts";
const env = (key: string) =>
  ({
    MARKETING_CLEANUP_ENABLED: "true",
    BREVO_API_KEY: "local-fake",
    MAIL_CLEANUP_KEY: "local-cleanup-key-at-least-32-characters",
  })[key as "BREVO_API_KEY"];
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
      fetch: (url, init) => {
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
