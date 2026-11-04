import { NativeError } from "../_shared/native-auth.ts";
import { isUuid } from "../_shared/request.ts";
import { MODULE_CAPABILITIES } from "../_shared/license-credential.ts";
type Params = Record<string, unknown>;
type ActionPolicy = {
  mail?: "sql" | "edge";
  syncPayments?: boolean;
  enrich?: boolean;
  sandbox?: boolean;
  handler?: "creator" | "account";
};
type ActionSpec = readonly [
  mutation: boolean,
  fields: readonly string[],
  validate: (params: Params) => boolean,
  policy?: ActionPolicy,
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
  search_accounts: [false, ["query", "limit", "cursor"], (p) => {
    if (p.limit === undefined) p.limit = 50;
    return (p.query === "" || boundedText(p.query, 200)) &&
      (p.cursor === undefined ||
        (p.query === "" && isUuid(p.cursor))) &&
      Number.isInteger(p.limit) && Number(p.limit) >= 1 &&
      Number(p.limit) <= 50;
  }, { enrich: true }],
  get_account: [
    false,
    ["account_id"],
    (p) => isUuid(p.account_id),
    { syncPayments: true, enrich: true },
  ],
  set_blocked: [
    true,
    ["account_id", "blocked", "reason"],
    (p) =>
      isUuid(p.account_id) &&
      typeof p.blocked === "boolean" &&
      (p.reason === undefined || boundedText(p.reason, 200)),
    { sandbox: true, handler: "account" },
  ],
  delete_account: [
    true,
    ["account_id", "confirm_email"],
    (p) =>
      isUuid(p.account_id) &&
      boundedText(p.confirm_email, 320),
    { sandbox: true, handler: "account" },
  ],
  set_tester: [
    true,
    ["account_id", "enabled"],
    (p) => isUuid(p.account_id) && typeof p.enabled === "boolean",
  ],
  set_module: [
    true,
    ["account_id", "module", "enabled"],
    (p) =>
      isUuid(p.account_id) &&
      typeof p.enabled === "boolean" &&
      MODULE_CAPABILITIES.includes(
        p.module as typeof MODULE_CAPABILITIES[number],
      ),
  ],
  list_creators: [false, [], () => true, { syncPayments: true }],
  get_creator: [
    false,
    ["creator_id"],
    (p) => isUuid(p.creator_id),
    { syncPayments: true, enrich: true },
  ],
  record_creator_payout: [
    true,
    ["creator_id", "amount_cents", "paid_at"],
    (p) =>
      isUuid(p.creator_id) &&
      Number.isSafeInteger(p.amount_cents) &&
      Number(p.amount_cents) > 0 &&
      (p.paid_at === undefined ||
        (boundedText(p.paid_at, 40) &&
          Number.isFinite(Date.parse(String(p.paid_at))))),
    { syncPayments: true },
  ],
  create_creator: [
    true,
    ["name", "email", "code"],
    (p) =>
      boundedText(p.name, 120) &&
      boundedText(p.email, 320) &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.email)) &&
      typeof p.code === "string" &&
      /^[A-Z0-9]{3,32}$/.test(p.code),
    { sandbox: true, handler: "creator" },
  ],
  get_rollout: [false, [], () => true],
  set_rollout: [
    true,
    ["module", "enabled_for_all"],
    (p) =>
      typeof p.enabled_for_all === "boolean" &&
      MODULE_CAPABILITIES.includes(
        p.module as typeof MODULE_CAPABILITIES[number],
      ),
  ],
  list_reports: [false, ["status", "limit", "cursor"], (p) => {
    if (p.limit === undefined) p.limit = 100;
    return Number.isInteger(p.limit) && Number(p.limit) >= 1 &&
      Number(p.limit) <= 100 &&
      (p.status === undefined ||
        REPORT_STATUSES.includes(
          p.status as typeof REPORT_STATUSES[number],
        )) &&
      (p.cursor === undefined || boundedText(p.cursor, 256));
  }, { enrich: true }],
  get_report: [
    false,
    ["report_id"],
    (p) => boundedText(p.report_id, 256),
    { enrich: true },
  ],
  set_report_status: [true, [
    "report_id",
    "status",
    "fixed_in_version",
    "reason",
  ], (p) =>
    boundedText(p.report_id, 256) &&
    REPORT_STATUSES.includes(
      p.status as typeof REPORT_STATUSES[number],
    ) &&
    (p.reason === undefined || boundedText(p.reason, 500)) &&
    (![
      "validated",
      "rejected",
      "spam",
      "closed",
      "duplicate_linked",
      "incomplete",
    ].includes(String(p.status)) ||
      boundedText(p.reason, 500)) &&
    (p.fixed_in_version === undefined ||
      (boundedText(p.fixed_in_version, 60) &&
        /^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.-]+)?$/.test(
          String(p.fixed_in_version),
        ))) &&
    (p.status !== "fixed" || p.fixed_in_version !== undefined)],
  mail_forget_waitlist: [
    true,
    ["email", "confirm"],
    (p) =>
      p.confirm === true && typeof p.email === "string" &&
      p.email.length <= 320 && /^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(p.email),
    { mail: "sql" },
  ],
  mail_cleanup: [true, [], () => true, { mail: "edge" }],
  mail_list: [false, [], () => true, { mail: "sql" }],
  mail_new: [true, [], () => true, { mail: "sql" }],
  mail_get: [false, ["campaign_id"], (p) => isUuid(p.campaign_id), {
    mail: "sql",
  }],
  mail_save: [
    true,
    ["campaign_id", "revision", "name", "template", "target_group", "content"],
    (p) =>
      campaign(p) && mailContent(p.content) && typeof p.name === "string" &&
      !!p.name.trim() && p.name.length <= 120 &&
      MAIL_GROUPS.includes(
        String(p.target_group) as typeof MAIL_GROUPS[number],
      ) && MAIL_TEMPLATES.includes(String(p.template)),
    { mail: "sql" },
  ],
  mail_approve: [
    true,
    ["campaign_id", "revision", "confirm"],
    (p) => campaign(p) && p.confirm === true,
    { mail: "sql" },
  ],
  mail_send_batch: [true, ["campaign_id", "revision"], campaign, {
    mail: "edge",
  }],
  mail_draft: [
    true,
    ["campaign_id", "revision", "brief", "template"],
    (p) =>
      campaign(p) && typeof p.brief === "string" && !!p.brief.trim() &&
      p.brief.length <= 4000 && MAIL_TEMPLATES.includes(String(p.template)),
    { mail: "edge" },
  ],
  mail_sync: [
    true,
    ["cursor"],
    (p) => p.cursor === undefined || isUuid(p.cursor),
    { mail: "edge" },
  ],
};
export function validateAction(action: string, params: Params): void {
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
const id = "19106900-0000-4000-8000-000000000001";
const examples: Params = {
  query: "",
  limit: 50,
  cursor: id,
  account_id: id,
  creator_id: id,
  campaign_id: id,
  report_id: id,
  blocked: true,
  enabled: true,
  enabled_for_all: true,
  confirm: true,
  confirm_email: "fixture@example.invalid",
  email: "fixture@example.invalid",
  module: MODULE_CAPABILITIES[0],
  status: "submitted",
  reason: "fixture",
  fixed_in_version: "1.2.3",
  amount_cents: 100,
  paid_at: "2026-11-04T00:00:00Z",
  name: "fixture",
  code: "CREATOR",
  revision: 1,
  brief: "fixture",
  template: "news",
  target_group: "free",
  content: Object.fromEntries(
    MAIL_LOCALES.map(
      (locale) => [locale, { subject: "fixture", body: "fixture" }],
    ),
  ),
};
export function actionContract() {
  return {
    version: 1,
    modules: MODULE_CAPABILITIES,
    statuses: REPORT_STATUSES,
    actions: Object.fromEntries(
      Object.entries(ACTIONS).map((
        [name, [mutation, fields, , policy]],
      ) => [name, {
        mutation,
        fields,
        mail: !!policy?.mail,
        environment: policy?.sandbox ? "sandbox" : "both",
        example: Object.fromEntries(
          fields.map((field) => [field, examples[field]]),
        ),
      }]),
    ),
  };
}
if (import.meta.main) console.log(JSON.stringify(actionContract(), null, 2));
