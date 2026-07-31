import type {
  DiagnosticsClient,
} from "./diagnostics-client";
import type {
  DiagnosticsReport,
  DiagnosticsSession,
  PreparedDiagnostics,
} from "./contracts";

export const fixtureGeneratedAtUtc = "2026-07-31T10:15:30Z";

const fixtureReport: DiagnosticsReport = {
  schemaVersion: 1,
  generatedAtUtc: fixtureGeneratedAtUtc,
  application: {
    version: "v0.3.10.0",
    os: "windows",
    arch: "amd64",
    goVersion: "go1.25.0",
    numCpu: 16,
  },
  telemetry: {
    source: "lmu",
    live: true,
    available: true,
  },
  settings: {
    schemaVersion: 3,
    deltaMode: "self",
    cpuSampling: true,
    hotkeyCount: 3,
    overlayProfileConfigured: true,
    betaWelcomeCompleted: true,
    launcherTriggerEnabled: false,
    launcherOnboardingComplete: true,
  },
  activeProfile: {
    present: true,
    displayMode: "racing",
    widgetCount: 4,
    widgetTypes: ["delta", "pedals", "relative", "standings"],
  },
  launcher: {
    appCount: 4,
    profileCount: 1,
    favoriteApps: 2,
    detectedApps: 3,
    categories: [
      { name: "simulator", count: 1 },
      { name: "telemetry", count: 3 },
    ],
    methods: [
      { name: "executable", count: 3 },
      { name: "steam-uri", count: 1 },
    ],
  },
};

export const fixturePayload = JSON.stringify(fixtureReport, null, 2);

export const fixturePrepared: PreparedDiagnostics = {
  schemaVersion: 1,
  generatedAtUtc: fixtureGeneratedAtUtc,
  payload: fixturePayload,
  sha256: "64d3f8a83cb0008ea2d8a15d1a43a966474cef69c03b51f1b776ebd90db28617",
  byteSize: new TextEncoder().encode(fixturePayload).byteLength,
  report: fixtureReport,
};

export const fixtureCurrentSession: DiagnosticsSession = {
  handle: "diag-11111111111111111111111111111111",
  compatibility: "current",
  availability: "ready",
  manifestVersion: 1,
  schemaVersion: 1,
  simulator: "lmu",
  startedAtUtc: "2026-07-31T09:00:00Z",
  endedAtUtc: "2026-07-31T10:00:00Z",
  integrity: "complete",
  observedCount: 18_240,
  factCount: 132,
  countsKnown: true,
  lapCount: 18,
  vehicleCount: 42,
  fields: [
    { name: "speed", present: true },
    { name: "throttle", present: true },
    { name: "brake", present: true },
    { name: "gear", present: true },
    { name: "pit", present: true },
    { name: "factValue", present: true },
  ],
  quality: [
    { quality: "current", count: 17_912 },
    { quality: "stale", count: 21 },
    { quality: "missing", count: 307 },
  ],
  inspectionTruncated: false,
};

export const fixtureFutureSession: DiagnosticsSession = {
  ...fixtureCurrentSession,
  handle: "diag-22222222222222222222222222222222",
  compatibility: "future",
  availability: "metadata_only",
  manifestVersion: 2,
  schemaVersion: 2,
  startedAtUtc: "2026-07-30T19:00:00Z",
  endedAtUtc: undefined,
  integrity: "recording",
  observedCount: 0,
  factCount: 0,
  countsKnown: false,
  lapCount: 0,
  vehicleCount: 0,
  fields: [],
  quality: [],
};

export const fixtureCorruptSession: DiagnosticsSession = {
  ...fixtureCurrentSession,
  handle: "diag-33333333333333333333333333333333",
  compatibility: "corrupt",
  availability: "unavailable",
  unavailableReason: "invalid_manifest",
  manifestVersion: 0,
  schemaVersion: 0,
  startedAtUtc: "2026-07-29T16:00:00Z",
  endedAtUtc: undefined,
  integrity: "unknown",
  observedCount: 0,
  factCount: 0,
  countsKnown: false,
  lapCount: 0,
  vehicleCount: 0,
  fields: [],
  quality: [],
};

export function createFixtureDiagnosticsClient(
  delayMs = 20,
): DiagnosticsClient {
  const wait = <T>(value: T, signal?: AbortSignal): Promise<T> =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      }, delayMs);
      const onAbort = () => {
        clearTimeout(timeout);
        reject(new DOMException("cancelled", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });

  return {
    prepare(signal) {
      return wait(fixturePrepared, signal);
    },
    listSessions(options) {
      return wait(
        {
          sessions: [
            fixtureCurrentSession,
            fixtureFutureSession,
            fixtureCorruptSession,
          ],
          truncated: false,
        },
        options?.signal,
      );
    },
    inspectSession(handle, signal) {
      const session = [
        fixtureCurrentSession,
        fixtureFutureSession,
        fixtureCorruptSession,
      ].find((entry) => entry.handle === handle);
      if (!session) {
        return Promise.reject(new Error("fixture session missing"));
      }
      return wait(session, signal);
    },
  };
}
