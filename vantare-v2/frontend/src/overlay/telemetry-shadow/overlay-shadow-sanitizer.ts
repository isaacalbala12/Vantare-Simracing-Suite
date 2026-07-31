export const OVERLAY_SHADOW_MAX_ENTRIES = 64;

const MAX_PATH_LENGTH = 120;
const SAFE_PATH = /^[a-z][A-Za-z0-9]*(?:\[\])?(?:\.[a-z][A-Za-z0-9]*(?:\[\])?)*$/;
const NUMBER_PRECISION = 1_000_000;

export type ShadowDisclosure =
  | Readonly<{ kind: "number" }>
  | Readonly<{ kind: "boolean" }>
  | Readonly<{ kind: "presence" }>
  | Readonly<{ kind: "redacted" }>
  | Readonly<{ kind: "enum"; allowed: readonly string[] }>;

export type SanitizedShadowObservation =
  | Readonly<{ kind: "number"; legacy?: number; projection?: number }>
  | Readonly<{ kind: "boolean"; legacy?: boolean; projection?: boolean }>
  | Readonly<{ kind: "presence"; legacy: boolean; projection: boolean }>
  | Readonly<{ kind: "enum"; legacy?: string; projection?: string }>
  | Readonly<{ kind: "redacted" }>;

export function sanitizeShadowObservation(
  legacy: unknown,
  projection: unknown,
  disclosure: ShadowDisclosure,
): SanitizedShadowObservation {
  switch (disclosure.kind) {
    case "number": {
      if (!isFiniteOptionalNumber(legacy) || !isFiniteOptionalNumber(projection)) {
        return { kind: "redacted" };
      }
      return compactPair(
        "number",
        roundNumber(legacy),
        roundNumber(projection),
      );
    }
    case "boolean": {
      if (!isOptionalBoolean(legacy) || !isOptionalBoolean(projection)) {
        return { kind: "redacted" };
      }
      return compactPair("boolean", legacy, projection);
    }
    case "presence":
      return {
        kind: "presence",
        legacy: legacy !== undefined,
        projection: projection !== undefined,
      };
    case "enum": {
      if (
        !isAllowedOptionalString(legacy, disclosure.allowed) ||
        !isAllowedOptionalString(projection, disclosure.allowed)
      ) {
        return { kind: "redacted" };
      }
      return compactPair("enum", legacy, projection);
    }
    case "redacted":
      return { kind: "redacted" };
  }
}

export function sanitizeShadowPath(path: string): string {
  if (path.length > MAX_PATH_LENGTH || !SAFE_PATH.test(path)) {
    return "invalid-path";
  }
  return path;
}

export function limitShadowEntries<T>(
  entries: readonly T[],
  requestedLimit = OVERLAY_SHADOW_MAX_ENTRIES,
): Readonly<{ entries: readonly T[]; truncated: boolean }> {
  const finiteLimit = Number.isFinite(requestedLimit)
    ? Math.floor(requestedLimit)
    : OVERLAY_SHADOW_MAX_ENTRIES;
  const limit = Math.max(
    0,
    Math.min(OVERLAY_SHADOW_MAX_ENTRIES, finiteLimit),
  );
  return {
    entries: entries.slice(0, limit),
    truncated: entries.length > limit,
  };
}

function isFiniteOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function isAllowedOptionalString(
  value: unknown,
  allowed: readonly string[],
): value is string | undefined {
  return value === undefined || (typeof value === "string" && allowed.includes(value));
}

function roundNumber(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const scaled = value * NUMBER_PRECISION;
  return Number.isFinite(scaled)
    ? Math.round(scaled) / NUMBER_PRECISION
    : value;
}

function compactPair<Kind extends "number" | "boolean" | "enum", Value>(
  kind: Kind,
  legacy: Value | undefined,
  projection: Value | undefined,
): Readonly<{ kind: Kind; legacy?: Value; projection?: Value }> {
  return {
    kind,
    ...(legacy === undefined ? {} : { legacy }),
    ...(projection === undefined ? {} : { projection }),
  };
}
