import { useCallback, useEffect, useMemo, useState } from "react";
import { Events } from "@wailsio/runtime";

/** Matches `applog.DefaultCapacity` in the backend. */
const RING_CAPACITY = 200;

/** The three severities the backend ring publishes. */
export const LOG_LEVELS = ["info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** One line of the backend log, as `internal/applog` serialises it. */
export type LogEntry = {
  /** Rises monotonically, so a push that races its snapshot cannot duplicate. */
  seq: number;
  time: string;
  level: LogLevel;
  message: string;
};

/** The filter also has an "all" position, which is not a level the backend knows. */
export type LogFilter = LogLevel | "all";

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && (LOG_LEVELS as readonly string[]).includes(value);
}

/**
 * Entries arrive from a process we do not control, so anything malformed is
 * dropped rather than rendered as `undefined`.
 */
function toEntry(value: unknown): LogEntry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.seq !== "number" || !Number.isFinite(candidate.seq)) return null;
  if (typeof candidate.message !== "string") return null;
  if (typeof candidate.time !== "string") return null;
  return {
    seq: candidate.seq,
    time: candidate.time,
    // An unknown level is shown as info rather than hiding the line: the
    // message is still worth reading.
    level: isLogLevel(candidate.level) ? candidate.level : "info",
    message: candidate.message,
  };
}

/**
 * The last entries the backend logged.
 *
 * The hub asks once for the ring and is pushed each new entry after that. When
 * no backend is listening the hook stays `available: false` for good, which is
 * what lets Diagnostics say "no log channel" instead of "no events yet" -- two
 * different things to tell the user.
 */
export function useAppLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [path, setPath] = useState<string>("");
  const [available, setAvailable] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const handlers: (() => void)[] = [];

    handlers.push(
      Events.On("applog", (event: { data?: unknown }) => {
        const payload = (event.data ?? {}) as Record<string, unknown>;
        const incoming = Array.isArray(payload.entries) ? payload.entries : [];
        setEntries(incoming.map(toEntry).filter((entry): entry is LogEntry => entry !== null));
        setPath(typeof payload.path === "string" ? payload.path : "");
        setAvailable(payload.available === true);
        setLoaded(true);
      }),
    );

    handlers.push(
      Events.On("applog:entry", (event: { data?: unknown }) => {
        const entry = toEntry(event.data);
        if (!entry) return;
        setAvailable(true);
        setLoaded(true);
        setEntries((previous) => {
          // A push can arrive before the snapshot that already contains it.
          if (previous.some((existing) => existing.seq === entry.seq)) return previous;
          const next = [...previous, entry];
          // Mirror the backend ring so a long session cannot grow this list
          // without bound.
          return next.length > RING_CAPACITY ? next.slice(next.length - RING_CAPACITY) : next;
        });
      }),
    );

    Events.Emit("applog:get");

    return () => {
      handlers.forEach((handler) => handler?.());
    };
  }, []);

  return {
    entries,
    path,
    available,
    loaded,
    refresh: useCallback(() => Events.Emit("applog:get"), []),
  };
}

/** Newest first, because that is where a reader looks after something breaks. */
export function useVisibleLogEntries(entries: LogEntry[], filter: LogFilter): LogEntry[] {
  return useMemo(() => {
    const matching = filter === "all" ? entries : entries.filter((entry) => entry.level === filter);
    return [...matching].reverse();
  }, [entries, filter]);
}

/**
 * The clipboard form is the file format: timestamp, level, message. Someone
 * pasting this into a support thread should get the same lines the log file
 * holds, not a re-rendering of the UI.
 */
export function formatLogForClipboard(entries: LogEntry[]): string {
  return entries
    .map((entry) => `${entry.time} ${entry.level.toUpperCase().padEnd(5)} ${entry.message}`)
    .join("\n");
}

/** How many entries sit at each level, for the filter's counters. */
export function countByLevel(entries: LogEntry[]): Record<LogFilter, number> {
  const counts: Record<LogFilter, number> = { all: entries.length, info: 0, warn: 0, error: 0 };
  for (const entry of entries) {
    counts[entry.level] += 1;
  }
  return counts;
}
