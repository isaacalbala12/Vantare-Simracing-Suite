const REDACTED = "[REDACTED]";
const urlKeyPattern = /(?:^|[_$-])(?:current_)?url$/iu;
const sensitiveKeys = new Set([
  "access_token",
  "api_key",
  "auth_token",
  "authorization",
  "cookie",
  "display_name",
  "e_mail",
  "email",
  "first_name",
  "last_name",
  "name",
  "password",
  "refresh_token",
  "secret",
  "user_id",
  "username",
]);
const safeErrorNames = new Set([
  "AggregateError",
  "Error",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
]);

function normalizeKey(key: string): string {
  return key
    .replace(/([a-z\d])([A-Z])/gu, "$1_$2")
    .replace(/[-$]/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .toLowerCase();
}

export function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value, window.location.origin);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return REDACTED;
  }
}

function sanitizeValue(value: unknown, key: string): unknown {
  const normalizedKey = normalizeKey(key);
  const isPublicProjectToken =
    normalizedKey === "token" &&
    typeof value === "string" &&
    value.startsWith("phc_");
  if (sensitiveKeys.has(normalizedKey) || (normalizedKey === "token" && !isPublicProjectToken)) {
    return REDACTED;
  }

  if (typeof value === "string" && urlKeyPattern.test(key)) {
    return sanitizeUrl(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, ""));
  }

  if (value !== null && typeof value === "object") {
    return sanitizeCapturePayload(value as Record<string, unknown>);
  }

  return value;
}

export function sanitizeCapturePayload<T extends Record<string, unknown>>(
  payload: T,
): T {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      sanitizeValue(value, key),
    ]),
  ) as T;
}

function sanitizeStackFrame(frame: string): string | null {
  const match = frame.match(/(?:\(|\s)([^()\s]+):(\d+):(\d+)\)?$/u);
  if (!match) return null;

  const rawLocation = match[1];
  let pathname: string;
  try {
    pathname = new URL(rawLocation).pathname;
  } catch {
    pathname = rawLocation.split(/[?#]/u, 1)[0];
  }
  const basename = pathname.replace(/\\/gu, "/").split("/").at(-1);
  const safeBasename =
    basename && /^[a-z\d._-]+$/iu.test(basename) ? basename : "frame";
  return `    at frame (${safeBasename}:${match[2]}:${match[3]})`;
}

export function createSanitizedException(error: unknown): Error {
  const source = error instanceof Error ? error : null;
  const name = source && safeErrorNames.has(source.name) ? source.name : "Error";
  const sanitized = new Error("Vantare frontend exception");
  sanitized.name = name;

  const frames = (source?.stack ?? "")
    .split("\n")
    .slice(1)
    .map(sanitizeStackFrame)
    .filter((frame): frame is string => frame !== null)
    .slice(0, 20);
  sanitized.stack = [`${name}: ${sanitized.message}`, ...frames].join("\n");
  return sanitized;
}
