import { NativeError } from "../_shared/native-auth.ts";
import { isUuid } from "../_shared/request.ts";

type RpcResult = {
  data?: unknown;
  error: { code?: string } | null;
};
export type ReportRpc = (
  name: string,
  body: Record<string, unknown>,
) => PromiseLike<RpcResult>;

// The Hub's existing consented, durable report envelope. This is a closed
// alternative to the simple/triage forms, never an arbitrary RPC proxy.
export async function submitRichReport(
  account: string,
  body: Record<string, unknown>,
  rpc: ReportRpc,
): Promise<unknown> {
  const fields = [
    "p_contract_version",
    "p_channel",
    "p_action_text",
    "p_expected_text",
    "p_observed_text",
    "p_context_text",
    "p_app_version",
    "p_os_family",
    "p_os_version",
    "p_module",
    "p_include_diagnostic",
    "p_include_logs",
    "p_diagnostic_payload",
    "p_diagnostic_digest",
    "p_idempotency_key",
  ];
  if (Object.hasOwn(body, "p_batch_id")) fields.push("p_batch_id");
  const pattern = (value: unknown, regex: RegExp) =>
    typeof value === "string" && regex.test(value);
  if (
    Object.keys(body).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(body, field)) ||
    new TextEncoder().encode(JSON.stringify(body)).length > 8192 ||
    body.p_contract_version !== "testing-center.v1" ||
    typeof body.p_channel !== "string" ||
    !["nightly", "testers"].includes(body.p_channel) ||
    body.p_action_text !== "Informe estructurado" ||
    body.p_expected_text !== "Revisión humana pendiente" ||
    body.p_observed_text !== "Revisión humana pendiente" ||
    body.p_context_text !== "" || body.p_include_diagnostic !== false ||
    body.p_include_logs !== false || body.p_diagnostic_payload !== null ||
    body.p_diagnostic_digest !== null || body.p_os_family !== "windows" ||
    !pattern(body.p_app_version, /^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/) ||
    !pattern(body.p_os_version, /^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,63}$/) ||
    !pattern(body.p_idempotency_key, /^draft_[0-9a-f]{64}$/) ||
    typeof body.p_module !== "string" || ![
      "hub",
      "launcher",
      "settings",
      "overlay_studio",
      "overlay_runtime",
      "telemetry",
      "telemetry_analysis",
      "engineer",
      "strategy",
      "calendar",
      "billing",
      "account",
      "updater",
      "testing_center",
      "unknown",
    ].includes(body.p_module) ||
    (Object.hasOwn(body, "p_batch_id") && !isUuid(body.p_batch_id))
  ) throw new NativeError(400, "invalid_request");

  const { data, error } = await rpc("testing_center_report_submit_admitted", {
    ...body,
    p_account: account,
  });
  if (error) {
    // Only stable public codes; never forward upstream SQL text or payloads.
    if (error.code === "55000") {
      throw new NativeError(400, "evidence_not_ready");
    }
    throw new NativeError(
      error.code === "42501"
        ? 403
        : error.code === "28000"
        ? 401
        : error.code === "23505"
        ? 409
        : error.code === "22023"
        ? 400
        : error.code === "54000"
        ? 429
        : 503,
      "submit_failed",
    );
  }
  if (!Array.isArray(data) || data.length !== 1) {
    throw new NativeError(503, "submit_unavailable");
  }
  const receipt = data[0];
  if (
    !receipt || typeof receipt !== "object" ||
    Object.keys(receipt).sort().join(",") !==
      "created_at,idempotent,report_id,report_state" ||
    !pattern(receipt.report_id, /^report_[0-9a-f]{64}$/) ||
    receipt.report_state !== "submitted" ||
    typeof receipt.idempotent !== "boolean" ||
    typeof receipt.created_at !== "string" || receipt.created_at.length > 64 ||
    !Number.isFinite(Date.parse(receipt.created_at))
  ) throw new NativeError(503, "submit_unavailable");
  return data;
}
