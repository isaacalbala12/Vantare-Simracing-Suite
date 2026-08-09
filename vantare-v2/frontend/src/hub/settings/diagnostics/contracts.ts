const DIAGNOSTICS_SCHEMA_VERSION = 1;
const MAX_DIAGNOSTICS_BYTES = 256 * 1024;
const MAX_SESSIONS = 500;

const TELEMETRY_SOURCES = [
  "unknown",
  "lmu",
  "iracing",
  "assetto-corsa",
  "mock",
] as const;
const DISPLAY_MODES = ["unknown", "racing", "edit", "streaming"] as const;
const WIDGET_TYPES = [
  "delta",
  "standings",
  "relative",
  "pedals",
  "broadcast-tower",
  "fuel-strategy",
  "pedals-telemetry",
  "pedals-telemetry-compact",
  "racing-flags",
  "delta-trace",
  "race-schedule",
  "head-to-head",
  "delta-advanced",
  "input-telemetry",
  "multiclass-relative",
  "track-weather",
  "car-damage-visual",
  "car-damage-numbers",
] as const;
const LAUNCHER_CATEGORIES = [
  "simulator",
  "streaming",
  "audio",
  "telemetry",
  "utility",
] as const;
const LAUNCH_METHODS = ["executable", "steam-uri", "uri", "internal"] as const;
const COMPATIBILITIES = ["current", "future", "corrupt"] as const;
const AVAILABILITIES = ["ready", "metadata_only", "unavailable"] as const;
const UNAVAILABLE_REASONS = [
  "invalid_manifest",
  "inspection_failed",
  "historical_unavailable",
] as const;
const INTEGRITY_STATES = [
  "unknown",
  "opening",
  "recording",
  "complete",
  "incomplete",
  "recovering",
] as const;
const FIELD_NAMES = ["speed", "throttle", "brake", "gear", "pit", "factValue"] as const;
const QUALITY_NAMES = ["unknown", "current", "stale", "missing", "invalid"] as const;

export const DIAGNOSTICS_OPERATIONS = [
  "prepare",
  "sessions.list",
  "sessions.inspect",
] as const;

export const DIAGNOSTICS_ERROR_CODES = [
  "invalid_request",
  "prepare_failed",
  "list_failed",
  "inspect_failed",
  "stale_handle",
  "canceled",
  "unavailable",
  "internal",
] as const;

export type DiagnosticsOperation = (typeof DIAGNOSTICS_OPERATIONS)[number];
export type BackendDiagnosticsErrorCode = (typeof DIAGNOSTICS_ERROR_CODES)[number];
export type DiagnosticsErrorCode =
  | BackendDiagnosticsErrorCode
  | "timeout"
  | "contract_error";

export type DiagnosticsTelemetry = {
  source: (typeof TELEMETRY_SOURCES)[number];
  live: boolean;
  available: boolean;
};

export type DiagnosticsReport = {
  schemaVersion: 1;
  generatedAtUtc: string;
  application: {
    version: string;
    os: string;
    arch: string;
    goVersion: string;
    numCpu: number;
  };
  telemetry: DiagnosticsTelemetry;
  settings?: {
    schemaVersion: number;
    cpuSampling: boolean;
    hotkeyCount: number;
    overlayProfileConfigured: boolean;
    betaWelcomeCompleted: boolean;
    launcherTriggerEnabled: boolean;
    launcherOnboardingComplete: boolean;
  };
  activeProfile?: {
    present: boolean;
    displayMode: (typeof DISPLAY_MODES)[number];
    widgetCount: number;
    widgetTypes: Array<(typeof WIDGET_TYPES)[number]>;
  };
  launcher?: {
    appCount: number;
    profileCount: number;
    favoriteApps: number;
    detectedApps: number;
    categories: DiagnosticsCount[];
    methods: DiagnosticsCount[];
  };
};

export type DiagnosticsCount = {
  name: string;
  count: number;
};

export type PreparedDiagnostics = {
  schemaVersion: 1;
  generatedAtUtc: string;
  payload: string;
  sha256: string;
  byteSize: number;
  report: DiagnosticsReport;
};

export type DiagnosticsSession = {
  handle: string;
  compatibility: (typeof COMPATIBILITIES)[number];
  availability: (typeof AVAILABILITIES)[number];
  unavailableReason?: (typeof UNAVAILABLE_REASONS)[number];
  manifestVersion: number;
  schemaVersion: number;
  simulator: string;
  startedAtUtc: string;
  endedAtUtc?: string;
  integrity: (typeof INTEGRITY_STATES)[number];
  observedCount: number;
  factCount: number;
  countsKnown: boolean;
  lapCount: number;
  vehicleCount: number;
  fields: Array<{
    name: (typeof FIELD_NAMES)[number];
    present: boolean;
  }>;
  quality: Array<{
    quality: (typeof QUALITY_NAMES)[number];
    count: number;
  }>;
  inspectionTruncated: boolean;
};

export type DiagnosticsSessionList = {
  sessions: DiagnosticsSession[];
  truncated: boolean;
};

export type DiagnosticsBackendError = {
  requestId: string;
  operation: DiagnosticsOperation;
  code: BackendDiagnosticsErrorCode;
};

export class DiagnosticsContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiagnosticsContractError";
  }
}

function fail(message: string): never {
  throw new DiagnosticsContractError(message);
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactObject(
  value: unknown,
  name: string,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  const record = object(value, name);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      fail(`${name} contains unknown field ${key}`);
    }
  }
  for (const key of required) {
    if (!(key in record)) {
      fail(`${name} is missing ${key}`);
    }
  }
  return record;
}

function string(value: unknown, name: string, max = 256): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    return fail(`${name} must be a non-empty bounded string`);
  }
  return value;
}

function safeText(value: unknown, name: string, max = 128): string {
  const result = string(value, name, max);
  for (const character of result) {
    if (character.charCodeAt(0) < 32) {
      return fail(`${name} contains control characters`);
    }
  }
  return result;
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    return fail(`${name} must be a boolean`);
  }
  return value;
}

function integer(value: unknown, name: string, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) {
    return fail(`${name} must be a non-negative integer`);
  }
  return value as number;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  name: string,
  allowed: T,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    return fail(`${name} has an unsupported value`);
  }
  return value as T[number];
}

function utc(value: unknown, name: string): string {
  const result = string(value, name, 64);
  if (!result.endsWith("Z") || Number.isNaN(Date.parse(result))) {
    return fail(`${name} must be a UTC timestamp`);
  }
  return result;
}

function requestId(value: unknown): string {
  const result = string(value, "requestId", 64);
  if (result.length < 8 || !/^[A-Za-z0-9_-]+$/u.test(result)) {
    return fail("requestId is invalid");
  }
  return result;
}

function array<T>(
  value: unknown,
  name: string,
  max: number,
  decode: (entry: unknown, index: number) => T,
): T[] {
  if (!Array.isArray(value) || value.length > max) {
    return fail(`${name} must be a bounded array`);
  }
  return value.map(decode);
}

function decodeCount(
  value: unknown,
  name: string,
  allowedNames: readonly string[],
): DiagnosticsCount {
  const record = exactObject(value, name, ["name", "count"]);
  return {
    name: enumValue(record.name, `${name}.name`, allowedNames),
    count: integer(record.count, `${name}.count`),
  };
}

function decodeReport(value: unknown): DiagnosticsReport {
  const root = exactObject(
    value,
    "diagnostics payload",
    ["schemaVersion", "generatedAtUtc", "application", "telemetry"],
    ["settings", "activeProfile", "launcher"],
  );
  if (root.schemaVersion !== DIAGNOSTICS_SCHEMA_VERSION) {
    fail("diagnostics payload schema is unsupported");
  }

  const application = exactObject(
    root.application,
    "diagnostics application",
    ["version", "os", "arch", "goVersion", "numCpu"],
  );
  const telemetry = exactObject(
    root.telemetry,
    "diagnostics telemetry",
    ["source", "live", "available"],
  );

  const report: DiagnosticsReport = {
    schemaVersion: 1,
    generatedAtUtc: utc(root.generatedAtUtc, "diagnostics generatedAtUtc"),
    application: {
      version: safeText(application.version, "application.version", 32),
      os: safeText(application.os, "application.os", 32),
      arch: safeText(application.arch, "application.arch", 32),
      goVersion: safeText(application.goVersion, "application.goVersion", 64),
      numCpu: integer(application.numCpu, "application.numCpu", 4096),
    },
    telemetry: {
      source: enumValue(telemetry.source, "telemetry.source", TELEMETRY_SOURCES),
      live: boolean(telemetry.live, "telemetry.live"),
      available: boolean(telemetry.available, "telemetry.available"),
    },
  };

  if (root.settings !== undefined) {
    const settings = exactObject(
      root.settings,
      "diagnostics settings",
      [
        "schemaVersion",
        "cpuSampling",
        "hotkeyCount",
        "overlayProfileConfigured",
        "betaWelcomeCompleted",
        "launcherTriggerEnabled",
        "launcherOnboardingComplete",
      ],
    );
    report.settings = {
      schemaVersion: integer(settings.schemaVersion, "settings.schemaVersion", 65535),
      cpuSampling: boolean(settings.cpuSampling, "settings.cpuSampling"),
      hotkeyCount: integer(settings.hotkeyCount, "settings.hotkeyCount", 1024),
      overlayProfileConfigured: boolean(
        settings.overlayProfileConfigured,
        "settings.overlayProfileConfigured",
      ),
      betaWelcomeCompleted: boolean(
        settings.betaWelcomeCompleted,
        "settings.betaWelcomeCompleted",
      ),
      launcherTriggerEnabled: boolean(
        settings.launcherTriggerEnabled,
        "settings.launcherTriggerEnabled",
      ),
      launcherOnboardingComplete: boolean(
        settings.launcherOnboardingComplete,
        "settings.launcherOnboardingComplete",
      ),
    };
  }

  if (root.activeProfile !== undefined) {
    const profile = exactObject(
      root.activeProfile,
      "diagnostics active profile",
      ["present", "displayMode", "widgetCount", "widgetTypes"],
    );
    report.activeProfile = {
      present: boolean(profile.present, "activeProfile.present"),
      displayMode: enumValue(profile.displayMode, "activeProfile.displayMode", DISPLAY_MODES),
      widgetCount: integer(profile.widgetCount, "activeProfile.widgetCount", 1024),
      widgetTypes: array(
        profile.widgetTypes,
        "activeProfile.widgetTypes",
        WIDGET_TYPES.length,
        (entry, index) =>
          enumValue(entry, `activeProfile.widgetTypes[${index}]`, WIDGET_TYPES),
      ),
    };
  }

  if (root.launcher !== undefined) {
    const launcher = exactObject(
      root.launcher,
      "diagnostics launcher",
      ["appCount", "profileCount", "favoriteApps", "detectedApps", "categories", "methods"],
    );
    report.launcher = {
      appCount: integer(launcher.appCount, "launcher.appCount", 10000),
      profileCount: integer(launcher.profileCount, "launcher.profileCount", 10000),
      favoriteApps: integer(launcher.favoriteApps, "launcher.favoriteApps", 10000),
      detectedApps: integer(launcher.detectedApps, "launcher.detectedApps", 10000),
      categories: array(launcher.categories, "launcher.categories", 5, (entry, index) =>
        decodeCount(entry, `launcher.categories[${index}]`, LAUNCHER_CATEGORIES),
      ),
      methods: array(launcher.methods, "launcher.methods", 4, (entry, index) =>
        decodeCount(entry, `launcher.methods[${index}]`, LAUNCH_METHODS),
      ),
    };
  }

  return report;
}

function decodePrepared(value: unknown): PreparedDiagnostics {
  const record = exactObject(
    value,
    "prepared diagnostics",
    ["schemaVersion", "generatedAtUtc", "payload", "sha256", "byteSize"],
  );
  if (record.schemaVersion !== DIAGNOSTICS_SCHEMA_VERSION) {
    fail("prepared diagnostics schema is unsupported");
  }
  const payload = string(record.payload, "prepared diagnostics payload", MAX_DIAGNOSTICS_BYTES);
  const byteSize = integer(record.byteSize, "prepared diagnostics byteSize", MAX_DIAGNOSTICS_BYTES);
  if (new TextEncoder().encode(payload).byteLength !== byteSize) {
    fail("prepared diagnostics byteSize does not match payload");
  }
  const sha256 = string(record.sha256, "prepared diagnostics sha256", 64);
  if (!/^[a-f0-9]{64}$/u.test(sha256)) {
    fail("prepared diagnostics sha256 is invalid");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return fail("prepared diagnostics payload is not valid JSON");
  }
  const report = decodeReport(parsed);
  const generatedAtUtc = utc(record.generatedAtUtc, "prepared diagnostics generatedAtUtc");
  if (report.generatedAtUtc !== generatedAtUtc) {
    fail("prepared diagnostics timestamps do not match");
  }
  return {
    schemaVersion: 1,
    generatedAtUtc,
    payload,
    sha256,
    byteSize,
    report,
  };
}

function decodeSession(value: unknown, name: string): DiagnosticsSession {
  const record = exactObject(
    value,
    name,
    [
      "handle",
      "compatibility",
      "availability",
      "manifestVersion",
      "schemaVersion",
      "simulator",
      "startedAtUtc",
      "integrity",
      "observedCount",
      "factCount",
      "countsKnown",
      "lapCount",
      "vehicleCount",
      "fields",
      "quality",
      "inspectionTruncated",
    ],
    ["unavailableReason", "endedAtUtc"],
  );
  const handle = string(record.handle, `${name}.handle`, 64);
  if (handle.length < 8 || !/^[A-Za-z0-9_-]+$/u.test(handle)) {
    fail(`${name}.handle is invalid`);
  }
  return {
    handle,
    compatibility: enumValue(record.compatibility, `${name}.compatibility`, COMPATIBILITIES),
    availability: enumValue(record.availability, `${name}.availability`, AVAILABILITIES),
    ...(record.unavailableReason === undefined
      ? {}
      : {
          unavailableReason: enumValue(
            record.unavailableReason,
            `${name}.unavailableReason`,
            UNAVAILABLE_REASONS,
          ),
        }),
    manifestVersion: integer(record.manifestVersion, `${name}.manifestVersion`, 65535),
    schemaVersion: integer(record.schemaVersion, `${name}.schemaVersion`, 65535),
    simulator: safeText(record.simulator, `${name}.simulator`, 32),
    startedAtUtc: utc(record.startedAtUtc, `${name}.startedAtUtc`),
    ...(record.endedAtUtc === undefined
      ? {}
      : { endedAtUtc: utc(record.endedAtUtc, `${name}.endedAtUtc`) }),
    integrity: enumValue(record.integrity, `${name}.integrity`, INTEGRITY_STATES),
    observedCount: integer(record.observedCount, `${name}.observedCount`),
    factCount: integer(record.factCount, `${name}.factCount`),
    countsKnown: boolean(record.countsKnown, `${name}.countsKnown`),
    lapCount: integer(record.lapCount, `${name}.lapCount`),
    vehicleCount: integer(record.vehicleCount, `${name}.vehicleCount`, 10000),
    fields: array(record.fields, `${name}.fields`, FIELD_NAMES.length, (entry, index) => {
      const field = exactObject(entry, `${name}.fields[${index}]`, ["name", "present"]);
      return {
        name: enumValue(field.name, `${name}.fields[${index}].name`, FIELD_NAMES),
        present: boolean(field.present, `${name}.fields[${index}].present`),
      };
    }),
    quality: array(record.quality, `${name}.quality`, QUALITY_NAMES.length, (entry, index) => {
      const quality = exactObject(entry, `${name}.quality[${index}]`, ["quality", "count"]);
      return {
        quality: enumValue(
          quality.quality,
          `${name}.quality[${index}].quality`,
          QUALITY_NAMES,
        ),
        count: integer(quality.count, `${name}.quality[${index}].count`),
      };
    }),
    inspectionTruncated: boolean(
      record.inspectionTruncated,
      `${name}.inspectionTruncated`,
    ),
  };
}

export function decodePreparedDiagnosticsEvent(value: unknown): {
  requestId: string;
  prepared: PreparedDiagnostics;
} {
  const record = exactObject(value, "prepared diagnostics event", ["requestId", "prepared"]);
  return {
    requestId: requestId(record.requestId),
    prepared: decodePrepared(record.prepared),
  };
}

export function decodeDiagnosticsSessionListEvent(value: unknown): {
  requestId: string;
  result: DiagnosticsSessionList;
} {
  const record = exactObject(value, "diagnostics session list event", ["requestId", "result"]);
  const result = exactObject(record.result, "diagnostics session list", ["sessions", "truncated"]);
  return {
    requestId: requestId(record.requestId),
    result: {
      sessions: array(result.sessions, "diagnostics sessions", MAX_SESSIONS, (entry, index) =>
        decodeSession(entry, `diagnostics sessions[${index}]`),
      ),
      truncated: boolean(result.truncated, "diagnostics sessions truncated"),
    },
  };
}

export function decodeDiagnosticsSessionInspectEvent(value: unknown): {
  requestId: string;
  session: DiagnosticsSession;
} {
  const record = exactObject(value, "diagnostics session inspect event", ["requestId", "session"]);
  return {
    requestId: requestId(record.requestId),
    session: decodeSession(record.session, "diagnostics inspected session"),
  };
}

export function decodeDiagnosticsErrorEvent(value: unknown): DiagnosticsBackendError {
  const record = exactObject(value, "diagnostics error event", [
    "requestId",
    "operation",
    "code",
  ]);
  return {
    requestId: requestId(record.requestId),
    operation: enumValue(record.operation, "diagnostics error operation", DIAGNOSTICS_OPERATIONS),
    code: enumValue(record.code, "diagnostics error code", DIAGNOSTICS_ERROR_CODES),
  };
}
