import {
  type ChangeDeps,
  claimChange,
  finishChange,
  releaseChange,
} from "./change-lease.ts";
import { executeMail, type MailDeps, validateMail } from "./mail.ts";
import { createLocalOAuthVerifier } from "./local-auth.ts";
import {
  effectAudit,
  EffectFailure,
  type EffectRecorder,
  recordEffect,
} from "./effects.ts";
import { cleanupDeletedObjects } from "../clerk-webhook/index.ts";
import { syncAdminPayments } from "./payment-sync.ts";
import { ensureCreatorCode } from "./creator-code.ts";
import type { PolarProductMap } from "../_shared/mapping.ts";
import {
  clerkGet,
  type ClerkUser,
  clerkUser,
  type NativeAuthDeps,
  nativeBearer,
  nativeConfig,
  NativeError,
  resolveNativeAccount,
  verifyNativeOAuth,
} from "../_shared/native-auth.ts";
import { MODULE_CAPABILITIES } from "../_shared/license-credential.ts";
import {
  getPolarCustomerStateByExternalId,
  polarAdminRequest,
  type PolarClientDeps,
  PolarClientError,
  requirePolarEnvironment,
} from "../_shared/polar.ts";
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
  "in_review",
  "rejected",
  "fixed",
  "spam",
];
type ObjectValue = Record<string, unknown>;
export type AdminDeps = NativeAuthDeps & ChangeDeps & {
  recordEffect?: EffectRecorder;
  adminAuth?: { enabled: boolean; clientId: string };
  verifyLocal?: ReturnType<typeof createLocalOAuthVerifier>;
  preOwner?: (issuer: string, subject: string) => Promise<string>;
  gateRpc?: {
    rpc: (
      name: "native_admin_gate",
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  gate?: () => Promise<boolean>;
  mail?: MailDeps;
  mailExecute?: (
    actor: string,
    action: string,
    params: ObjectValue,
    environment: string,
  ) => Promise<ObjectValue>;
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
  cleanupDeletion?: (issuer: string, subject: string) => Promise<void>;
  environment?: "production" | "sandbox";
  polar?: PolarClientDeps;
  productMap?: PolarProductMap;
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
  if (action.startsWith("mail_")) {
    validateMail(action, params);
    return { action, params };
  }
  const fields: Record<string, string[]> = {
    search_accounts: ["query", "limit", "cursor"],
    get_account: ["account_id"],
    set_blocked: ["account_id", "blocked", "reason"],
    delete_account: ["account_id", "confirm_email"],
    set_tester: ["account_id", "enabled"],
    set_module: ["account_id", "module", "enabled"],
    list_creators: [],
    get_creator: ["creator_id"],
    record_creator_payout: ["creator_id", "amount_cents", "paid_at"],
    create_creator: ["name", "email", "code"],
    get_rollout: [],
    set_rollout: ["module", "enabled_for_all"],
    list_reports: ["status", "limit", "cursor"],
    get_report: ["report_id"],
    set_report_status: ["report_id", "status", "fixed_in_version", "reason"],
  };
  if (
    !Object.hasOwn(fields, action) ||
    Object.keys(params).some((key) => !fields[action].includes(key))
  ) throw new NativeError(400, "invalid_request");
  const valid = (() => {
    switch (action) {
      case "search_accounts":
        if (params.limit === undefined) params.limit = 50;
        return (params.query === "" || boundedText(params.query, 200)) &&
          (params.cursor === undefined ||
            (params.query === "" && isUuid(params.cursor))) &&
          Number.isInteger(params.limit) && Number(params.limit) >= 1 &&
          Number(params.limit) <= 50;
      case "set_blocked":
        return isUuid(params.account_id) &&
          typeof params.blocked === "boolean" &&
          (params.reason === undefined || boundedText(params.reason, 200));
      case "delete_account":
        return isUuid(params.account_id) &&
          boundedText(params.confirm_email, 320);
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
      case "record_creator_payout":
        return isUuid(params.creator_id) &&
          Number.isSafeInteger(params.amount_cents) &&
          Number(params.amount_cents) > 0 &&
          (params.paid_at === undefined ||
            (boundedText(params.paid_at, 40) &&
              Number.isFinite(Date.parse(String(params.paid_at)))));
      case "get_creator":
        return isUuid(params.creator_id);
      case "list_creators":
        return true;
      case "create_creator":
        return boundedText(params.name, 120) &&
          boundedText(params.email, 320) &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(params.email)) &&
          typeof params.code === "string" &&
          /^[A-Z0-9]{3,32}$/.test(params.code);
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
          statuses.includes(params.status as string) &&
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
          (params.status !== "fixed" || params.fixed_in_version !== undefined);
      default:
        return false;
    }
  })();
  if (!valid) throw new NativeError(400, "invalid_request");
  return { action, params };
}

async function preOwner(issuer: string, subject: string): Promise<string> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "native_admin_preflight",
    {
      p_issuer: issuer,
      p_subject: subject,
    },
  );
  if (error) throw error;
  if (!isUuid(data)) throw new NativeError(503, "bridge_unavailable");
  return data;
}

export async function gate(
  rpc: NonNullable<AdminDeps["gateRpc"]> = getSupabaseAdmin(),
): Promise<boolean> {
  const { data, error } = await rpc.rpc("native_admin_gate");
  if (error || typeof data !== "boolean") {
    throw new NativeError(503, "bridge_unavailable");
  }
  return data;
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
    clerk_blocked: user ? user.banned || user.locked : false,
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
  const rows = result.accounts ?? result.reports ?? result.lines ??
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
    row.blocked = row.blocked === true || row.clerk_blocked === true;
    delete row.clerk_blocked;
    delete row.subscriptions;
    delete row.clerk_subject;
  }
}

async function cancelSubscriptions(
  subscriptions: unknown,
  environment: "production" | "sandbox",
  polar: PolarClientDeps | undefined,
  audit: ReturnType<typeof effectAudit>,
  action: "set_blocked" | "delete_account",
): Promise<void> {
  if (
    !Array.isArray(subscriptions) ||
    !subscriptions.every((id) => typeof id === "string")
  ) {
    throw new NativeError(503, "bridge_unavailable");
  }
  for (const id of subscriptions) {
    const path = `/subscriptions/${encodeURIComponent(id)}`;
    let subscription: ObjectValue;
    try {
      subscription = await polarAdminRequest(
        "GET",
        path,
        undefined,
        environment,
        polar,
      );
    } catch (error) {
      if (
        error instanceof PolarClientError && error.details.polar_status === 404
      ) {
        // No subscription identity in logs; a missing resource is already gone.
        console.info(
          JSON.stringify({
            event: "native_admin_subscription_missing",
            environment,
          }),
        );
        continue;
      }
      throw error;
    }
    if (subscription.id !== id) {
      throw new NativeError(503, "account_change_incomplete");
    }
    if (subscription.status === "canceled") continue;
    await audit(action, "polar_cancel", id, async () => {
      let canceled: ObjectValue;
      let providerStatus: number | undefined;
      try {
        canceled = await polarAdminRequest(
          "DELETE",
          path,
          undefined,
          environment,
          {
            ...polar,
            fetchFn: async (input, init) => {
              const response = await (polar?.fetchFn ?? fetch)(input, init);
              providerStatus = response.status;
              return response;
            },
          },
        );
      } catch (error) {
        if (
          error instanceof PolarClientError &&
          error.details.polar_status !== undefined
        ) throw new EffectFailure(error.details.polar_status);
        throw error;
      }
      if (canceled.id !== id || canceled.status !== "canceled") {
        throw new NativeError(503, "account_change_incomplete");
      }
      return providerStatus;
    });
  }
}

export async function handleNativeAdmin(
  request: Request,
  deps: AdminDeps = {},
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const respond = (value: ObjectValue, status = 200) =>
    jsonResponse({ version: 1, ...value }, status, {
      "Cache-Control": "no-store",
      "X-Request-ID": requestId,
    });
  const started = performance.now();
  const phases: Record<string, number> = {};
  let timingAction = "rejected";
  let partialChange = false;
  async function timed<T>(phase: string, work: () => Promise<T>): Promise<T> {
    const at = performance.now();
    try {
      return await work();
    } finally {
      phases[phase] = Math.round(performance.now() - at);
    }
  }
  try {
    if (request.method !== "POST") {
      throw new NativeError(405, "method_not_allowed");
    }
    const token = nativeBearer(request);
    if (
      request.headers.get("Content-Type")?.split(";")[0].trim()
        .toLowerCase() !== "application/json"
    ) throw new NativeError(400, "invalid_request");
    let receivedBytes = 0;
    const counted = new Request(request, {
      body: request.body?.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            receivedBytes += chunk.byteLength;
            controller.enqueue(chunk);
          },
        }),
      ),
    });
    const parsed = await readJsonObject(counted, 128 * 1024);
    const mailRequest = parsed.ok && typeof parsed.value.action === "string" &&
      parsed.value.action.startsWith("mail_");
    if (
      !mailRequest &&
      (receivedBytes > 8192 ||
        Number(request.headers.get("content-length")) > 8192)
    ) {
      throw new NativeError(413, "request_too_large");
    }
    if (!parsed.ok) {
      throw new NativeError(
        parsed.code === "body_too_large" ? 413 : 400,
        parsed.code === "body_too_large"
          ? "request_too_large"
          : "invalid_request",
      );
    }
    const { action, params } = validateAdminRequest(parsed.value);
    timingAction = action;
    const adminAuth = deps.adminAuth ?? {
      enabled: Deno.env.get("CLERK_ADMIN_AUTH_ENABLED") === "true",
      clientId: Deno.env.get("CLERK_ADMIN_CLIENT_ID") ?? "",
    };
    let oauthDeps = deps;
    let existingActor: string | undefined;
    let localSubject: string | undefined;
    if (adminAuth.enabled) {
      const config = nativeConfig(deps);
      if (
        !adminAuth.clientId || /\s/.test(adminAuth.clientId) ||
        adminAuth.clientId.length > 256 ||
        adminAuth.clientId === config.clientId
      ) throw new NativeError(503, "bridge_unavailable");
      oauthDeps = {
        ...deps,
        config: { ...config, clientId: adminAuth.clientId },
      };
      const local = await timed(
        "verify_local",
        () =>
          (deps.verifyLocal ?? createLocalOAuthVerifier())(token, oauthDeps),
      );
      existingActor = await timed(
        "owner_preflight",
        () => (deps.preOwner ?? preOwner)(local.issuer, local.subject),
      );
      localSubject = local.subject;
    }
    if (
      !(await timed(
        "global_budget",
        () => (deps.gate ?? (() => gate(deps.gateRpc)))(),
      ))
    ) {
      throw new NativeError(429, "rate_limited");
    }
    let identity;
    try {
      identity = await timed(
        "verify_oauth",
        () => verifyNativeOAuth(token, oauthDeps),
      );
    } catch (error) {
      if (error instanceof NativeError && error.status === 403) {
        throw new NativeError(401, "unauthorized");
      }
      throw error;
    }
    if (localSubject !== undefined && identity.subject !== localSubject) {
      throw new NativeError(401, "unauthorized");
    }
    const actorUser = await timed("actor_profile", async () =>
      clerkUser(
        await clerkGet(`users/${encodeURIComponent(identity.subject)}`, deps),
      ));
    if (actorUser.id !== identity.subject) {
      throw new NativeError(503, "bridge_unavailable");
    }
    if (actorUser.banned || actorUser.locked) {
      throw new NativeError(403, "forbidden");
    }
    const actor = existingActor ?? await timed(
      "resolve_account",
      () =>
        (deps.resolve ?? resolveNativeAccount)(
          identity.issuer,
          identity.subject,
        ),
    );
    if (!(await timed("owner_budget", () => (deps.begin ?? begin)(actor)))) {
      throw new NativeError(429, "rate_limited");
    }
    const users = new Map<string, ClerkUser>();
    if (action === "search_accounts" && params.query !== "") {
      const found = await timed("search_clerk", () =>
        directory(
          new URLSearchParams({
            query: String(params.query),
            limit: String(params.limit),
          }),
          deps,
        ));
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
    // Reuse the actor profile only for enrichment, AFTER fixing search subjects.
    // Adding it before subjects would incorrectly return the owner in every search.
    users.set(actorUser.id, actorUser);
    const environment = deps.environment ?? requirePolarEnvironment();
    const effect = effectAudit(
      actor,
      requestId,
      deps.recordEffect ?? recordEffect,
    );
    if (action.startsWith("mail_")) {
      const runMail = (command: string, arguments_: ObjectValue) =>
        (deps.mailExecute ?? (async (actor, command, params, environment) => {
          const { data, error } = await getSupabaseAdmin().rpc(
            "mail_admin_execute",
            {
              p_actor: actor,
              p_action: command,
              p_params: params,
              p_environment: environment,
            },
          );
          if (error) throw error;
          return objectValue(data);
        }))(actor, command, arguments_, environment);
      return respond({
        ...await executeMail(action, params, runMail, deps.mail),
        ok: true,
      });
    }
    const run = (command: string, arguments_: ObjectValue) =>
      (deps.execute ?? execute)(
        actor,
        nativeConfig(deps).issuer,
        command,
        arguments_,
        environment,
      );
    if (
      ["get_account", "list_creators", "get_creator", "record_creator_payout"]
        .includes(action)
    ) await syncAdminPayments(run, environment, deps.productMap, deps.polar);
    if (action === "create_creator") {
      if (environment !== "sandbox") {
        throw new NativeError(503, "admin_sandbox_required");
      }
      const reserved = await run(action, params);
      const creator = objectValue(reserved.creator);
      if (
        creator.status === "active" &&
        typeof creator.annual_discount_id === "string"
      ) {
        return respond({ ...reserved, ok: true });
      }
      if (typeof creator.creator_id !== "string") {
        throw new NativeError(503, "bridge_unavailable");
      }
      const discounts = await ensureCreatorCode(
        creator.creator_id,
        String(params.code),
        deps.productMap,
        deps.polar,
      );
      return respond({
        ...await run("activate_creator", {
          creator_id: creator.creator_id,
          ...discounts,
        }),
        ok: true,
      });
    }
    if (["set_blocked", "delete_account"].includes(action)) {
      if (environment !== "sandbox") {
        throw new NativeError(503, "admin_sandbox_required");
      }
      const lease = action === "set_blocked"
        ? await (deps.claimChange ?? claimChange)(
          actor,
          requestId,
          String(params.account_id),
        )
        : null;
      if (action === "set_blocked" && lease === null) {
        throw new NativeError(409, "account_conflict");
      }
      const releaseLease = async () => {
        if (
          lease !== null &&
          !await (deps.releaseChange ?? releaseChange)(
            actor,
            requestId,
            String(params.account_id),
            lease,
          )
        ) {
          throw new NativeError(503, "account_change_incomplete");
        }
      };
      try {
        const current = objectValue(
          (await run("get_account", { account_id: params.account_id })).account,
        );
        if (current.owner === true || params.account_id === actor) {
          throw new NativeError(409, "account_conflict");
        }
        if (typeof current.clerk_subject !== "string") {
          throw new NativeError(404, "not_found");
        }
        const subject = current.clerk_subject;
        if (action === "delete_account") {
          const confirmation_hash = [
            ...new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(
                  String(params.confirm_email).trim().toLowerCase(),
                ),
              ),
            ),
          ].map((byte) => byte.toString(16).padStart(2, "0")).join("");
          const deletionParams = {
            account_id: params.account_id,
            confirmation_hash,
          };
          const previous = await run("get_account_deletion", deletionParams);
          let deletion = previous.deletion;
          if (deletion === null) {
            const targetUser = clerkUser(
              await clerkGet(`users/${encodeURIComponent(subject)}`, deps),
            );
            if (targetUser.id !== subject) {
              throw new NativeError(503, "bridge_unavailable");
            }
            const email = contact(targetUser).email;
            if (
              !email ||
              String(params.confirm_email).trim().toLowerCase() !==
                email.trim().toLowerCase()
            ) {
              throw new NativeError(422, "confirmation_mismatch");
            }
            deletion = (await run("prepare_account_deletion", {
              ...deletionParams,
              clerk_subject: subject,
            })).deletion;
          }
          const job = objectValue(deletion);
          if (
            job.account_id !== params.account_id ||
            job.clerk_subject !== subject || typeof job.deleted_at !== "string"
          ) {
            throw new NativeError(503, "bridge_unavailable");
          }
          // The durable #1622 tombstone precedes ALL external writes. A lost ACK
          // is retried explicitly; SQL rechecks Owner and the confirmation hash.
          partialChange = true;
          // A purchase may commit after the initial account read. The #1622 UUID
          // barrier has now drained preceding writers and prevents new ones.
          const erased = objectValue(
            (await run("get_account", { account_id: params.account_id }))
              .account,
          );
          if (!Array.isArray(erased.subscriptions)) {
            throw new NativeError(503, "bridge_unavailable");
          }
          let remoteSubscriptions: string[] = [];
          try {
            // Checkout binds external_customer_id to our UUID. Read Polar too:
            // a completed purchase may not have delivered its webhook yet.
            const state = await getPolarCustomerStateByExternalId(
              String(params.account_id),
              environment,
              deps.polar,
            );
            if (state.externalId !== params.account_id) {
              throw new NativeError(503, "account_change_incomplete");
            }
            remoteSubscriptions = state.activeSubscriptions.map((sub) =>
              sub.id
            );
          } catch (error) {
            if (
              !(error instanceof PolarClientError &&
                error.code === "polar_customer_not_found")
            ) throw error;
            console.info(
              JSON.stringify({
                event: "native_admin_customer_missing",
                environment,
              }),
            );
          }
          await cancelSubscriptions(
            [...new Set([...erased.subscriptions, ...remoteSubscriptions])],
            environment,
            deps.polar,
            effect,
            "delete_account",
          );
          await effect(action, "clerk_delete", subject, async () => {
            const response = await (deps.fetch ?? fetch)(
              `https://api.clerk.com/v1/users/${encodeURIComponent(subject)}`,
              {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${nativeConfig(deps).secretKey}`,
                },
                redirect: "error",
                signal: AbortSignal.timeout(4000),
              },
            );
            // 404 is safe only AFTER our durable, email-confirmed deletion request.
            if (!response.ok && response.status !== 404) {
              throw new EffectFailure(response.status);
            }
            return response.status;
          });
          await effect(
            action,
            "storage_cleanup",
            subject,
            () =>
              (deps.cleanupDeletion ?? cleanupDeletedObjects)(
                nativeConfig(deps).issuer,
                subject,
              ),
          );
          return respond({
            ok: true,
            account_id: params.account_id,
            deleted_at: job.deleted_at,
          });
        }
        if (params.blocked === true) {
          await (deps.finishChange ?? finishChange)(
            actor,
            nativeConfig(deps).issuer,
            params,
            environment,
            requestId,
            lease!,
          );
          partialChange = true;
        }
        await effect(
          "set_blocked",
          params.blocked ? "clerk_ban" : "clerk_unban",
          subject,
          async () => {
            const response = await (deps.fetch ?? fetch)(
              `https://api.clerk.com/v1/users/${encodeURIComponent(subject)}/${
                params.blocked ? "ban" : "unban"
              }`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${nativeConfig(deps).secretKey}`,
                },
                redirect: "error",
                signal: AbortSignal.timeout(4000),
              },
            );
            if (!response.ok) {
              throw new EffectFailure(response.status);
            }
            partialChange = true;
            return response.status;
          },
        );
        if (params.blocked === true) {
          await cancelSubscriptions(
            current.subscriptions,
            environment,
            deps.polar,
            effect,
            "set_blocked",
          );
        } else {await (deps.finishChange ?? finishChange)(
            actor,
            nativeConfig(deps).issuer,
            params,
            environment,
            requestId,
            lease!,
          );}
        return respond({
          ok: true,
          account_id: params.account_id,
          blocked: params.blocked,
        });
      } finally {
        await releaseLease();
      }
    }
    const result = await timed(
      "postgres_action",
      () =>
        (deps.execute ?? execute)(
          actor,
          nativeConfig(deps).issuer,
          action,
          params,
          environment,
        ),
    );
    if (
      [
        "search_accounts",
        "get_account",
        "list_reports",
        "get_report",
        "get_creator",
      ].includes(
        action,
      )
    ) await timed("enrich_clerk", () => enrich(result, users, deps));
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
      if (
        ["native_admin_invalid", "testing_review_invalid"].includes(
          String(error.message),
        )
      ) {
        failure = new NativeError(400, "invalid_request");
      }
      if (
        [
          "native_admin_owner_conflict",
          "mail_revision_conflict",
          "mail_contact_has_account",
          "testing_review_conflict",
          "testing_acceptance_limit",
        ].includes(String(error.message))
      ) {
        failure = new NativeError(409, "account_conflict");
      }
    }
    if (
      error && typeof error === "object" && "message" in error &&
      error.message === "native_admin_confirmation_mismatch"
    ) {
      failure = new NativeError(422, "confirmation_mismatch");
    }
    if (partialChange) {
      failure = new NativeError(503, "account_change_incomplete");
    }
    return respond({ ok: false, error: failure.code }, failure.status);
  } finally {
    // Fixed phase/action names only: no identities, emails, bodies, tokens or URLs.
    console.info(
      JSON.stringify({
        event: "native_admin_timing",
        request_id: requestId,
        action: timingAction,
        total_ms: Math.round(performance.now() - started),
        phases,
      }),
    );
  }
}

if (import.meta.main) {
  const verifyLocal = createLocalOAuthVerifier();
  Deno.serve((request) => handleNativeAdmin(request, { verifyLocal }));
}
