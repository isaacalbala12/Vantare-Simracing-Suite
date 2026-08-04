import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("index boot classes", () => {
  it("waits for body before applying desktop-overlay classes from the head", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

    expect(html).toContain('if (document.body) applyOverlayClasses();');
    expect(html).toContain('document.addEventListener("DOMContentLoaded", applyOverlayClasses, { once: true });');
  });
});
