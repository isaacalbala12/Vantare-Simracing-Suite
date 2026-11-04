import { NativeError } from "../_shared/native-auth.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

export type Effect =
  | "clerk_ban"
  | "clerk_unban"
  | "clerk_delete"
  | "polar_cancel"
  | "storage_cleanup";
export type EffectEvent = {
  request_id: string;
  effect_id: string;
  action: "set_blocked" | "delete_account";
  effect: Effect;
  target_hash: string;
  outcome: "started" | "succeeded" | "unknown" | "failed";
  provider_status?: number;
};
export class EffectFailure extends NativeError {
  constructor(public providerStatus: number) {
    super(503, "account_change_incomplete");
  }
}
export type EffectRecorder = (
  actor: string,
  event: EffectEvent,
  account: string,
) => Promise<boolean>;
export async function recordEffect(
  actor: string,
  event: EffectEvent,
  account: string,
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "native_admin_record_effect",
    {
      p_actor: actor,
      p_event: event,
      p_account: account,
    },
  );
  if (error) throw error;
  return data === true;
}

// A recorder must confirm the durable write, not merely resolve its RPC.
export async function requireAudit(
  write: () => Promise<unknown>,
  code: string,
) {
  try {
    if (await write() === true) return;
  } catch { /* Never expose SQL, provider or identity details. */ }
  throw new NativeError(503, code);
}

// Intents commit in their own RPC before touching a provider. A lost result ACK
// leaves an identifiable pending intent; it never retries a remote write.
export function effectAudit(
  actor: string,
  requestId: string,
  record: EffectRecorder,
  account: string,
) {
  return async (
    action: EffectEvent["action"],
    effect: Effect,
    subject: string,
    work: () => Promise<number | void>,
  ): Promise<void> => {
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
    const write = (
      outcome: EffectEvent["outcome"],
      provider_status?: number,
    ) =>
      requireAudit(() =>
        record(actor, {
          ...event,
          outcome,
          ...(provider_status === undefined ? {} : { provider_status }),
        }, account), "account_change_incomplete");
    await write("started");
    let result: number | void;
    try {
      result = await work();
    } catch (error) {
      // A timeout/error cannot prove that the provider did not apply a write.
      const status = error instanceof EffectFailure
        ? error.providerStatus
        : undefined;
      await write(
        status !== undefined && [401, 403, 422].includes(status)
          ? "failed"
          : "unknown",
        status,
      );
      throw error;
    }
    await write("succeeded", typeof result === "number" ? result : undefined);
  };
}
