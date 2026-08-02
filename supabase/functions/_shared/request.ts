export type JsonObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; code: "body_too_large" | "invalid_json"; message: string };

export async function readJsonObject(
  request: Request,
  maxBytes: number,
  allowEmpty = false,
): Promise<JsonObjectResult> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return {
      ok: false,
      code: "body_too_large",
      message: "Request body is too large",
    };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return {
            ok: false,
            code: "body_too_large",
            message: "Request body is too large",
          };
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const raw = new TextDecoder().decode(bytes).trim();
  if (!raw && allowEmpty) return { ok: true, value: {} };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        ok: false,
        code: "invalid_json",
        message: "Request body must be a JSON object",
      };
    }
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      code: "invalid_json",
      message: "Request body must be JSON",
    };
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}
