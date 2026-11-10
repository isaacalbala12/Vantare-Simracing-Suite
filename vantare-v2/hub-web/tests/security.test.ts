import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mockReply } from "../src/main/mock-host";
import {
  assetPath,
  CSP,
  developmentUrl,
  fitWindow,
  hasDebuggerArguments,
  isAppDocument,
  navigationAllowed,
  requireDataDirectory,
  webPreferences,
} from "../src/main/security";

describe("renderer boundary", () => {
  it("rejects foreign origins and malformed paths", () => {
    for (const url of [
      "https://hub/",
      "file:///C:/x",
      "app://other/",
      "app://user@hub/",
      "app://hub/a%5cb",
      "app://hub/C%3a/x",
      "app://hub/%00",
    ])
      expect(assetPath(url)).toBeNull();
    expect(isAppDocument("invalid")).toBe(false);
    expect(assetPath("app://hub/")).toBe("index.html");
    expect(assetPath("app://hub/assets/main.js")).toBe("assets/main.js");
  });
  it("limits the development renderer to loopback", () => {
    expect(developmentUrl(undefined)).toBeUndefined();
    expect(developmentUrl("http://127.0.0.1:5173/")).toBe(
      "http://127.0.0.1:5173/",
    );
    for (const value of [
      "https://example.com",
      "http://example.com",
      "file:///tmp/x",
      "http://user@localhost:5173/",
    ])
      expect(() => developmentUrl(value)).toThrow();
  });
  it("disables network and embedded objects", () => {
    expect(CSP).toContain("connect-src 'none'");
    expect(CSP).toContain("object-src 'none'");
  });
  it("only answers the supported mock handshake", () => {
    expect(mockReply({ kind: "hello", version: 1 })).toMatchObject({
      kind: "hello",
      version: 1,
      demo: true,
    });
    for (const message of [
      null,
      {},
      { kind: "hello", version: 2 },
      { kind: "request", method: "unknown" },
    ])
      expect(mockReply(message)).toBeNull();
  });
  it("keeps Node and unsafe renderer capabilities disabled", () => {
    expect(webPreferences("preload.cjs", false)).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      webSecurity: true,
      devTools: false,
    });
  });
  it("denies external navigation, malformed URLs and non-loopback development origins", () => {
    for (const url of [
      "https://example.invalid",
      "javascript:alert(1)",
      "not a URL",
      "file:///tmp/data",
    ])
      expect(navigationAllowed(url)).toBe(false);
    expect(navigationAllowed("app://hub/")).toBe(true);
    expect(
      navigationAllowed("http://127.0.0.1:5173/a", "http://127.0.0.1:5173"),
    ).toBe(true);
    expect(
      navigationAllowed("http://127.0.0.1:5174/a", "http://127.0.0.1:5173"),
    ).toBe(false);
    expect(
      navigationAllowed("http://example.invalid/a", "http://example.invalid"),
    ).toBe(false);
  });
  it("fits both initial size and minimum into a 1080p work area at 150 percent", () => {
    expect(
      fitWindow({ width: 1440, height: 900 }, { width: 1280, height: 672 }),
    ).toEqual({ width: 1280, height: 672, minWidth: 1280, minHeight: 672 });
  });
  it("classifies remote debugging switches independently of values and case", () => {
    expect(hasDebuggerArguments(["app.exe", "--remote-debugging-port=0"])).toBe(
      true,
    );
    expect(hasDebuggerArguments(["--REMOTE-DEBUGGING-PIPE"])).toBe(true);
    expect(hasDebuggerArguments(["--force-device-scale-factor=1.5"])).toBe(
      false,
    );
  });
  it("rejects missing or relative data inside the startup flow", () => {
    for (const value of [undefined, "", "relative"])
      expect(() => requireDataDirectory(value)).toThrow();
    expect(requireDataDirectory(resolve("qa"))).toBe(resolve("qa"));
  });
});
