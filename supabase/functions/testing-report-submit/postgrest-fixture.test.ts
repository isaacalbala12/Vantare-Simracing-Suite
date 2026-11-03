import { handleTestingReportSubmit } from "./index.ts";
import { fixtureRpc } from "../../tests/fixtures/postgrest-rpc.ts";

const account = "17090000-0000-4000-8000-000000000001";
const report = {
  contract_version: "testing.report.v2",
  report_id: "17090000-0000-4000-8000-000000000002",
  channel: "master",
  title: "Synthetic",
  body: "Synthetic",
  consent: true,
  idempotency_key: `draft_${"a".repeat(64)}`,
  variant: "simple",
};
const receipt = [{
  report_id: report.report_id,
  report_state: "received",
  idempotent: true,
  created_at: "2026-10-19T00:00:00Z",
}];
const deps = {
  account: () => Promise.resolve(account),
  admit: () => Promise.resolve(true),
};
function request(body: unknown = report) {
  return new Request("http://localhost/functions/v1/testing-report-submit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "192.0.2.10",
    },
    body: JSON.stringify(body),
  });
}
function eq(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("assertion failed");
  }
}
Deno.test("v2 PostgREST transport sends one account-owned body and keeps the receipt", async () => {
  let calls = 0;
  const rpc = fixtureRpc(
    "http://127.0.0.1:54321",
    "synthetic-service-bearer",
    (input, init) => {
      calls++;
      eq(
        String(input),
        "http://127.0.0.1:54321/rpc/testing_report_v2_submit_admitted",
      );
      if (!init || !("body" in init)) throw new Error("request_body_required");
      eq(JSON.parse(String(init.body)), {
        p_account: account,
        p_report: report,
      });
      return Promise.resolve(Response.json(receipt));
    },
  );
  const response = await handleTestingReportSubmit(request(), { ...deps, rpc });
  eq(response.status, 200);
  eq(await response.json(), receipt);
  eq(calls, 1);
});
Deno.test("v2 rejects a void PostgREST success without a receipt", async () => {
  const rpc = fixtureRpc(
    "http://127.0.0.1:54321",
    "synthetic-service-bearer",
    () => Promise.resolve(new Response(null, { status: 204 })),
  );
  const response = await handleTestingReportSubmit(request(), { ...deps, rpc });
  eq(response.status, 503);
});
Deno.test("v2 transport preserves SQL permission denial", async () => {
  const rpc = fixtureRpc(
    "http://127.0.0.1:54321",
    "synthetic-service-bearer",
    () => Promise.resolve(Response.json({ code: "42501" }, { status: 403 })),
  );
  const response = await handleTestingReportSubmit(request(), { ...deps, rpc });
  eq(response.status, 403);
});
