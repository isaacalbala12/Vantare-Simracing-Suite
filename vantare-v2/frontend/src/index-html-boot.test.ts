import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window as HappyWindow } from "happy-dom";
import { describe, expect, it, vi } from "vitest";

function readBootScript(): string {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
  if (!script) throw new Error("desktop overlay boot script not found");
  return script;
}

function executeBoot(window: HappyWindow, readBody: () => HTMLElement | null): void {
  Object.defineProperty(window.document, "body", { configurable: true, get: readBody });
  new Function("window", "document", readBootScript())(window, window.document);
}

describe("index boot classes", () => {
  it("waits for DOMContentLoaded when body is unavailable, then applies each class once", () => {
    const window = new HappyWindow({ url: "http://localhost/workshop" });
    const body = window.document.body;
    const root = window.document.createElement("div");
    root.id = "root";
    body.append(root);
    const bodyAdd = vi.spyOn(body.classList, "add");
    const rootAdd = vi.spyOn(root.classList, "add");
    let currentBody: HTMLElement | null = null;

    executeBoot(window, () => currentBody);
    expect(window.document.documentElement.classList.contains("desktop-overlay")).toBe(true);
    expect(body.classList.contains("desktop-overlay")).toBe(false);

    currentBody = body;
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

    expect(body.classList.contains("desktop-overlay")).toBe(true);
    expect(root.classList.contains("desktop-overlay")).toBe(true);
    expect(bodyAdd.mock.calls.filter(([value]) => value === "desktop-overlay")).toHaveLength(1);
    expect(rootAdd.mock.calls.filter(([value]) => value === "desktop-overlay")).toHaveLength(1);
  });

  it("does not apply desktop-overlay classes to the Hub hash route", () => {
    const window = new HappyWindow({ url: "http://localhost/#/hub" });
    const body = window.document.body;
    const root = window.document.createElement("div");
    root.id = "root";
    body.append(root);
    executeBoot(window, () => body);

    expect(window.document.documentElement.classList.contains("desktop-overlay")).toBe(false);
    expect(body.classList.contains("desktop-overlay")).toBe(false);
    expect(root.classList.contains("desktop-overlay")).toBe(false);
  });
});
