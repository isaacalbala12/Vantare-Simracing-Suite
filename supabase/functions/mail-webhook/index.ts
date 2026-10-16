import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { readJsonObject } from "../_shared/request.ts";
export async function handleMailWebhook(
  request: Request,
  deps: {
    env?: (name: string) => string | undefined;
    unsubscribe?: (email: string) => Promise<void>;
  } = {},
): Promise<Response> {
  const response = (status: number) =>
    new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "POST") return response(405);
  const secret = (deps.env ?? Deno.env.get)("BREVO_WEBHOOK_KEY");
  if (!secret || secret.length < 32) return response(503);
  // Brevo webhook custom header: no credentials in URL/query/logs.
  const got = request.headers.get("X-Vantare-Webhook-Key") ?? "";
  const hash = (s: string) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  const a = new Uint8Array(await hash(secret)),
    b = new Uint8Array(await hash(got));
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference !== 0) return response(401);
  const body = await readJsonObject(request, 8192);
  if (!body.ok) return response(400);
  const { email, event } = body.value;
  if (typeof event !== "string") return response(400);
  if (
    !["unsubscribe", "unsubscribed", "spam", "hard_bounce", "blocked"].includes(
      event,
    )
  ) return response(204);
  if (
    typeof email !== "string" || email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) return response(400);
  try {
    await (deps.unsubscribe ?? (async (email) => {
      const { error } = await getSupabaseAdmin().rpc("mail_unsubscribe", {
        p_email: email,
      });
      if (error) throw error;
    }))(email);
    return response(204);
  } catch {
    return response(503);
  }
}
if (import.meta.main) Deno.serve((request) => handleMailWebhook(request));
