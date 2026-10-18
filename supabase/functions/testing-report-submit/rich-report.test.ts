import { handleTestingReportSubmit, type SubmitDeps } from "./index.ts";

function eq(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("assertion failed");
  }
}
const account = "17090000-0000-4000-8000-000000000001";
const batch = "17090000-0000-4000-8000-000000000002";
const body = {
  p_contract_version: "testing-center.v1",
  p_channel: "testers",
  p_action_text: "Informe estructurado",
  p_expected_text: "Revisión humana pendiente",
  p_observed_text: "Revisión humana pendiente",
  p_context_text: "",
  p_app_version: "1.2.3",
  p_os_family: "windows",
  p_os_version: "Windows 11",
  p_module: "hub",
  p_include_diagnostic: false,
  p_include_logs: false,
  p_diagnostic_payload: null,
  p_diagnostic_digest: null,
  p_idempotency_key: "draft_" + "a".repeat(64),
};
const receipt = [{
  report_id: "report_" + "b".repeat(64),
  report_state: "submitted",
  idempotent: false,
  created_at: "2026-10-19T00:00:00Z",
}];
function request(payload: unknown) {
  return new Request(
    "https://example.invalid/functions/v1/testing-report-submit",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "192.0.2.10",
      },
      body: JSON.stringify(payload),
    },
  );
}
function fixture() {
  const calls: unknown[] = [];
  const deps: SubmitDeps = {
    salt: "synthetic-test-salt-only-32-characters",
    now: () => new Date("2026-10-19T00:00:00Z"),
    account: () => {
      calls.push("auth");
      return Promise.resolve(account);
    },
    admit: (scope) => {
      calls.push(scope);
      return Promise.resolve(true);
    },
    rpc: (name, payload) => {
      calls.push({ name, payload });
      return Promise.resolve({ data: receipt, error: null });
    },
  };
  return { calls, deps };
}
Deno.test("1709: rich report with/without batch shares admission and returns durable receipt", async () => {
  for (const payload of [body, { ...body, p_batch_id: batch }]) {
    const f = fixture();
    const response = await handleTestingReportSubmit(request(payload), f.deps);
    eq(response.status, 200);
    eq(response.headers.get("cache-control"), "no-store");
    eq(await response.json(), receipt);
    eq(f.calls, ["ip", "auth", "account", {
      name: "testing_center_report_submit_admitted",
      payload: { ...payload, p_account: account },
    }]);
  }
});
Deno.test("1709: rich shapes reject identity spoofing, prose, diagnostics and invalid batches after admission", async () => {
  for (
    const change of [
      { p_account: account },
      { p_ip: "192.0.2.1" },
      { p_batch_id: null },
      { p_batch_id: "invalid" },
      { p_action_text: "private tester prose" },
      { p_context_text: "private context" },
      { p_include_diagnostic: true },
      { p_include_logs: true },
      { p_diagnostic_payload: "{}" },
      { p_diagnostic_digest: "a".repeat(64) },
      { p_channel: "master" },
      { p_contract_version: "unknown" },
      { p_idempotency_key: "invalid" },
      { p_module: ["hub"] },
      { p_os_version: "x".repeat(65) },
    ]
  ) {
    const f = fixture();
    eq(
      (await handleTestingReportSubmit(request({ ...body, ...change }), f.deps))
        .status,
      400,
    );
    eq(f.calls, ["ip", "auth", "account"]);
  }
});
Deno.test("1709: rich and existing forms exhaust the same IP/account budget; retries consume admission", async () => {
  const f = fixture();
  const counts = new Map<string, number>();
  f.deps.admit = (scope, key) => {
    const id = scope + key;
    const n = (counts.get(id) ?? 0) + 1;
    counts.set(id, n);
    return Promise.resolve(n <= 5);
  };
  f.deps.submit = () => Promise.resolve();
  const simple = {
    p_id: account,
    p_channel: "master",
    p_title: "Synthetic",
    p_body: "Synthetic",
    p_consent: true,
  };
  for (let i = 0; i < 5; i++) {
    eq(
      (await handleTestingReportSubmit(request(i % 2 ? simple : body), f.deps))
        .status,
      200,
    );
  }
  eq(
    (await handleTestingReportSubmit(
      request({ ...body, p_batch_id: batch }),
      f.deps,
    )).status,
    429,
  );
});
Deno.test("1709: exhausted account quota never reaches rich SQL", async () => {
  const f = fixture();
  f.deps.admit = (scope) => Promise.resolve(scope !== "account");
  eq((await handleTestingReportSubmit(request(body), f.deps)).status, 429);
  eq(f.calls, ["auth"]);
});
Deno.test("1709: stable SQL failures preserve pending evidence, membership and conflict semantics", async () => {
  for (
    const [code, status, error] of [
      ["55000", 400, "evidence_not_ready"],
      ["42501", 403, "submit_failed"],
      ["28000", 401, "submit_failed"],
      ["23505", 409, "submit_failed"],
      ["22023", 400, "submit_failed"],
      ["54000", 429, "submit_failed"],
      ["unknown", 503, "submit_failed"],
    ] as const
  ) {
    const f = fixture();
    f.deps.rpc = () => Promise.resolve({ error: { code } });
    const response = await handleTestingReportSubmit(
      request({ ...body, p_batch_id: batch }),
      f.deps,
    );
    eq(response.status, status);
    eq(await response.json(), { error });
  }
});
Deno.test("1709: malformed or expanded SQL receipt fails closed without forwarding data", async () => {
  for (
    const data of [null, [], [...receipt, ...receipt], [{
      ...receipt[0],
      private_payload: "private",
    }], [{ ...receipt[0], report_id: "invalid" }]]
  ) {
    const f = fixture();
    f.deps.rpc = () => Promise.resolve({ data, error: null });
    const response = await handleTestingReportSubmit(request(body), f.deps);
    eq(response.status, 503);
    eq(await response.json(), { error: "submit_unavailable" });
  }
});
