import { handleTestingReportSubmit } from "./index.ts";
import { validateReportV2 } from "./report-v2.ts";

const account = "18960000-0000-4000-8000-000000000071";
const id = "18960000-0000-4000-8000-000000000072";
const key = `draft_${"a".repeat(64)}`;

function request(body: Record<string, unknown>, bearer = account): Request {
  return new Request(
    "https://example.invalid/functions/v1/testing-report-submit",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        "cf-connecting-ip": "192.0.2.10",
      },
      body: JSON.stringify(body),
    },
  );
}

const base = {
  contract_version: "testing.report.v2",
  report_id: id,
  channel: "master",
  title: "Informe de prueba",
  body: "Descripción de prueba",
  consent: true,
  idempotency_key: key,
};

Deno.test("the three v2 forms use one account-owned write and receipt", async () => {
  for (const variant of ["simple", "triage", "diagnostic"]) {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const body = variant === "simple"
      ? { ...base, variant }
      : variant === "triage"
      ? {
        ...base,
        variant,
        title: "[contenido retirado por privacidad]",
        body: "[contenido retirado por privacidad]",
        context: {
          app_channel: "master",
          consent: {
            version: "triage-v2",
            items: [],
            accepted_at: "2026-11-03T12:00:00Z",
          },
        },
        attachments: [],
      }
      : { ...base, variant, context: { module: "hub", app_version: "1.2.3" } };
    const response = await handleTestingReportSubmit(request(body), {
      now: () => new Date("2026-11-03T12:00:00Z"),
      account: () => Promise.resolve(account),
      admit: () => Promise.resolve(true),
      rpc: (name, args) => {
        calls.push({ name, args });
        return Promise.resolve({
          error: null,
          data: [{
            report_id: id,
            report_state: "received",
            idempotent: false,
            created_at: "2026-11-03T12:00:00Z",
          }],
        });
      },
    });
    if (
      response.status !== 200 || calls.length !== 1 ||
      calls[0].name !== "testing_report_v2_submit_admitted" ||
      calls[0].args.p_account !== account ||
      JSON.stringify(calls[0].args.p_report) !== JSON.stringify(body)
    ) {
      throw new Error(`v2 contract diverged for ${variant}`);
    }
  }
});

Deno.test("anonymous and changed-account bodies cannot submit v2", async () => {
  const calls: string[] = [];
  const deps = {
    now: () => new Date("2026-11-03T12:00:00Z"),
    account: (r: Request) =>
      r.headers.get("authorization")?.includes(account)
        ? Promise.resolve(account)
        : Promise.reject(new Error("no account")),
    admit: () => Promise.resolve(true),
    rpc: (name: string) => {
      calls.push(name);
      return Promise.resolve({ error: null });
    },
  };
  for (
    const body of [{ ...base, account_id: account }, {
      ...base,
      consent: false,
    }]
  ) {
    if ((await handleTestingReportSubmit(request(body), deps)).status !== 400) {
      throw new Error("untrusted v2 body accepted");
    }
  }
  if (
    (await handleTestingReportSubmit(request(base, "anonymous"), deps))
        .status === 200 || calls.length
  ) {
    throw new Error("anonymous v2 write reached SQL");
  }
});

Deno.test("variant shapes are closed before account admission", async () => {
  const admitted: string[] = [];
  const deps = {
    now: () => new Date("2026-11-03T12:00:00Z"),
    account: () => Promise.resolve(account),
    admit: () => {
      admitted.push("account");
      return Promise.resolve(true);
    },
    rpc: () => Promise.resolve({ error: null }),
  };
  for (
    const body of [
      { ...base, variant: "triage" },
      { ...base, variant: "diagnostic" },
      { ...base, context: {} },
      { ...base, variant: "triage", context: {}, attachments: [], extra: 1 },
    ]
  ) {
    if ((await handleTestingReportSubmit(request(body), deps)).status !== 400) {
      throw new Error("variant shape accepted");
    }
  }
  if (admitted.length) throw new Error("invalid variant spent account quota");
});

Deno.test("legacy submission bodies are closed at the Edge boundary", async () => {
  let writes = 0;
  const deps = {
    now: () => new Date("2026-11-03T12:00:00Z"),
    account: () => Promise.resolve(account),
    admit: () => Promise.resolve(true),
    rpc: () => {
      writes++;
      return Promise.resolve({ error: null, data: null });
    },
    submit: () => {
      writes++;
      return Promise.resolve();
    },
  };
  for (
    const body of [
      {
        p_id: id,
        p_channel: "master",
        p_title: "A",
        p_body: "B",
        p_consent: true,
      },
      { p_contract_version: "testing-center.v1" },
    ]
  ) {
    if ((await handleTestingReportSubmit(request(body), deps)).status !== 400) {
      throw new Error("legacy body remained writable");
    }
  }
  if (writes) throw new Error("legacy write reached a database function");
});

Deno.test("NUL and unknown diagnostic fields fail before account quota", async () => {
  let admissions = 0;
  const deps = {
    account: () => Promise.resolve(account),
    admit: () => {
      admissions++;
      return Promise.resolve(true);
    },
    rpc: () => Promise.resolve({ error: null }),
  };
  for (
    const body of [
      { ...base, variant: "simple", body: "bad\u0000text" },
      {
        ...base,
        variant: "diagnostic",
        context: { module: "hub", token: "secret" },
      },
      { ...base, variant: "diagnostic", context: { module: 7 } },
      { ...base, variant: "diagnostic", context: { module: "x".repeat(4096) } },
      {
        ...base,
        variant: "triage",
        title: "[contenido retirado por privacidad]",
        body: "[contenido retirado por privacidad]",
        context: {
          app_version: "1.2.3",
          app_channel: "master",
          game: "none",
          system: {},
          consent: {
            version: "triage-v2",
            items: [],
            accepted_at: "2026-11-03T12:00:00Z",
          },
          private_note: "hidden",
        },
        attachments: [],
      },
    ]
  ) {
    const response = await handleTestingReportSubmit(request(body), deps);
    if (response.status !== 400) {
      throw new Error(`invalid body returned ${response.status}`);
    }
  }
  if (admissions) throw new Error("invalid body spent quota");
});

Deno.test("SQL validation failures are client errors", async () => {
  for (const code of ["22023", "22021", "23514", "22001"]) {
    const response = await handleTestingReportSubmit(
      request({ ...base, variant: "simple" }),
      {
        account: () => Promise.resolve(account),
        admit: () => Promise.resolve(true),
        rpc: () => Promise.resolve({ error: { code } }),
      },
    );
    if (response.status !== 400) {
      throw new Error(`${code} returned ${response.status}`);
    }
  }
});

Deno.test("real Rust simple and triage wire fixtures pass the Edge contract", async () => {
  for (const name of ["simple", "triage"]) {
    const fixture = JSON.parse(
      await Deno.readTextFile(
        new URL(
          `../../tests/fixtures/native-report-v2-${name}.json`,
          import.meta.url,
        ),
      ),
    );
    validateReportV2(fixture);
  }
});
