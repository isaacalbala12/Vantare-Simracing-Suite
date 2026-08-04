import {
  createTestingCenterLinearPilotStore,
  type TestingCenterLinearRpcClient,
} from "./testing-center-linear-supabase-store.ts";
import {
  buildTestingCenterLinearIssueProjection,
  TESTING_CENTER_LINEAR_PROJECTION_VERSION,
} from "./testing-center-linear-projection.ts";

const effectId = `effect_${"1".repeat(64)}`;
const reportId = `report_${"2".repeat(64)}`;

async function projection() {
  return await buildTestingCenterLinearIssueProjection({
    contractVersion: TESTING_CENTER_LINEAR_PROJECTION_VERSION,
    effectId,
    technicalIssueId: `issue_${"3".repeat(64)}`,
    sourceDigest: "4".repeat(64),
    occurrenceCount: 1,
    replayAvailable: false,
    report: {
      reportId,
      channel: "nightly",
      appVersion: "0.1.0-nightly",
      osFamily: "windows",
      osVersion: "Windows 11",
      module: "testing_center",
      actionText: "Abrir el Testing Center",
      expectedText: "Ver una candidatura",
      observedText: "La lista aparece vacía",
      contextText: null,
      errorCode: null,
      candidateSha: "5".repeat(40),
    },
  });
}

Deno.test("Supabase adapter uses only reviewed pilot RPCs and exact fencing", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client: TestingCenterLinearRpcClient = {
    rpc(name, args) {
      calls.push({ name, args });
      const data = name === "testing_center_triage_report"
        ? [{ result_effect_id: effectId }]
        : name === "testing_center_prepare_linear_projection"
        ? [{
          preparation_status: "prepared",
          prepared_source_snapshot: { effectId },
          prepared_source_digest: "4".repeat(64),
        }]
        : name === "testing_center_claim_linear_effect"
        ? [{ claim_status: "claimed", fencing_token: 7 }]
        : null;
      return Promise.resolve({ data, error: null });
    },
  };
  const store = createTestingCenterLinearPilotStore(client);
  await store.triage(reportId);
  await store.prepare(effectId);
  await store.claim(effectId, "isa243-linear-pilot");
  const built = await projection();
  const canonicalProjection = JSON.stringify({ test: true });
  await store.assertDispatch({
    projection: built,
    canonicalProjection,
    workerId: "isa243-linear-pilot",
    fencingToken: 7,
  });
  await store.retry(
    effectId,
    "isa243-linear-pilot",
    7,
    built.projectionDigest,
  );
  await store.complete({
    projection: built,
    workerId: "isa243-linear-pilot",
    fencingToken: 7,
    issue: {
      externalIssueId: "10000000-0000-4000-8000-000000000001",
      organizationId: "10000000-0000-4000-8000-000000000002",
      identifier: "ISA-999",
      url: "https://linear.app/vantareapp/issue/ISA-999/testing-center",
    },
  });
  await store.ambiguous(effectId, "isa243-linear-pilot", 7);

  const names = calls.map((call) => call.name);
  const expected = [
    "testing_center_triage_report",
    "testing_center_prepare_linear_projection",
    "testing_center_claim_linear_effect",
    "testing_center_assert_linear_dispatch",
    "testing_center_retry_linear_pilot_token",
    "testing_center_complete_linear_pilot",
    "testing_center_record_linear_ambiguity",
  ];
  if (names.join(",") !== expected.join(",")) {
    throw new Error(`unexpected RPC surface: ${names.join(",")}`);
  }
  const claim = calls[2].args;
  const retry = calls[4].args;
  const complete = calls[5].args;
  if (
    claim.p_lease_seconds !== 300 ||
    claim.p_worker_id !== "isa243-linear-pilot" ||
    retry.p_fencing_token !== 7 ||
    retry.p_projection_digest !== built.projectionDigest ||
    complete.p_fencing_token !== 7 ||
    complete.p_external_identifier !== "ISA-999"
  ) {
    throw new Error(
      "worker identity, fencing or external result was not pinned",
    );
  }
});

Deno.test("Supabase adapter rejects malformed RPC result before advancing", async () => {
  const store = createTestingCenterLinearPilotStore({
    rpc: () => Promise.resolve({ data: [], error: null }),
  });
  let failed = false;
  try {
    await store.triage(reportId);
  } catch {
    failed = true;
  }
  if (!failed) throw new Error("malformed RPC result was accepted");
});
