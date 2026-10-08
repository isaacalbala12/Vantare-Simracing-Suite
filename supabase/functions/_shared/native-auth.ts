import { getSupabaseAdmin } from "./supabase-admin.ts";
import { isUuid } from "./request.ts";

export type NativeConfig = {
  secretKey: string;
  clientId: string;
  issuer: string;
};
export type NativeAuthDeps = {
  config?: NativeConfig;
  fetch?: typeof fetch;
  now?: () => Date;
};

export class NativeError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export function nativeConfig(deps: NativeAuthDeps): NativeConfig {
  const config = deps.config ?? {
    secretKey: Deno.env.get("CLERK_SECRET_KEY") ?? "",
    clientId: Deno.env.get("CLERK_NATIVE_CLIENT_ID") ?? "",
    issuer: Deno.env.get("CLERK_ISSUER") ?? "",
  };
  const issuer = config.issuer.replace(/\/$/, "");
  if (
    !config.secretKey || !config.clientId || !issuer ||
    new URL(issuer).protocol !== "https:" || new URL(issuer).origin !== issuer
  ) {
    throw new NativeError(503, "bridge_unavailable");
  }
  return { ...config, issuer };
}

export function nativeBearer(request: Request): string {
  const token = /^Bearer ([^\s]+)$/i.exec(
    request.headers.get("Authorization") ?? "",
  )?.[1];
  if (!token) throw new NativeError(401, "unauthorized");
  if (new TextEncoder().encode(token).length > 16 * 1024) {
    throw new NativeError(413, "request_too_large");
  }
  return token;
}

// Shared with native-license: OAuth authority comes only from Clerk verification.
export async function verifyNativeOAuth(token: string, deps: NativeAuthDeps) {
  const config = nativeConfig(deps);
  const response = await (deps.fetch ?? fetch)(
    "https://api.clerk.com/oauth_applications/access_tokens/verify",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: token }),
      redirect: "error",
      signal: AbortSignal.timeout(4000),
    },
  );
  if (response.status === 429) throw new NativeError(429, "rate_limited");
  if ([400, 404].includes(response.status)) {
    throw new NativeError(401, "unauthorized");
  }
  if (!response.ok) throw new NativeError(503, "bridge_unavailable");
  const claims: unknown = await response.json();
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
    throw new NativeError(503, "bridge_unavailable");
  }
  const value = claims as Record<string, unknown>;
  if (
    value.active === false || value.revoked === true || value.expired === true
  ) {
    throw new NativeError(401, "unauthorized");
  }
  if (
    value.object !== "clerk_idp_oauth_access_token" ||
    typeof value.client_id !== "string" || typeof value.subject !== "string" ||
    !Array.isArray(value.scopes) ||
    !value.scopes.every((scope) => typeof scope === "string") ||
    value.revoked !== false || value.expired !== false ||
    typeof value.expiration !== "number" || !Number.isFinite(value.expiration)
  ) {
    throw new NativeError(503, "bridge_unavailable");
  }
  const now = (deps.now ?? (() => new Date()))();
  if (value.expiration <= now.getTime() / 1000) {
    throw new NativeError(401, "unauthorized");
  }
  if (
    value.client_id !== config.clientId ||
    !/^user_[A-Za-z0-9_]{27}$/.test(value.subject) ||
    !["openid", "profile"].every((scope) =>
      (value.scopes as string[]).includes(scope)
    )
  ) {
    throw new NativeError(403, "forbidden");
  }
  return {
    issuer: config.issuer,
    subject: value.subject,
    expiration: value.expiration,
    now,
  };
}

export type ClerkUser = {
  id: string;
  banned: boolean;
  locked: boolean;
  primary_email_address_id: string | null;
  email_addresses: { id: string; email_address: string }[];
  first_name: string | null;
  last_name: string | null;
  created_at: number;
  last_sign_in_at: number | null;
};

export async function clerkGet(
  path: string,
  deps: NativeAuthDeps,
): Promise<unknown> {
  const response = await (deps.fetch ?? fetch)(
    `https://api.clerk.com/v1/${path}`,
    {
      headers: { Authorization: `Bearer ${nativeConfig(deps).secretKey}` },
      redirect: "error",
      signal: AbortSignal.timeout(4000),
    },
  );
  if (response.status === 429) throw new NativeError(429, "rate_limited");
  if (response.status === 404) throw new NativeError(404, "not_found");
  if (!response.ok) throw new NativeError(503, "bridge_unavailable");
  return await response.json();
}

export function clerkUser(value: unknown): ClerkUser {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NativeError(503, "bridge_unavailable");
  }
  const row = value as ClerkUser;
  if (
    !/^user_[A-Za-z0-9_]{27}$/.test(row.id) ||
    typeof row.banned !== "boolean" ||
    typeof row.locked !== "boolean" || !Array.isArray(row.email_addresses) ||
    !row.email_addresses.every((item) =>
      typeof item.id === "string" && typeof item.email_address === "string"
    ) ||
    ![row.first_name, row.last_name, row.primary_email_address_id].every((
      item,
    ) => item === null || typeof item === "string") ||
    !Number.isFinite(row.created_at) ||
    !(row.last_sign_in_at === null || Number.isFinite(row.last_sign_in_at))
  ) {
    throw new NativeError(503, "bridge_unavailable");
  }
  return row;
}

export async function requireUnblocked(
  subject: string,
  deps: NativeAuthDeps,
): Promise<void> {
  const user = clerkUser(
    await clerkGet(`users/${encodeURIComponent(subject)}`, deps),
  );
  if (user.id !== subject) throw new NativeError(503, "bridge_unavailable");
  if (user.banned || user.locked) throw new NativeError(403, "forbidden");
}

export async function resolveNativeAccount(
  issuer: string,
  subject: string,
): Promise<string> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "native_resolve_account",
    { issuer, subject },
  );
  if (error) throw error;
  if (!isUuid(data)) throw new NativeError(503, "bridge_unavailable");
  return data;
}
