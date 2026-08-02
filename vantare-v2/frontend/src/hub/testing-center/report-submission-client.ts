import { getSupabaseClient } from "../../lib/supabase-auth";
import {
  TestingCenterContractError,
  decodeSubmittedReport,
  type PreparedReportDiagnostic,
  type ReportDraftFields,
  type SubmittedReport,
  type TestingCenterChannel,
} from "./contracts";
import { TestingCenterClientError } from "./testing-center-client";

export type SubmitReportInput = {
  channel: TestingCenterChannel;
  fields: ReportDraftFields;
  appVersion: string;
  osVersion: string;
  includeDiagnostic: boolean;
  includeLogs: boolean;
  diagnostic: PreparedReportDiagnostic | null;
  idempotencyKey: string;
};

export async function submitTestingCenterReport(input: SubmitReportInput): Promise<SubmittedReport> {
  const { data, error } = await getSupabaseClient().rpc("testing_center_submit_report", {
    p_contract_version: "testing-center.v1",
    p_channel: input.channel,
    p_action_text: input.fields.actionText.trim(),
    p_expected_text: input.fields.expectedText.trim(),
    p_observed_text: input.fields.observedText.trim(),
    p_context_text: input.fields.contextText.trim(),
    p_app_version: input.appVersion,
    p_os_family: "windows",
    p_os_version: input.osVersion,
    p_module: input.fields.module,
    p_include_diagnostic: input.includeDiagnostic,
    p_include_logs: input.includeLogs,
    p_diagnostic_payload: input.includeDiagnostic ? input.diagnostic?.preview.payload ?? null : null,
    p_diagnostic_digest: input.includeDiagnostic ? input.diagnostic?.preview.sha256 ?? null : null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    const known = [
      "testing_center_auth_required", "testing_center_membership_required",
      "testing_center_nightly_role_required", "testing_center_testers_role_required",
      "testing_center_idempotency_conflict",
    ].find((code) => error.message.includes(code));
    throw new TestingCenterClientError(known ?? "submission_failed");
  }
  if (!Array.isArray(data) || data.length !== 1) {
    throw new TestingCenterContractError("report submission result is invalid");
  }
  return decodeSubmittedReport(data[0]);
}
