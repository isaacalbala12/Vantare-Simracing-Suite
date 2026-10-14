import type { NativeAuthDeps } from "../../_shared/native-auth.ts";

export const account = "00000000-0000-4000-8000-000000001452";
export const subject = `user_${"u".repeat(27)}`;
export const now = new Date("2026-10-03T12:00:00Z");
export const config = {
  secretKey: "test-secret",
  clientId: "native-test",
  issuer: "https://clerk.example.invalid",
};
export const claims = {
  object: "clerk_idp_oauth_access_token",
  client_id: config.clientId,
  subject,
  scopes: ["openid", "profile"],
  revoked: false,
  expired: false,
  expiration: now.getTime() / 1000 + 3600,
};
export const user = {
  id: subject,
  banned: false,
  locked: false,
  primary_email_address_id: "email-test",
  email_addresses: [{
    id: "email-test",
    email_address: "tester@example.invalid",
  }],
  first_name: "Test",
  last_name: "User",
  created_at: now.getTime() - 1000,
  last_sign_in_at: now.getTime(),
};
export function authDeps(overrides: NativeAuthDeps = {}): NativeAuthDeps {
  return {
    config,
    now: () => now,
    fetch: (url) =>
      Promise.resolve(
        Response.json(String(url).endsWith("/verify") ? claims : user),
      ),
    ...overrides,
  };
}
export function request(
  body: unknown,
  headers: Record<string, string> = {},
  raw = false,
) {
  return new Request("https://local.invalid/native", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-oauth",
      "Content-Type": "application/json",
      ...headers,
    },
    body: raw ? String(body) : JSON.stringify(body),
  });
}
export function assert(
  value: unknown,
  message = "assertion failed",
): asserts value {
  if (!value) throw new Error(message);
}
