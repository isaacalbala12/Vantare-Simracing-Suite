import { pushLicenseDebugEntry } from "./license-debug-log";

const PREFIX = "[vantare:license]";

function enabled(): boolean {
  return import.meta.env.DEV;
}

export function licenseDebug(
  scope: string,
  message: string,
  detail?: Record<string, unknown>,
): void {
  pushLicenseDebugEntry("info", scope, message, detail);
  if (!enabled()) return;
  if (detail && Object.keys(detail).length > 0) {
    console.info(`${PREFIX} ${scope}: ${message}`, detail);
    return;
  }
  console.info(`${PREFIX} ${scope}: ${message}`);
}

export function licenseDebugWarn(
  scope: string,
  message: string,
  detail?: Record<string, unknown>,
): void {
  pushLicenseDebugEntry("warn", scope, message, detail);
  if (!enabled()) return;
  if (detail && Object.keys(detail).length > 0) {
    console.warn(`${PREFIX} ${scope}: ${message}`, detail);
    return;
  }
  console.warn(`${PREFIX} ${scope}: ${message}`);
}