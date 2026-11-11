import { isAbsolute } from "node:path";
import type { WebPreferences } from "electron";
import type { UiToHost } from "../contract/generated/contract";
import { isUiMessage } from "../contract/validation";
export const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
export function isAppDocument(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "app:" &&
      url.host === "hub" &&
      !url.username &&
      !url.password &&
      url.port === ""
    );
  } catch {
    return false;
  }
}
export function assetPath(value: string): string | null {
  if (!isAppDocument(value)) return null;
  try {
    const path = decodeURIComponent(new URL(value).pathname);
    if (
      path.includes("\\") ||
      path.includes("\0") ||
      path.split("/").some((p) => p === ".." || p.includes(":"))
    )
      return null;
    return path === "/" ? "index.html" : path.slice(1);
  } catch {
    return null;
  }
}

export function developmentUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error("Renderer development server must use loopback");
  return url.href;
}

declare const __VANTARE_QA_DRIVER__: boolean;
export const QA_DRIVER =
  typeof __VANTARE_QA_DRIVER__ === "boolean" && __VANTARE_QA_DRIVER__;
export function requireDataDirectory(value: string | undefined): string {
  if (!value || !isAbsolute(value))
    throw new Error("Hub data directory is missing or relative");
  return value;
}
export function hasDebuggerArguments(args: readonly string[]): boolean {
  return args.some((arg) =>
    ["--remote-debugging-port", "--remote-debugging-pipe"].includes(
      arg.split("=")[0].toLowerCase(),
    ),
  );
}
export function navigationAllowed(
  value: string,
  development?: string,
): boolean {
  if (isAppDocument(value)) return true;
  try {
    return (
      development !== undefined &&
      new URL(value).origin ===
        new URL(developmentUrl(development) as string).origin
    );
  } catch {
    return false;
  }
}
export function webPreferences(
  preload: string,
  devTools: boolean,
): WebPreferences {
  return {
    preload,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webviewTag: false,
    webSecurity: true,
    spellcheck: false,
    v8CacheOptions: "bypassHeatCheck",
    backgroundThrottling: true,
    devTools,
  };
}
export function fitWindow(
  desired: { width: number; height: number },
  area: { width: number; height: number },
) {
  const width = Math.min(desired.width, area.width);
  const height = Math.min(desired.height, area.height);
  return {
    width,
    height,
    minWidth: Math.min(1280, width),
    minHeight: Math.min(720, height),
  };
}

// Only the main process owns the host handshake and window readiness.
export function isRendererMessage(
  value: unknown,
): value is Exclude<
  UiToHost,
  { kind: "hello" | "ready" | "pickedExecutable" }
> {
  return (
    isUiMessage(value) &&
    ((value.kind === "request" && value.id < 0x80000000) ||
      value.kind === "subscribe" ||
      value.kind === "unsubscribe" ||
      value.kind === "closeAnswer")
  );
}
export function mockAllowed(packaged: boolean, qa = QA_DRIVER): boolean {
  return !packaged || qa;
}
