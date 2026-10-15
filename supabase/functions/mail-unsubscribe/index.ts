import { mailRpc } from "../_shared/mail-erasure.ts";
import { verifyUnsubscribe } from "./tokens.ts";
export type UnsubscribeDeps = {
  env?: (key: string) => string | undefined;
  unsubscribe?: (email: string) => Promise<void>;
  forget?: (email: string) => Promise<void>;
};
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
export async function handleUnsubscribe(
  request: Request,
  deps: UnsubscribeDeps = {},
): Promise<Response> {
  const reply = (message: string, status: number) =>
    new Response(message, {
      status,
      headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
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
    if (request.method === "GET") {
      return new Response(
        `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Vantare · Preferencias de correo</title><h1>Correos de Vantare</h1><p>Confirma la baja de todos los correos de novedades y ofertas.</p><p>Unsubscribe from all emails · Annulla tutte le email · Cancelar todos os e-mails</p><form method="post"><button name="action" value="unsubscribe">Darme de baja · Unsubscribe</button></form><hr><p>Si solo estás en la lista de espera, puedes borrar también tus datos de esa lista y de Brevo.</p><form method="post"><button name="action" value="forget">Borrar mis datos de la lista de espera</button></form></html>`,
        {
          status: 200,
          headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
        },
      );
    }
    const type = request.headers.get("Content-Type")?.split(";")[0].trim()
      .toLowerCase();
    if (type !== "application/x-www-form-urlencoded") {
      return reply("Invalid request", 400);
    }
    const declared = Number(request.headers.get("Content-Length"));
    if (declared > 1024) return reply("Request too large", 413);
    const reader = request.body?.getReader();
    let body = "";
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 1024) {
            await reader.cancel();
            return reply("Request too large", 413);
          }
          body += new TextDecoder().decode(part.value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const form = new URLSearchParams(body);
    const action = form.get("action");
    if (
      [...form.keys()].length !== 1 ||
      !(action === "unsubscribe" || action === "forget" ||
        form.get("List-Unsubscribe") === "One-Click")
    ) return reply("Invalid request", 400);
    if (action === "forget") {
      try {
        await (deps.forget ?? (async (email) => {
          await mailRpc("mail_forget_waitlist", { p_email: email });
        }))(email);
      } catch (error) {
        if (
          error && typeof error === "object" && "message" in error &&
          error.message === "mail_contact_has_account"
        ) {
          return reply(
            "Para borrar una cuenta, utiliza la gestión de cuenta de Vantare.",
            409,
          );
        }
        throw error;
      }
      return reply(
        "Datos de espera borrados. La retirada de Brevo queda en cola hasta confirmarse.",
        200,
      );
    }
    await (deps.unsubscribe ?? (async (email) => {
      await mailRpc("mail_unsubscribe", { p_email: email });
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
