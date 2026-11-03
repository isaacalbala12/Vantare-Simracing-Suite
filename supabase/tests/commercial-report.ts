// Real Edge handler + ES256 verification + PostgREST/SQL, loopback fixtures only.
import {
  handleTestingReportSubmit,
  type SubmitDeps,
} from "../functions/testing-report-submit/index.ts";
import { verifyBridgeAccount } from "../functions/_shared/native-data.ts";
import { NativeError } from "../functions/_shared/native-auth.ts";
import payload from "./fixtures/native-hub-report.json" with { type: "json" };
import { fixtureRpc } from "./fixtures/postgrest-rpc.ts";

const [base, account, mode = "live"] = Deno.args;
const url = new URL(base);
if (url.hostname !== "127.0.0.1" || url.protocol !== "http:") {
  throw new Error("loopback_only");
}
const input = await new Response(Deno.stdin.readable).text();
if (input.length > 32768) throw new Error("fixture_too_large");
const fixture = JSON.parse(input);
const rpc = fixtureRpc(base, fixture.serviceToken);
const deps: SubmitDeps = {
  salt: "synthetic-loopback-report-admission-salt-1709",
  account: async (request) => {
    const identity = await verifyBridgeAccount(request, new Date(), {
      publicJwk: JSON.stringify(fixture.publicJwk),
      url: "http://127.0.0.1:54321",
      issuer: "https://fixture.clerk.invalid",
    });
    const resolved = await rpc("native_resolve_account", {
      issuer: "https://fixture.clerk.invalid",
      subject: identity.subject,
    });
    if (resolved.error || resolved.data !== identity.account) {
      throw new NativeError(401, "unauthorized");
    }
    return identity.account;
  },
  admit: async (scope, subject, week, key, digest) => {
    const result = await rpc(
      scope === "ip" ? "testing_report_admit" : "testing_report_admit_account",
      scope === "ip"
        ? { p_scope: scope, p_subject: subject, p_week: week }
        : { p_account: subject, p_key: key, p_digest: digest, p_week: week },
    );
    if (result.error?.code === "23505") {
      throw new NativeError(409, "submit_failed");
    }
    if (result.error?.code === "28000") {
      throw new NativeError(401, "unauthorized");
    }
    if (result.error || typeof result.data !== "boolean") {
      throw new NativeError(503, "admission_unavailable");
    }
    return result.data;
  },
  rpc,
};
async function submit(body: unknown, ip = "192.0.2.170") {
  return await handleTestingReportSubmit(
    new Request("http://localhost/functions/v1/testing-report-submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": ip,
        authorization: `Bearer ${fixture.nativeToken}`,
      },
      body: JSON.stringify(body),
    }),
    deps,
  );
}
async function receipt(response: Response) {
  if (response.status !== 200) {
    const failure = await response.json();
    const code =
      ["invalid_request", "submit_failed", "evidence_not_ready"].includes(
          failure.error,
        )
        ? failure.error
        : "unknown";
    throw new Error(`report_status_${response.status}_${code}`);
  }
  const rows = await response.json();
  if (
    !Array.isArray(rows) || rows.length !== 1 ||
    rows[0].report_state !== "received"
  ) {
    throw new Error("receipt_required");
  }
  return rows[0];
}
if (mode === "deleted") {
  const response = await submit(payload, "192.0.2.171");
  if (response.status !== 401) {
    throw new Error(`deleted_status_${response.status}`);
  }
  await response.body?.cancel();
  console.log("same ES256 bearer through Edge after tombstone denied PASS");
} else {
  const first = await receipt(await submit(payload));
  const retry = await receipt(await submit(payload));
  if (
    first.idempotent || !retry.idempotent || first.report_id !== retry.report_id
  ) {
    throw new Error("durable_retry_changed");
  }
  const injected = await submit({ ...payload, p_account: account });
  if (injected.status !== 400) throw new Error("client_identity_not_rejected");
  await injected.body?.cancel();
  const triage = await receipt(
    await submit({
      ...payload,
      report_id: "17090000-0000-4000-8000-000000000021",
      idempotency_key: "draft_" + "e".repeat(64),
      variant: "triage",
      title: "[contenido retirado por privacidad]",
      body: "[contenido retirado por privacidad]",
      context: {
        app_version: "1.2.3",
        app_channel: "testers",
        game: "none",
        system: {},
        consent: {
          version: "triage-v2",
          items: [],
          accepted_at: new Date().toISOString(),
        },
      },
      attachments: [],
    }),
  );
  if (triage.idempotent || triage.report_id === first.report_id) {
    throw new Error("triage_report_not_separate");
  }
  const simple = await submit({
    contract_version: "testing.report.v2",
    report_id: "17090000-0000-4000-8000-000000000030",
    channel: "master",
    title: "Synthetic",
    body: "Synthetic",
    consent: true,
    idempotency_key: "draft_" + "1".repeat(64),
    variant: "simple",
  });
  if (simple.status !== 200) throw new Error(`simple_status_${simple.status}`);
  await simple.body?.cancel();
  await receipt(await submit(payload));
  for (const suffix of ["031", "032"]) {
    const admitted = await submit({
      contract_version: "testing.report.v2",
      report_id: `17090000-0000-4000-8000-000000000${suffix}`,
      channel: "master",
      title: "Synthetic",
      body: "Synthetic",
      consent: true,
      idempotency_key: `draft_${suffix.padStart(64, "0")}`,
      variant: "simple",
    });
    if (admitted.status !== 200) {
      throw new Error(`new_report_status_${admitted.status}`);
    }
    await admitted.body?.cancel();
  }
  const exhausted = await submit({
    contract_version: "testing.report.v2",
    report_id: "17090000-0000-4000-8000-000000000033",
    channel: "master",
    title: "Synthetic",
    body: "Synthetic",
    consent: true,
    idempotency_key: "draft_" + "3".repeat(64),
    variant: "simple",
  });
  if (exhausted.status !== 429) throw new Error("account_quota_not_exhausted");
  await exhausted.body?.cancel();
  console.log(
    JSON.stringify({
      report_id: first.report_id,
      triage_report_id: triage.report_id,
    }),
  );
}
