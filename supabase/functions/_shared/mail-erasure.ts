import { getSupabaseAdmin } from "./supabase-admin.ts";
import { NativeError } from "./native-auth.ts";
export type MailRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<unknown>;
export type ErasureDeps = {
  env?: (key: string) => string | undefined;
  fetch?: typeof fetch;
  rpc?: MailRpc;
};
export async function mailRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await getSupabaseAdmin().rpc(name, args);
  if (error) throw error;
  return data;
}
export async function secretMatches(
  got: string,
  expected: string,
): Promise<boolean> {
  const hash = (s: string) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  const a = new Uint8Array(await hash(got)),
    b = new Uint8Array(await hash(expected));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
/** Queue-only worker: caller never supplies a recipient. DELETE 404 is an idempotent ACK. */
export async function drainMailErasures(
  deps: ErasureDeps = {},
): Promise<{ processed: number }> {
  const env = deps.env ?? Deno.env.get;
  const rpc = deps.rpc ?? mailRpc;
  await rpc("mail_erasure_expire", {});
  if (env("MARKETING_CLEANUP_ENABLED") !== "true" || !env("BREVO_API_KEY")) {
    throw new NativeError(503, "mail_cleanup_disabled");
  }
  let processed = 0;
  for (let i = 0; i < 5; i++) {
    if (env("MARKETING_CLEANUP_ENABLED") !== "true") break;
    const result = await rpc("mail_erasure_claim", {}) as {
      job: null | { id: string; lease: string; email: string };
    };
    if (!result.job) break;
    const job = result.job;
    let status = 0;
    try {
      const response = await (deps.fetch ?? fetch)(
        `https://api.brevo.com/v3/contacts/${
          encodeURIComponent(job.email)
        }?identifierType=email_id`,
        {
          method: "DELETE",
          headers: { "api-key": env("BREVO_API_KEY")! },
          redirect: "error",
          signal: AbortSignal.timeout(4000),
        },
      );
      status = response.status;
      await response.body?.cancel();
    } catch {
      /* Transport outcome is retried safely with DELETE, never logged. */
    }
    const ack = await rpc("mail_erasure_finish", {
      p_id: job.id,
      p_lease: job.lease,
      p_http_status: status,
    });
    if (ack !== true) {
      throw new NativeError(503, "mail_cleanup_unconfirmed");
    }
    processed++;
  }
  return { processed };
}
