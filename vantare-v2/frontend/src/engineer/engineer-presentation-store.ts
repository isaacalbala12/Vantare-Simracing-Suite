export const ENGINEER_STREAM_EVENT = "engineer:stream";

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
  consumeStream(input: unknown): boolean;
  clear(reason?: string): void;
  getSnapshot(): EngineerPresentation | null;
  getSubtitlesEnabled(): boolean;
  subscribe(listener: () => void): () => void;
  resetTransport(): void;
  dispose(): void;
};

type EngineerStreamEnvelope = {
  version: 1;
  sequence: number;
  generation: number;
  kind: "snapshot" | "status" | "presentation";
  active: boolean;
  presentation?: unknown;
  status?: { subtitlesEnabled?: boolean };
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

function parseEngineerStreamEnvelope(input: unknown): EngineerStreamEnvelope {
  if (!isRecord(input) || input.version !== 1) throw new Error("unsupported engineer stream version");
  const sequence = readFiniteNumber(input.sequence, "sequence");
  const generation = readFiniteNumber(input.generation, "generation");
  if (!Number.isSafeInteger(sequence) || sequence < 1 || !Number.isSafeInteger(generation) || generation < 0) {
    throw new Error("invalid engineer stream cursor");
  }
  const kind = readBoundedString(input.kind, "kind", ["snapshot", "status", "presentation"]) as EngineerStreamEnvelope["kind"];
  if (typeof input.active !== "boolean") throw new Error("invalid engineer stream active state");
  const status = isRecord(input.status)
    ? { ...(typeof input.status.subtitlesEnabled === "boolean" ? { subtitlesEnabled: input.status.subtitlesEnabled } : {}) }
    : undefined;
  return { version: 1, sequence, generation, kind, active: input.active, presentation: input.presentation, status };
}

export function createEngineerPresentationStore(
  options: StoreOptions = {},
): EngineerPresentationStore {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancelSchedule = options.cancelSchedule ?? clearTimeout;
  const listeners = new Set<() => void>();
  let current: EngineerPresentation | null = null;
  let subtitlesEnabled = true;
  let generation = -1;
  let sequence = 0;
  let awaitingSnapshot = true;
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
  const consumeStream = (input: unknown) => {
    let event: EngineerStreamEnvelope;
    try {
      event = parseEngineerStreamEnvelope(input);
    } catch {
      return false;
    }
    if (awaitingSnapshot && event.kind !== "snapshot") return false;
    if (event.kind === "snapshot" && event.active) {
      try {
        parseEngineerPresentation(event.presentation);
      } catch {
        return false;
      }
    }
    if (!awaitingSnapshot && (event.sequence <= sequence || event.generation < generation)) return false;
    if (awaitingSnapshot) {
      awaitingSnapshot = false;
      generation = event.generation;
      sequence = event.sequence;
    } else {
      sequence = event.sequence;
    }
    if (event.generation > generation) {
      generation = event.generation;
      clear("canonical-generation");
    }
    if (event.status?.subtitlesEnabled !== undefined && subtitlesEnabled !== event.status.subtitlesEnabled) {
      subtitlesEnabled = event.status.subtitlesEnabled;
      notify();
    }
    if ((event.kind === "snapshot" || event.kind === "presentation") && event.active) {
      const published = publish(event.presentation);
      return event.kind === "snapshot" ? true : published;
    }
    if (!event.active) clear("canonical-empty");
    return true;
  };

  return {
    publish,
    consumeStream,
    clear,
    getSnapshot: () => current,
    getSubtitlesEnabled: () => subtitlesEnabled,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    resetTransport() {
      awaitingSnapshot = true;
      generation = -1;
      sequence = 0;
      clear("transport-reset");
    },
    dispose() {
      cancelExpiry();
      current = null;
      awaitingSnapshot = true;
      generation = -1;
      sequence = 0;
      listeners.clear();
    },
  };
}
