import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const overlayRoot = resolve(process.cwd(), "src", "overlay");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.(?:ts|tsx)$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe("Overlay V1 authority guard", () => {
  it("keeps legacy WidgetVisualHost selection inside harness mode", () => {
    const source = readFileSync(resolve(overlayRoot, "core", "WidgetVisualHost.tsx"), "utf8");
    expect(source).toContain("else if (harnessMode && snapshot)");
    expect(source.match(/definition\.buildViewModel\(/g)).toHaveLength(1);
  });

  it("does not pass TelemetrySnapshot into productive runtime or edit frames", () => {
    for (const directory of ["runtime", "edit"]) {
      for (const path of sourceFiles(resolve(overlayRoot, directory))) {
        const relative = path.slice(overlayRoot.length + 1);
        const source = readFileSync(path, "utf8");
        expect(source, relative).not.toMatch(/\bsnapshot\s*=/);
        if (relative !== "runtime\\use-rate-limited-telemetry.ts" && relative !== "runtime/use-rate-limited-telemetry.ts") {
          expect(source, relative).not.toContain("telemetry-snapshot");
          expect(source, relative).not.toMatch(/\buseRateLimitedTelemetry\b/);
        }
      }
    }
  });
});
