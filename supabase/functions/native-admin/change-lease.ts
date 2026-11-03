import { NativeError } from "../_shared/native-auth.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
type Obj = Record<string, unknown>;
export type ChangeDeps = {
  claimChange?: (
    actor: string,
    request: string,
    account: string,
  ) => Promise<string | null>;
  releaseChange?: (
    actor: string,
    request: string,
    account: string,
    token: string,
  ) => Promise<boolean>;
  finishChange?: (
    actor: string,
    issuer: string,
    params: Obj,
    environment: string,
    request: string,
    token: string,
  ) => Promise<Obj>;
};
async function rpc(name: string, args: Obj): Promise<unknown> {
  const { data, error } = await getSupabaseAdmin().rpc(name, args);
  if (error) throw error;
  return data;
}
export const claimChange: NonNullable<ChangeDeps["claimChange"]> = async (
  actor,
  request,
  account,
) => {
  const data = await rpc("native_admin_claim_change", {
    p_actor: actor,
    p_request: request,
    p_account: account,
  });
  if (
    data === null || typeof data === "string" && /^[0-9a-f-]{36}$/.test(data)
  ) return data;
  throw new NativeError(503, "account_change_incomplete");
};
export const releaseChange: NonNullable<ChangeDeps["releaseChange"]> = async (
  actor,
  request,
  account,
  token,
) =>
  await rpc("native_admin_release_change", {
    p_actor: actor,
    p_request: request,
    p_account: account,
    p_token: token,
  }) === true;
export const finishChange: NonNullable<ChangeDeps["finishChange"]> = async (
  actor,
  issuer,
  params,
  environment,
  request,
  token,
) => {
  const data = await rpc("native_admin_finish_change", {
    p_actor: actor,
    p_issuer: issuer,
    p_params: params,
    p_environment: environment,
    p_request: request,
    p_token: token,
  });
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new NativeError(503, "account_change_incomplete");
  }
  return data as Obj;
};
