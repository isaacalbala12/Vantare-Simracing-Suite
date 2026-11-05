import { NativeError } from "../_shared/native-auth.ts";
import { isUuid } from "../_shared/request.ts";
import { MODULE_CAPABILITIES } from "../_shared/license-credential.ts";
type Params = Record<string, unknown>;
type ActionPolicy = {
  mutation?: false;
  mail?: "sql" | "edge";
  syncPayments?: boolean;
  paymentRead?: boolean;
  enrich?: boolean;
  sandbox?: boolean;
  handler?: "creator" | "account" | "payments";
};
type ActionSpec = readonly [
  example: Params,
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
const id = "19106900-0000-4000-8000-000000000001";
const contentExample = Object.fromEntries(
  MAIL_LOCALES.map(
    (locale) => [locale, { subject: "fixture", body: "fixture" }],
  ),
);
export const ACTIONS: Readonly<Record<string, ActionSpec>> = {
  search_accounts: [{ query: "", limit: 50, cursor: id }, (p) => {
    if (p.limit === undefined) p.limit = 50;
    return (p.query === "" || boundedText(p.query, 200)) &&
      (p.cursor === undefined ||
        (p.query === "" && isUuid(p.cursor))) &&
      Number.isInteger(p.limit) && Number(p.limit) >= 1 &&
      Number(p.limit) <= 50;
  }, { mutation: false, enrich: true }],
  get_account: [{ account_id: id }, (p) => isUuid(p.account_id), {
    mutation: false,
    paymentRead: true,
    enrich: true,
  }],
  set_blocked: [
    { account_id: id, blocked: true, reason: "fixture" },
    (p) =>
      isUuid(p.account_id) &&
      typeof p.blocked === "boolean" &&
      (p.reason === undefined || boundedText(p.reason, 200)),
    { sandbox: true, handler: "account" },
  ],
  delete_account: [
    { account_id: id, confirm_email: "fixture@example.invalid" },
    (p) =>
      isUuid(p.account_id) &&
      boundedText(p.confirm_email, 320),
    { sandbox: true, handler: "account" },
  ],
  set_tester: [
    { account_id: id, enabled: true },
    (p) => isUuid(p.account_id) && typeof p.enabled === "boolean",
  ],
  set_module: [{
    account_id: id,
    module: MODULE_CAPABILITIES[0],
    enabled: true,
    expected_enabled: false,
  }, (p) =>
    isUuid(p.account_id) &&
    typeof p.enabled === "boolean" && typeof p.expected_enabled === "boolean" &&
    MODULE_CAPABILITIES.includes(
      p.module as typeof MODULE_CAPABILITIES[number],
    )],
  sync_payments: [{}, () => true, { sandbox: true, handler: "payments" }],
  list_creators: [{}, () => true, { mutation: false, paymentRead: true }],
  get_creator: [{ creator_id: id }, (p) => isUuid(p.creator_id), {
    mutation: false,
    paymentRead: true,
    enrich: true,
  }],
  record_creator_payout: [{
    creator_id: id,
    amount_cents: 100,
    paid_at: "2026-11-04T00:00:00Z",
  }, (p) =>
    isUuid(p.creator_id) &&
    Number.isSafeInteger(p.amount_cents) &&
    Number(p.amount_cents) > 0 &&
    (p.paid_at === undefined ||
      (boundedText(p.paid_at, 40) &&
        Number.isFinite(Date.parse(String(p.paid_at))))), {
    syncPayments: true,
  }],
  create_creator: [{
    name: "fixture",
    email: "fixture@example.invalid",
    code: "CREATOR",
  }, (p) =>
    boundedText(p.name, 120) &&
    boundedText(p.email, 320) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.email)) &&
    typeof p.code === "string" &&
    /^[A-Z0-9]{3,32}$/.test(p.code), { sandbox: true, handler: "creator" }],
  get_rollout: [{}, () => true, { mutation: false }],
  set_rollout: [
    {
      module: MODULE_CAPABILITIES[0],
      enabled_for_all: true,
      expected_enabled: false,
    },
    (p) =>
      typeof p.enabled_for_all === "boolean" &&
      typeof p.expected_enabled === "boolean" &&
      MODULE_CAPABILITIES.includes(
        p.module as typeof MODULE_CAPABILITIES[number],
      ),
  ],
  list_reports: [{ status: "submitted", limit: 50, cursor: id }, (p) => {
    if (p.limit === undefined) p.limit = 100;
    return Number.isInteger(p.limit) && Number(p.limit) >= 1 &&
      Number(p.limit) <= 100 &&
      (p.status === undefined ||
        REPORT_STATUSES.includes(
          p.status as typeof REPORT_STATUSES[number],
        )) &&
      (p.cursor === undefined || boundedText(p.cursor, 256));
  }, { mutation: false, enrich: true }],
  get_report: [{ report_id: id }, (p) => boundedText(p.report_id, 256), {
    mutation: false,
    enrich: true,
  }],
  set_report_status: [{
    report_id: id,
    status: "submitted",
    fixed_in_version: "1.2.3",
    reason: "fixture",
  }, (p) =>
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
    { email: "fixture@example.invalid", confirm: true },
    (p) =>
      p.confirm === true && typeof p.email === "string" &&
      p.email.length <= 320 && /^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(p.email),
    { mail: "sql" },
  ],
  mail_cleanup: [{}, () => true, { mail: "edge" }],
  mail_list: [{}, () => true, { mutation: false, mail: "sql" }],
  mail_new: [{}, () => true, { mail: "sql" }],
  mail_get: [{ campaign_id: id }, (p) => isUuid(p.campaign_id), {
    mutation: false,
    mail: "sql",
  }],
  mail_save: [
    {
      campaign_id: id,
      revision: 1,
      name: "fixture",
      template: "news",
      target_group: "free",
      content: contentExample,
    },
    (p) =>
      campaign(p) && mailContent(p.content) && typeof p.name === "string" &&
      !!p.name.trim() && p.name.length <= 120 &&
      MAIL_GROUPS.includes(
        String(p.target_group) as typeof MAIL_GROUPS[number],
      ) && MAIL_TEMPLATES.includes(String(p.template)),
    { mail: "sql" },
  ],
  mail_approve: [
    { campaign_id: id, revision: 1, confirm: true, expected_recipients: 0 },
    (p) =>
      campaign(p) && p.confirm === true &&
      Number.isSafeInteger(p.expected_recipients) &&
      Number(p.expected_recipients) >= 0,
    { mail: "sql" },
  ],
  mail_cancel: [{ campaign_id: id, revision: 1 }, campaign, { mail: "sql" }],
  mail_send_batch: [{ campaign_id: id, revision: 1 }, campaign, {
    mail: "edge",
  }],
  mail_draft: [{
    campaign_id: id,
    revision: 1,
    brief: "fixture",
    template: "news",
  }, (p) =>
    campaign(p) && typeof p.brief === "string" && !!p.brief.trim() &&
    p.brief.length <= 4000 && MAIL_TEMPLATES.includes(String(p.template)), {
    mail: "edge",
  }],
  mail_sync: [
    { cursor: id },
    (p) => p.cursor === undefined || isUuid(p.cursor),
    { mail: "edge" },
  ],
};
export function validateAction(action: string, params: Params): void {
  if (!Object.hasOwn(ACTIONS, action)) {
    throw new NativeError(400, "invalid_request");
  }
  const [example, validate] = ACTIONS[action];
  if (
    Object.keys(params).some((key) => !Object.hasOwn(example, key)) ||
    !validate(params)
  ) throw new NativeError(400, "invalid_request");
}
export function validateAdminRequest(
  body: Params,
): { action: string; params: Params; explicitPayments: boolean } {
  const { version, action, explicit_payments, ...params } = body;
  if (version !== 1 || typeof action !== "string") {
    throw new NativeError(400, "invalid_request");
  }
  if (
    explicit_payments !== undefined &&
    (typeof explicit_payments !== "boolean" ||
      !ACTIONS[action]?.[2]?.paymentRead)
  ) {
    throw new NativeError(400, "invalid_request");
  }
  validateAction(action, params);
  return { action, params, explicitPayments: explicit_payments === true };
}
export function actionContract() {
  return {
    version: 1,
    modules: MODULE_CAPABILITIES,
    statuses: REPORT_STATUSES,
    actions: Object.fromEntries(
      Object.entries(ACTIONS).map((
        [name, [example, , policy]],
      ) => [name, {
        mutation: policy?.mutation !== false,
        explicit_payments: policy?.paymentRead === true,
        fields: Object.keys(example),
        mail: !!policy?.mail,
        environment: policy?.sandbox ? "sandbox" : "both",
        example,
      }]),
    ),
  };
}
if (import.meta.main) console.log(JSON.stringify(actionContract(), null, 2));
