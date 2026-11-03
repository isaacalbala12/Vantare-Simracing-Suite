import { handleTestingReportSubmit } from "./index.ts";

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
        context: { consent: { version: "triage-v2" } },
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
