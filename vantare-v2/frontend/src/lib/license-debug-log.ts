export type LicenseDebugLevel = "info" | "warn";

export type LicenseDebugEntry = {
  at: string;
  level: LicenseDebugLevel;
  scope: string;
  message: string;
  detail?: Record<string, unknown>;
};

const MAX_ENTRIES = 50;
let entries: LicenseDebugEntry[] = [];
let wailsMockActive = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

export function setWailsRuntimeMockActive(active: boolean): void {
  wailsMockActive = active;
  notify();
}

export function isWailsRuntimeMockActive(): boolean {
  return wailsMockActive;
}

export function pushLicenseDebugEntry(
  level: LicenseDebugLevel,
  scope: string,
  message: string,
  detail?: Record<string, unknown>,
): void {
  entries = [
    {
      at: new Date().toISOString(),
      level,
      scope,
      message,
      detail,
    },
    ...entries,
  ].slice(0, MAX_ENTRIES);
  notify();
}

export function getLicenseDebugEntries(): LicenseDebugEntry[] {
  return entries;
}

export function subscribeLicenseDebug(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function formatLicenseDebugReport(
  licenseSnapshot?: Record<string, unknown> | null,
): string {
  const lines = [
    "=== Vantare license diagnóstico ===",
    `mock_runtime=${wailsMockActive}`,
    licenseSnapshot
      ? `license=${JSON.stringify(licenseSnapshot)}`
      : "license=null",
    "--- eventos recientes ---",
    ...entries.map((e) => {
      const detail = e.detail ? ` ${JSON.stringify(e.detail)}` : "";
      return `${e.at} [${e.level}] ${e.scope}: ${e.message}${detail}`;
    }),
  ];
  return lines.join("\n");
}