// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("diagnostics Playwright runner ownership", () => {
  it("never kills the process that merely owns the harness port", () => {
    const runner = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../../scripts/diagnostics-inspector.playwright.mjs",
      ),
      "utf8",
    );

    expect(runner).not.toContain("killPortScript");
    expect(runner.match(/taskkill/gu)).toHaveLength(1);
    expect(runner).toContain(
      'spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"]',
    );
  });
});
