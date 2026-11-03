import { NativeError } from "../_shared/native-auth.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

export type Effect =
  | "clerk_ban"
  | "clerk_unban"
  | "clerk_delete"
  | "storage_cleanup";
export type EffectEvent = {
  request_id: string;
  effect_id: string;
  action: "set_blocked" | "delete_account";
  effect: Effect;
  target_hash: string;
  outcome: "started" | "succeeded" | "unknown";
};
export type EffectRecorder = (
  actor: string,
  event: EffectEvent,
) => Promise<boolean>;
export async function recordEffect(
  actor: string,
  event: EffectEvent,
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "native_admin_record_effect",
    {
      p_actor: actor,
      p_event: event,
    },
  );
  if (error) throw error;
  return data === true;
}

// Intents commit in their own RPC before touching a provider. A lost result ACK
// leaves an identifiable pending intent; it never retries a remote write.
export function effectAudit(
  actor: string,
  requestId: string,
  record: EffectRecorder,
) {
  return async <T>(
    action: EffectEvent["action"],
    effect: Effect,
    subject: string,
    work: () => Promise<T>,
  ): Promise<T> => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(subject),
    );
    const event: EffectEvent = {
      request_id: requestId,
      effect_id: crypto.randomUUID(),
      action,
      effect,
      target_hash: Array.from(
        new Uint8Array(digest),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join(""),
      outcome: "started",
    };
    const write = async (outcome: EffectEvent["outcome"]) => {
      try {
        if (await record(actor, { ...event, outcome }) === true) return;
      } catch {
        // The durable intent, if committed, is the recovery source. Do not log
        // a provider/SQL error that could contain identities or request bodies.
      }
      throw new NativeError(503, "account_change_incomplete");
    };
    await write("started");
    let result: T;
    try {
      result = await work();
    } catch (error) {
      // A timeout/error cannot prove that the provider did not apply a write.
      await write("unknown");
      throw error;
    }
    await write("succeeded");
    return result;
  };
}
