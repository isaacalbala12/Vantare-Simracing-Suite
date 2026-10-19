import { handleTestingReportSubmit } from "./index.ts";
import { fixtureRpc } from "../../tests/fixtures/postgrest-rpc.ts";
import rich from "../../tests/fixtures/native-hub-report.json" with {
  type: "json",
};

const account = "17090000-0000-4000-8000-000000000001";
function request(body: unknown) {
  return new Request("http://localhost/functions/v1/testing-report-submit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "192.0.2.10",
    },
    body: JSON.stringify(body),
  });
}
const deps = {
  salt: "synthetic-fixture-admission-salt-only-32-characters",
  account: () => Promise.resolve(account),
  admit: () => Promise.resolve(true),
};
function eq(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("assertion failed");
  }
}
Deno.test("1709: successful PostgREST void 204 crosses real fixture transport and Edge as 200", async () => {
  let calls = 0;
  const rpc = fixtureRpc(
    "http://127.0.0.1:54321",
    "synthetic-service-bearer",
    (input, init) => {
      calls++;
      eq(
        String(input),
        "http://127.0.0.1:54321/rpc/testing_report_submit_admitted",
      );
      if (!init || !("body" in init)) throw new Error("request_body_required");
      eq(JSON.parse(String(init.body)).p_account, account);
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  );
  const response = await handleTestingReportSubmit(
    request({
      p_id: account,
      p_channel: "master",
      p_title: "Synthetic",
      p_body: "Synthetic",
      p_consent: true,
    }),
    { ...deps, rpc },
  );
  if (response.status !== 200) {
    throw new Error(`void_write_became_${response.status}`);
  }
  eq(await response.json(), null);
  eq(calls, 1);
});
Deno.test("1709: real fixture transport preserves a rich JSON receipt through Edge", async () => {
  const receipt = [{
    report_id: "report_" + "b".repeat(64),
    report_state: "submitted",
    idempotent: true,
    created_at: "2026-10-19T00:00:00Z",
  }];
  const rpc = fixtureRpc(
    "http://127.0.0.1:54321",
    "synthetic-service-bearer",
    () => Promise.resolve(Response.json(receipt)),
  );
  const response = await handleTestingReportSubmit(request(rich), {
    ...deps,
    rpc,
  });
  eq(response.status, 200);
  eq(await response.json(), receipt);
});
Deno.test("1709: real fixture transport retains SQL permission errors rather than hiding them as success", async () => {
  const rpc = fixtureRpc(
    "http://127.0.0.1:54321",
    "synthetic-service-bearer",
    () => Promise.resolve(Response.json({ code: "42501" }, { status: 403 })),
  );
  eq(await rpc("testing_report_submit_admitted", {}), {
    data: null,
    error: { code: "42501" },
  });
});
