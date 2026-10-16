import {
  drainMailErasures,
  type ErasureDeps,
  secretMatches,
} from "../_shared/mail-erasure.ts";
import { readJsonObject } from "../_shared/request.ts";
export async function handleMailCleanup(
  request: Request,
  deps: ErasureDeps = {},
): Promise<Response> {
  const reply = (status: number, body: unknown) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "POST") return reply(405, { ok: false });
  const secret = (deps.env ?? Deno.env.get)("MAIL_CLEANUP_KEY");
  if (!secret || secret.length < 32) return reply(503, { ok: false });
  const got =
    /^Bearer ([^\s]+)$/.exec(request.headers.get("Authorization") ?? "")?.[1] ??
      "";
  if (got.length > 512 || !await secretMatches(got, secret)) {
    return reply(401, { ok: false });
  }
  const parsed = await readJsonObject(request, 1024);
  if (
    !parsed.ok || parsed.value.version !== 1 ||
    Object.keys(parsed.value).length !== 1
  ) return reply(400, { ok: false });
  try {
    return reply(200, { ok: true, ...await drainMailErasures(deps) });
  } catch {
    return reply(503, { ok: false });
  }
}
if (import.meta.main) Deno.serve((request) => handleMailCleanup(request));
