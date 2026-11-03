import { NativeError } from "../_shared/native-auth.ts";
import { isUuid } from "../_shared/request.ts";

type RpcResult = { data?: unknown; error: { code?: string } | null };
export type ReportV2Rpc = (
  name: string,
  body: Record<string, unknown>,
) => PromiseLike<RpcResult>;

const baseFields = [
  "contract_version",
  "report_id",
  "channel",
  "title",
  "body",
  "consent",
  "idempotency_key",
  "variant",
];

function hasNul(value: unknown): boolean {
  if (typeof value === "string") return value.includes("\u0000");
  if (Array.isArray(value)) return value.some(hasNul);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([key, child]) =>
      key.includes("\u0000") || hasNul(child)
    );
  }
  return false;
}

export function validateReportV2(body: Record<string, unknown>): void {
  const extra = body.variant === "triage"
    ? ["context", "attachments"]
    : body.variant === "diagnostic"
    ? ["context"]
    : [];
  const fields = [...baseFields, ...extra].sort();
  const actual = Object.keys(body).sort();
  const text = (value: unknown, max: number) =>
    typeof value === "string" && value.trim().length > 0 &&
    [...value].length <= max &&
    new TextEncoder().encode(value).length <= max * 4;
  const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const context = body.context;
  const consent = record(context) ? context.consent : undefined;
  if (
    JSON.stringify(actual) !== JSON.stringify(fields) ||
    hasNul(body) ||
    new TextEncoder().encode(JSON.stringify(body)).length > 64 * 1024 ||
    body.contract_version !== "testing.report.v2" ||
    !isUuid(body.report_id) ||
    !["nightly", "testers", "master"].includes(body.channel as string) ||
    !["simple", "triage", "diagnostic"].includes(body.variant as string) ||
    !text(body.title, 120) || !text(body.body, 1000) ||
    body.consent !== true ||
    typeof body.idempotency_key !== "string" ||
    !/^draft_[0-9a-f]{64}$/.test(body.idempotency_key) ||
    (body.context !== undefined &&
      (body.context === null || typeof body.context !== "object" ||
        Array.isArray(body.context) ||
        new TextEncoder().encode(JSON.stringify(body.context)).length >
          (body.variant === "diagnostic" ? 4096 : 48 * 1024))) ||
    (body.variant === "diagnostic" && record(context) &&
      Object.entries(context).some(([key, value]) =>
        !["app_version", "os_family", "os_version", "module"].includes(key) ||
        typeof value !== "string"
      )) ||
    (body.variant === "triage" && record(context) &&
      Object.keys(context).some((key) =>
        ![
          "app_version",
          "app_channel",
          "game",
          "game_version",
          "system",
          "telemetry_summary",
          "posthog_session_id",
          "consent",
        ].includes(key)
      )) ||
    (body.variant === "triage" && record(consent) &&
      Object.keys(consent).some((key) =>
        !["version", "items", "accepted_at"].includes(key)
      )) ||
    (body.attachments !== undefined &&
      (!Array.isArray(body.attachments) || body.attachments.length > 2)) ||
    (body.variant === "triage" &&
      (!record(context) || !record(consent) ||
        body.title !== "[contenido retirado por privacidad]" ||
        body.body !== "[contenido retirado por privacidad]" ||
        context.app_channel !== body.channel ||
        consent.version !== "triage-v2" ||
        !Array.isArray(consent.items) ||
        typeof consent.accepted_at !== "string"))
  ) throw new NativeError(400, "invalid_request");
}

export async function submitReportV2(
  account: string,
  body: Record<string, unknown>,
  rpc: ReportV2Rpc,
): Promise<unknown> {
  validateReportV2(body);
  const { data, error } = await rpc("testing_report_v2_submit_admitted", {
    p_account: account,
    p_report: body,
  });
  if (error) {
    throw new NativeError(
      error.code === "28000"
        ? 401
        : error.code === "42501"
        ? 403
        : error.code === "23505"
        ? 409
        : error.code?.startsWith("22") || error.code === "23514"
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
    !isUuid(receipt.report_id) ||
    receipt.report_state !== "received" ||
    typeof receipt.idempotent !== "boolean" ||
    typeof receipt.created_at !== "string" ||
    !Number.isFinite(Date.parse(receipt.created_at))
  ) throw new NativeError(503, "submit_unavailable");
  return data;
}
