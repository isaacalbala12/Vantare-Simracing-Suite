import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { verifyUnsubscribe } from "./tokens.ts";
export type UnsubscribeDeps = {
  env?: (key: string) => string | undefined;
  unsubscribe?: (email: string) => Promise<void>;
};
export async function handleUnsubscribe(
  request: Request,
  deps: UnsubscribeDeps = {},
): Promise<Response> {
  const reply = (message: string, status: number) =>
    new Response(message, {
      status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  try {
    if (!["GET", "POST"].includes(request.method)) {
      return reply("Method not allowed", 405);
    }
    const secret = (deps.env ?? Deno.env.get)("MARKETING_UNSUBSCRIBE_KEY");
    if (!secret || secret.length < 32) return reply("Unavailable", 503);
    const email = await verifyUnsubscribe(
      new URL(request.url).searchParams.get("t") ?? "",
      secret,
    );
    if (!email) return reply("Invalid unsubscribe link", 400);
    await (deps.unsubscribe ?? (async (email) => {
      const { error } = await getSupabaseAdmin().rpc("mail_unsubscribe", {
        p_email: email,
      });
      if (error) throw error;
    }))(email);
    return reply(
      "Baja completada. You are unsubscribed from all Vantare marketing emails. Tutte le email annullate. Todos os e-mails cancelados.",
      200,
    );
  } catch {
    return reply("Unavailable. Please retry.", 503);
  }
}
if (import.meta.main) Deno.serve((request) => handleUnsubscribe(request));
