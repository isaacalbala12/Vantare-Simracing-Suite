import { handleCorsPreflight } from "../_shared/cors.ts";
import { isUuid, readJsonObject } from "../_shared/request.ts";
import { jsonResponse } from "../_shared/responses.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  nativeBearer,
  NativeError,
  requireUnblocked,
  resolveNativeAccount,
} from "../_shared/native-auth.ts";

// Hosted Supabase behind its Cloudflare gateway ONLY. Never use the first XFF
// element, X-Real-IP, or any client payload as authority. No self-hosted fallback.
// https://supabase.com/docs/guides/database/debugging-performance#production-use-with-pre-request-protection
// https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip
function canonicalIp(raw: string): string {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(raw)) {
    if (
      raw.split(".").some((part) =>
        Number(part) > 255 || String(Number(part)) !== part
      )
    ) throw new NativeError(503, "origin_unavailable");
    return raw;
  }
  if (!raw.includes(":") || !/^[a-fA-F0-9:.]+$/.test(raw)) {
    throw new NativeError(503, "origin_unavailable");
  }
  try {
    return new URL(`http://[${raw}]`).hostname.slice(1, -1);
  } catch {
    throw new NativeError(503, "origin_unavailable");
  }
}

export function requireHostedGateway(url: string): void {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      !/^[a-z0-9]{20}\.supabase\.co$/.test(parsed.hostname) ||
      parsed.origin !== url
    ) throw new Error();
  } catch {
    throw new NativeError(503, "origin_unavailable");
  }
}

export async function ipDigest(
  ip: string,
  salt: string,
  week: string,
): Promise<string> {
  const encoder = new TextEncoder();
  if (encoder.encode(salt).length < 32) {
    throw new NativeError(503, "admission_unavailable");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`testing-report:${week}:${canonicalIp(ip)}`),
    ),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function weekStart(now: Date): string {
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}

// Data JWTs are minted by native-account-authorize, not Supabase Auth sessions.
// Verify signature and the closed bridge claims before resolving identity.
export async function verifyBridgeAccount(
  request: Request,
  now: Date,
  config: { secret: string; url: string; issuer: string },
): Promise<{ account: string; subject: string }> {
  const token = nativeBearer(request);
  if (
    new TextEncoder().encode(config.secret).length < 32 || !config.url ||
    !config.issuer
  ) throw new NativeError(503, "bridge_unavailable");
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error();
    const decode = (value: string) =>
      Uint8Array.from(
        atob(value.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    if (header.alg !== "HS256" || header.typ !== "JWT") throw new Error();
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(config.secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    if (
      !await crypto.subtle.verify(
        "HMAC",
        key,
        decode(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      )
    ) throw new Error();
    const c = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const t = Math.floor(now.getTime() / 1000);
    if (
      c.iss !== `${config.url}/auth/v1` || c.aud !== "authenticated" ||
      c.role !== "authenticated" || !isUuid(c.sub) ||
      !Number.isInteger(c.iat) || !Number.isInteger(c.exp) || c.iat > t ||
      c.exp <= t || c.exp <= c.iat || c.exp - c.iat > 300 ||
      c.vantare_identity_provider !== "clerk" ||
      c.clerk_issuer !== config.issuer ||
      !/^user_[A-Za-z0-9_]{27}$/.test(c.clerk_subject)
    ) throw new Error();
    return { account: c.sub, subject: c.clerk_subject };
  } catch {
    throw new NativeError(401, "unauthorized");
  }
}

async function account(request: Request, now: Date): Promise<string> {
  const config = {
    secret: Deno.env.get("NATIVE_DATA_JWT_SECRET") ??
      Deno.env.get("SUPABASE_JWT_SECRET") ?? "",
    url: Deno.env.get("SUPABASE_URL") ?? "",
    issuer: (Deno.env.get("CLERK_ISSUER") ?? "").replace(/\/$/, ""),
  };
  const identity = await verifyBridgeAccount(request, now, config);
  await requireUnblocked(identity.subject, {});
  if (
    await resolveNativeAccount(config.issuer, identity.subject) !==
      identity.account
  ) throw new NativeError(403, "forbidden");
  return identity.account;
}

export type SubmitDeps = {
  now?: () => Date;
  salt?: string;
  account?: (request: Request) => Promise<string>;
  admit?: (scope: string, subject: string, week: string) => Promise<boolean>;
  submit?: (account: string, body: Record<string, unknown>) => Promise<void>;
};

export async function handleTestingReportSubmit(
  request: Request,
  deps: SubmitDeps = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  try {
    if (request.method !== "POST") {
      throw new NativeError(405, "method_not_allowed");
    }
    // Local unit stores are explicitly injected. The actual backend supports
    // only the managed project origin, never arbitrary/self-hosted runtimes.
    if (!deps.admit) requireHostedGateway(Deno.env.get("SUPABASE_URL") ?? "");
    const now = (deps.now ?? (() => new Date()))();
    const week = weekStart(now);
    const hash = await ipDigest(
      request.headers.get("cf-connecting-ip") ?? "",
      deps.salt ?? Deno.env.get("TESTING_REPORT_IP_SALT") ?? "",
      week,
    );
    const admit = deps.admit ?? (async (scope, subject, week) => {
      const { data, error } = await getSupabaseAdmin().rpc(
        "testing_report_admit",
        { p_scope: scope, p_subject: subject, p_week: week },
      );
      if (error || typeof data !== "boolean") {
        throw new NativeError(503, "admission_unavailable");
      }
      return data;
    });
    // Each RPC commits independently of later auth, body and submission errors.
    if (!await admit("ip", hash, week)) {
      throw new NativeError(429, "rate_limited");
    }
    const user = await (deps.account ?? ((r) => account(r, now)))(request);
    if (!await admit("account", user, week)) {
      throw new NativeError(429, "rate_limited");
    }
    if (
      request.headers.get("content-type")?.split(";")[0].trim()
        .toLowerCase() !== "application/json"
    ) throw new NativeError(400, "invalid_request");
    const parsed = await readJsonObject(request, 8192);
    if (!parsed.ok) {
      throw new NativeError(
        parsed.code === "body_too_large" ? 413 : 400,
        parsed.code,
      );
    }
    const body = parsed.value;
    const fields = ["p_id", "p_channel", "p_title", "p_body", "p_consent"];
    const text = (value: unknown, max: number) =>
      typeof value === "string" && value.trim().length > 0 &&
      [...value].length <= max &&
      new TextEncoder().encode(value).length <= max * 4;
    if (
      Object.keys(body).length !== fields.length || fields.some((field) =>
        !Object.hasOwn(body, field)
      ) ||
      !isUuid(body.p_id) ||
      typeof body.p_channel !== "string" ||
      !["nightly", "testers", "master"].includes(body.p_channel) ||
      !text(body.p_title, 120) || !text(body.p_body, 1000) ||
      body.p_consent !== true
    ) throw new NativeError(400, "invalid_request");
    await (deps.submit ?? (async (user, body) => {
      const { error } = await getSupabaseAdmin().rpc(
        "testing_report_submit_admitted",
        { ...body, p_account: user },
      );
      if (error) {
        throw new NativeError(
          error.code === "54000"
            ? 429
            : error.code === "23505"
            ? 409
            : error.code === "22023"
            ? 400
            : 503,
          "submit_failed",
        );
      }
    }))(user, body);
    return jsonResponse(null, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    // No logs of IPs, hashes, IDs, payloads, credentials or upstream errors.
    const failure = error instanceof NativeError
      ? error
      : new NativeError(503, "submit_unavailable");
    return jsonResponse({ error: failure.code }, failure.status, {
      "Cache-Control": "no-store",
      ...(failure.status === 429 ? { "Retry-After": "86400" } : {}),
    });
  }
}

if (import.meta.main) {
  Deno.serve((request) => handleTestingReportSubmit(request));
}
