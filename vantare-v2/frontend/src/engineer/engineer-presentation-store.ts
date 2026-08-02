export const ENGINEER_PRESENTATION_EVENT = "engineer:notification";
export const ENGINEER_STATUS_EVENT = "engineer:status";

export type EngineerLocale = "es" | "en" | "it" | "pt-BR";
export type EngineerRole = "spotter" | "engineer";
export type EngineerSeverity = "info" | "warning" | "critical";

export type EngineerPresentation = {
  version: 1;
  id: string;
  category: string;
  severity: EngineerSeverity;
  textKey: string;
  text: string;
  voiceText: string;
  locale: EngineerLocale;
  role: EngineerRole;
  channel: EngineerRole;
  priority: number;
  createdAt: number;
  expiresAt: number;
  source: "telemetry-core";
};

type TimerHandle = ReturnType<typeof setTimeout>;

export type EngineerPresentationStore = {
  publish(input: unknown): boolean;
  clear(reason?: string): void;
  getSnapshot(): EngineerPresentation | null;
  subscribe(listener: () => void): () => void;
  dispose(): void;
};

type StoreOptions = {
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancelSchedule?: (handle: TimerHandle) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoundedString(
  value: unknown,
  field: string,
  allowed?: readonly string[],
): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || value.includes("\0")) {
    throw new Error(`invalid engineer presentation ${field}`);
  }
  if (allowed && !allowed.includes(value)) {
    throw new Error(`unsupported engineer presentation ${field}`);
  }
  return value;
}

function readFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`invalid engineer presentation ${field}`);
  }
  return value;
}

export function parseEngineerPresentation(input: unknown): EngineerPresentation {
  if (!isRecord(input) || input.version !== 1) {
    throw new Error("unsupported engineer presentation version");
  }
  const createdAt = readFiniteNumber(input.createdAt, "createdAt");
  const expiresAt = readFiniteNumber(input.expiresAt, "expiresAt");
  if (createdAt < 0 || expiresAt <= createdAt) {
    throw new Error("invalid engineer presentation lifecycle");
  }
  const role = readBoundedString(input.role, "role", ["spotter", "engineer"]) as EngineerRole;
  const channel = readBoundedString(input.channel, "channel", ["spotter", "engineer"]) as EngineerRole;
  if (role !== channel) {
    throw new Error("engineer presentation role/channel mismatch");
  }
  return {
    version: 1,
    id: readBoundedString(input.id, "id"),
    category: readBoundedString(input.category, "category"),
    severity: readBoundedString(input.severity, "severity", ["info", "warning", "critical"]) as EngineerSeverity,
    textKey: readBoundedString(input.textKey, "textKey"),
    text: readBoundedString(input.text, "text"),
    voiceText: readBoundedString(input.voiceText, "voiceText"),
    locale: readBoundedString(input.locale, "locale", ["es", "en", "it", "pt-BR"]) as EngineerLocale,
    role,
    channel,
    priority: readFiniteNumber(input.priority, "priority"),
    createdAt,
    expiresAt,
    source: readBoundedString(input.source, "source", ["telemetry-core"]) as "telemetry-core",
  };
}

export function createEngineerPresentationStore(
  options: StoreOptions = {},
): EngineerPresentationStore {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancelSchedule = options.cancelSchedule ?? clearTimeout;
  const listeners = new Set<() => void>();
  let current: EngineerPresentation | null = null;
  let expiryHandle: TimerHandle | null = null;

  const notify = () => {
    for (const listener of listeners) listener();
  };
  const cancelExpiry = () => {
    if (expiryHandle !== null) cancelSchedule(expiryHandle);
    expiryHandle = null;
  };
  const clear: EngineerPresentationStore["clear"] = () => {
    cancelExpiry();
    if (current === null) return;
    current = null;
    notify();
  };
  const publish = (input: unknown) => {
    let next: EngineerPresentation;
    try {
      next = parseEngineerPresentation(input);
    } catch {
      return false;
    }
    cancelExpiry();
    if (next.expiresAt <= now()) {
      clear("already-expired");
      return false;
    }
    current = next;
    expiryHandle = schedule(() => {
      if (current?.id === next.id && now() >= next.expiresAt) clear("canonical-expiry");
    }, Math.max(0, next.expiresAt - now()));
    notify();
    return true;
  };

  return {
    publish,
    clear,
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      cancelExpiry();
      current = null;
      listeners.clear();
    },
  };
}
