import {
  clerkGet,
  type ClerkUser,
  clerkUser,
  type NativeAuthDeps,
  nativeBearer,
  nativeConfig,
  NativeError,
  requireUnblocked,
  resolveNativeAccount,
  verifyNativeOAuth,
} from "../_shared/native-auth.ts";
import { MODULE_CAPABILITIES } from "../_shared/license-credential.ts";
import { requirePolarEnvironment } from "../_shared/polar.ts";
import { isUuid, readJsonObject } from "../_shared/request.ts";
import { jsonResponse } from "../_shared/responses.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

const statuses = [
  "draft",
  "submitted",
  "validated",
  "duplicate_linked",
  "incomplete",
  "closed",
];
type ObjectValue = Record<string, unknown>;
export type AdminDeps = NativeAuthDeps & {
  resolve?: typeof resolveNativeAccount;
  begin?: (actor: string) => Promise<boolean>;
  execute?: (
    actor: string,
    issuer: string,
    action: string,
    params: ObjectValue,
    environment: string,
  ) => Promise<ObjectValue>;
  signUrl?: (path: string, seconds: number) => Promise<string>;
  environment?: "production" | "sandbox";
};

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 &&
    value === value.trim() && new TextEncoder().encode(value).length <= max;
}

export function validateAdminRequest(
  body: ObjectValue,
): { action: string; params: ObjectValue } {
  const { version, action, ...params } = body;
  if (version !== 1 || typeof action !== "string") {
    throw new NativeError(400, "invalid_request");
  }
  const fields: Record<string, string[]> = {
    search_accounts: ["query", "limit"],
    get_account: ["account_id"],
    set_tester: ["account_id", "enabled"],
    set_module: ["account_id", "module", "enabled"],
    get_rollout: [],
    set_rollout: ["module", "enabled_for_all"],
    list_reports: ["status", "limit", "cursor"],
    get_report: ["report_id"],
    set_report_status: ["report_id", "status"],
  };
  if (
    !Object.hasOwn(fields, action) ||
    Object.keys(params).some((key) => !fields[action].includes(key))
  ) throw new NativeError(400, "invalid_request");
  const valid = (() => {
    switch (action) {
      case "search_accounts":
        if (params.limit === undefined) params.limit = 50;
        return boundedText(params.query, 200) &&
          Number.isInteger(params.limit) && Number(params.limit) >= 1 &&
          Number(params.limit) <= 50;
      case "get_account":
        return isUuid(params.account_id);
      case "set_tester":
        return isUuid(params.account_id) && typeof params.enabled === "boolean";
      case "set_module":
        return isUuid(params.account_id) &&
          typeof params.enabled === "boolean" &&
          MODULE_CAPABILITIES.includes(
            params.module as typeof MODULE_CAPABILITIES[number],
          );
      case "get_rollout":
        return true;
      case "set_rollout":
        return typeof params.enabled_for_all === "boolean" &&
          MODULE_CAPABILITIES.includes(
            params.module as typeof MODULE_CAPABILITIES[number],
          );
      case "list_reports":
        if (params.limit === undefined) params.limit = 100;
        return Number.isInteger(params.limit) && Number(params.limit) >= 1 &&
          Number(params.limit) <= 100 &&
          (params.status === undefined ||
            statuses.includes(params.status as string)) &&
          (params.cursor === undefined || boundedText(params.cursor, 256));
      case "get_report":
        return boundedText(params.report_id, 256);
      case "set_report_status":
        return boundedText(params.report_id, 256) &&
          statuses.includes(params.status as string);
      default:
        return false;
    }
  })();
  if (!valid) throw new NativeError(400, "invalid_request");
  return { action, params };
}

async function begin(actor: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc("native_admin_begin", {
    p_actor: actor,
  });
  if (error) throw error;
  if (typeof data !== "boolean") {
    throw new NativeError(503, "bridge_unavailable");
  }
  return data;
}

async function execute(
  actor: string,
  issuer: string,
  action: string,
  params: ObjectValue,
  environment: string,
): Promise<ObjectValue> {
  const { data, error } = await getSupabaseAdmin().rpc("native_admin_execute", {
    p_actor: actor,
    p_issuer: issuer,
    p_action: action,
    p_params: params,
    p_environment: environment,
  });
  if (error) throw error;
  return objectValue(data);
}

function objectValue(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NativeError(503, "bridge_unavailable");
  }
  return value as ObjectValue;
}

async function signUrl(path: string, seconds: number): Promise<string> {
  const { data, error } = await getSupabaseAdmin().storage.from(
    "testing-center-evidence",
  ).createSignedUrl(path, seconds);
  if (error || !data?.signedUrl) {
    throw new NativeError(503, "bridge_unavailable");
  }
  return data.signedUrl;
}

async function directory(
  params: URLSearchParams,
  deps: NativeAuthDeps,
): Promise<ClerkUser[]> {
  const value = await clerkGet(`users?${params}`, deps);
  if (!Array.isArray(value)) throw new NativeError(503, "bridge_unavailable");
  return value.map(clerkUser);
}

function contact(user: ClerkUser | undefined) {
  return {
    email:
      user?.email_addresses.find((item) =>
        item.id === user.primary_email_address_id
      )?.email_address ?? null,
    name: user
      ? [user.first_name, user.last_name].filter(Boolean).join(" ") || null
      : null,
    last_seen_at: user?.last_sign_in_at
      ? new Date(user.last_sign_in_at).toISOString()
      : null,
  };
}

async function enrich(
  result: ObjectValue,
  users: Map<string, ClerkUser>,
  deps: NativeAuthDeps,
): Promise<void> {
  const rows = result.accounts ?? result.reports ??
    [result.account ?? result.report].filter(Boolean);
  if (!Array.isArray(rows)) throw new NativeError(503, "bridge_unavailable");
  const objects = rows.map(objectValue);
  const missing = [
    ...new Set(
      objects.map((row) => row.clerk_subject).filter((
        subject,
      ): subject is string =>
        typeof subject === "string" && !users.has(subject)
      ),
    ),
  ];
  if (missing.length > 0) {
    const params = new URLSearchParams({ limit: String(missing.length) });
    for (const subject of missing) params.append("user_id", subject);
    for (const user of await directory(params, deps)) users.set(user.id, user);
  }
  for (const row of objects) {
    const subject = row.clerk_subject;
    Object.assign(
      row,
      contact(typeof subject === "string" ? users.get(subject) : undefined),
    );
    delete row.clerk_subject;
  }
}

export async function handleNativeAdmin(
  request: Request,
  deps: AdminDeps = {},
): Promise<Response> {
  const respond = (value: ObjectValue, status = 200) =>
    jsonResponse({ version: 1, ...value }, status, {
      "Cache-Control": "no-store",
    });
  try {
    if (request.method !== "POST") {
      throw new NativeError(405, "method_not_allowed");
    }
    const token = nativeBearer(request);
    if (
      request.headers.get("Content-Type")?.split(";")[0].trim()
        .toLowerCase() !== "application/json"
    ) throw new NativeError(400, "invalid_request");
    const parsed = await readJsonObject(request, 8192);
    if (!parsed.ok) {
      throw new NativeError(
        parsed.code === "body_too_large" ? 413 : 400,
        parsed.code === "body_too_large"
          ? "request_too_large"
          : "invalid_request",
      );
    }
    const { action, params } = validateAdminRequest(parsed.value);
    let identity;
    try {
      identity = await verifyNativeOAuth(token, deps);
    } catch (error) {
      if (error instanceof NativeError && error.status === 403) {
        throw new NativeError(401, "unauthorized");
      }
      throw error;
    }
    await requireUnblocked(identity.subject, deps);
    const actor = await (deps.resolve ?? resolveNativeAccount)(
      identity.issuer,
      identity.subject,
    );
    if (!(await (deps.begin ?? begin)(actor))) {
      throw new NativeError(429, "rate_limited");
    }
    const users = new Map<string, ClerkUser>();
    if (action === "search_accounts") {
      const found = await directory(
        new URLSearchParams({
          query: String(params.query),
          limit: String(params.limit),
        }),
        deps,
      );
      const query = String(params.query).toLocaleLowerCase();
      for (const user of found) {
        if (
          user.email_addresses.some((item) =>
            item.email_address.toLocaleLowerCase().includes(query)
          ) ||
          [user.first_name, user.last_name].filter(Boolean).join(" ")
            .toLocaleLowerCase().includes(query)
        ) users.set(user.id, user);
      }
      // Only already-mapped accounts are returned: search never bootstraps targets.
      params.subjects = [...users.keys()];
      delete params.query;
    }
    const result = await (deps.execute ?? execute)(
      actor,
      nativeConfig(deps).issuer,
      action,
      params,
      deps.environment ?? requirePolarEnvironment(),
    );
    if (
      ["search_accounts", "get_account", "list_reports", "get_report"].includes(
        action,
      )
    ) await enrich(result, users, deps);
    if (action === "get_report") {
      const report = objectValue(result.report);
      if (
        !Array.isArray(report.screenshots) || report.screenshots.length > 10
      ) throw new NativeError(503, "bridge_unavailable");
      for (const value of report.screenshots) {
        const image = objectValue(value);
        if (
          typeof image.object_path !== "string" ||
          !/^v1\/[0-9a-f]{32}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(
            image.object_path,
          )
        ) throw new NativeError(503, "bridge_unavailable");
        image.url = await (deps.signUrl ?? signUrl)(image.object_path, 600);
        image.expires_at = Math.floor(
          (deps.now ?? (() => new Date()))().getTime() / 1000,
        ) + 600;
        delete image.object_path;
      }
    }
    return respond({ ...result, ok: true });
  } catch (error) {
    let failure = error instanceof NativeError
      ? error
      : new NativeError(503, "bridge_unavailable");
    if (error && typeof error === "object" && "message" in error) {
      if (error.message === "native_admin_forbidden") {
        failure = new NativeError(403, "forbidden");
      }
      if (error.message === "native_admin_not_found") {
        failure = new NativeError(404, "not_found");
      }
      if (error.message === "native_admin_invalid") {
        failure = new NativeError(400, "invalid_request");
      }
      if (error.message === "native_admin_owner_conflict") {
        failure = new NativeError(409, "account_conflict");
      }
    }
    return respond({ ok: false, error: failure.code }, failure.status);
  }
}

if (import.meta.main) Deno.serve((request) => handleNativeAdmin(request));
