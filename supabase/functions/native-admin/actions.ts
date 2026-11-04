import { NativeError } from "../_shared/native-auth.ts";
import { isUuid } from "../_shared/request.ts";
import { MODULE_CAPABILITIES } from "../_shared/license-credential.ts";
type Params = Record<string, unknown>;
type ActionSpec = readonly [
  kind: "read" | "write" | "destructive" | "bulk",
  fields: readonly string[],
  validate: (params: Params) => boolean,
  sandboxOnly?: true,
];
export const REPORT_STATUSES = [
  "draft",
  "submitted",
  "validated",
  "duplicate_linked",
  "incomplete",
  "closed",
  "in_review",
  "rejected",
  "fixed",
  "spam",
] as const;
export const MAIL_LOCALES = ["es", "en", "it", "pt-BR"] as const;
export const MAIL_GROUPS = [
  "free",
  "pro",
  "pro_plus",
  "launch",
  "testers",
  "creators",
  "waitlist",
] as const;
export const MAIL_TEMPLATES = ["news", "offer", "launch"];
function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 &&
    value === value.trim() && new TextEncoder().encode(value).length <= max;
}
export function mailContent(
  value: unknown,
): value is Record<string, { subject: string; body: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const content = value as Params;
  return Object.keys(content).length === 4 && MAIL_LOCALES.every((locale) => {
    const item = content[locale] as Params | undefined;
    return !!(item && typeof item === "object" &&
      Object.keys(item).length === 2 && typeof item.subject === "string" &&
      item.subject.length <= 200 && !/[\r\n]/.test(item.subject) &&
      typeof item.body === "string" && item.body.length <= 12000);
  });
}
const campaign = (p: Params) =>
  isUuid(p.campaign_id) && Number.isSafeInteger(p.revision) &&
  Number(p.revision) >= 1;
export const ACTIONS: Readonly<Record<string, ActionSpec>> = {
  search_accounts: ["read", ["query", "limit", "cursor"], (params) => {
    if (params.limit === undefined) params.limit = 50;
    return (params.query === "" || boundedText(params.query, 200)) &&
      (params.cursor === undefined ||
        (params.query === "" && isUuid(params.cursor))) &&
      Number.isInteger(params.limit) && Number(params.limit) >= 1 &&
      Number(params.limit) <= 50;
  }],
  get_account: [
    "read",
    ["account_id"],
    (params) => (isUuid(params.account_id)),
  ],
  set_blocked: [
    "destructive",
    ["account_id", "blocked", "reason"],
    (params) => (isUuid(params.account_id) &&
      typeof params.blocked === "boolean" &&
      (params.reason === undefined || boundedText(params.reason, 200))),
    true,
  ],
  delete_account: [
    "destructive",
    ["account_id", "confirm_email"],
    (params) => (isUuid(params.account_id) &&
      boundedText(params.confirm_email, 320)),
    true,
  ],
  set_tester: [
    "write",
    ["account_id", "enabled"],
    (
      params,
    ) => (isUuid(params.account_id) && typeof params.enabled === "boolean"),
  ],
  set_module: [
    "write",
    ["account_id", "module", "enabled"],
    (params) => (isUuid(params.account_id) &&
      typeof params.enabled === "boolean" &&
      MODULE_CAPABILITIES.includes(
        params.module as typeof MODULE_CAPABILITIES[number],
      )),
  ],
  list_creators: ["read", [], () => true],
  get_creator: [
    "read",
    ["creator_id"],
    (params) => (isUuid(params.creator_id)),
  ],
  record_creator_payout: [
    "write",
    ["creator_id", "amount_cents", "paid_at"],
    (params) => (isUuid(params.creator_id) &&
      Number.isSafeInteger(params.amount_cents) &&
      Number(params.amount_cents) > 0 &&
      (params.paid_at === undefined ||
        (boundedText(params.paid_at, 40) &&
          Number.isFinite(Date.parse(String(params.paid_at)))))),
  ],
  create_creator: [
    "write",
    ["name", "email", "code"],
    (params) => (boundedText(params.name, 120) &&
      boundedText(params.email, 320) &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(params.email)) &&
      typeof params.code === "string" &&
      /^[A-Z0-9]{3,32}$/.test(params.code)),
    true,
  ],
  get_rollout: ["read", [], () => true],
  set_rollout: [
    "write",
    ["module", "enabled_for_all"],
    (params) => (typeof params.enabled_for_all === "boolean" &&
      MODULE_CAPABILITIES.includes(
        params.module as typeof MODULE_CAPABILITIES[number],
      )),
  ],
  list_reports: ["read", ["status", "limit", "cursor"], (params) => {
    if (params.limit === undefined) params.limit = 100;
    return Number.isInteger(params.limit) && Number(params.limit) >= 1 &&
      Number(params.limit) <= 100 &&
      (params.status === undefined ||
        REPORT_STATUSES.includes(
          params.status as typeof REPORT_STATUSES[number],
        )) &&
      (params.cursor === undefined || boundedText(params.cursor, 256));
  }],
  get_report: [
    "read",
    ["report_id"],
    (params) => (boundedText(params.report_id, 256)),
  ],
  set_report_status: ["write", [
    "report_id",
    "status",
    "fixed_in_version",
    "reason",
  ], (params) => (boundedText(params.report_id, 256) &&
    REPORT_STATUSES.includes(
      params.status as typeof REPORT_STATUSES[number],
    ) &&
    (params.reason === undefined || boundedText(params.reason, 500)) &&
    (![
      "validated",
      "rejected",
      "spam",
      "closed",
      "duplicate_linked",
      "incomplete",
    ].includes(String(params.status)) ||
      boundedText(params.reason, 500)) &&
    (params.fixed_in_version === undefined ||
      (boundedText(params.fixed_in_version, 60) &&
        /^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.-]+)?$/.test(
          String(params.fixed_in_version),
        ))) &&
    (params.status !== "fixed" || params.fixed_in_version !== undefined))],
  mail_forget_waitlist: [
    "destructive",
    ["email", "confirm"],
    (p) =>
      p.confirm === true && typeof p.email === "string" &&
      p.email.length <= 320 && /^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(p.email),
  ],
  mail_cleanup: ["destructive", [], () => true],
  mail_list: ["read", [], () => true],
  mail_new: ["write", [], () => true],
  mail_get: ["read", ["campaign_id"], (p) => isUuid(p.campaign_id)],
  mail_save: [
    "write",
    ["campaign_id", "revision", "name", "template", "target_group", "content"],
    (p) =>
      campaign(p) && mailContent(p.content) && typeof p.name === "string" &&
      !!p.name.trim() && p.name.length <= 120 &&
      MAIL_GROUPS.includes(
        String(p.target_group) as typeof MAIL_GROUPS[number],
      ) && MAIL_TEMPLATES.includes(String(p.template)),
  ],
  mail_approve: [
    "bulk",
    ["campaign_id", "revision", "confirm"],
    (p) => campaign(p) && p.confirm === true,
  ],
  mail_send_batch: ["bulk", ["campaign_id", "revision"], campaign],
  mail_draft: [
    "write",
    ["campaign_id", "revision", "brief", "template"],
    (p) =>
      campaign(p) && typeof p.brief === "string" && !!p.brief.trim() &&
      p.brief.length <= 4000 && MAIL_TEMPLATES.includes(String(p.template)),
  ],
  mail_sync: [
    "bulk",
    ["cursor"],
    (p) => p.cursor === undefined || isUuid(p.cursor),
  ],
};
function validateAction(action: string, params: Params): void {
  if (!Object.hasOwn(ACTIONS, action)) {
    throw new NativeError(400, "invalid_request");
  }
  const [, fields, validate] = ACTIONS[action];
  if (
    Object.keys(params).some((key) => !fields.includes(key)) ||
    !validate(params)
  ) throw new NativeError(400, "invalid_request");
}
export function validateAdminRequest(
  body: Params,
): { action: string; params: Params } {
  const { version, action, ...params } = body;
  if (version !== 1 || typeof action !== "string") {
    throw new NativeError(400, "invalid_request");
  }
  validateAction(action, params);
  return { action, params };
}
export function validateMail(action: string, params: Params): void {
  if (!action.startsWith("mail_")) {
    throw new NativeError(400, "invalid_request");
  }
  validateAction(action, params);
}
export function assertAdminEnvironment(
  action: string,
  environment: string,
): void {
  if (!Object.hasOwn(ACTIONS, action)) {
    throw new NativeError(400, "invalid_request");
  }
  if (ACTIONS[action][3] && environment !== "sandbox") {
    throw new NativeError(503, "admin_sandbox_required");
  }
}
export function actionContract() {
  return {
    version: 1,
    modules: MODULE_CAPABILITIES,
    statuses: REPORT_STATUSES,
    actions: Object.fromEntries(
      Object.entries(ACTIONS).map((
        [name, [kind, fields, , sandboxOnly]],
      ) => [name, {
        kind,
        fields,
        environment: sandboxOnly ? "sandbox" : "both",
      }]),
    ),
  };
}

if (import.meta.main) console.log(JSON.stringify(actionContract(), null, 2));
