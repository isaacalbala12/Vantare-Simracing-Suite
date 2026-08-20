import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("pedals telemetry v2 ViewModel boundary", () => {
  it("contains presentation and unit formatting only", () => {
    const source = readFileSync(path.resolve(
      process.cwd(),
      "src/overlay/widget-types/pedals-telemetry/pedals-telemetry-view-model-v2.ts",
    ), "utf8");
    for (const forbidden of [
      "TelemetrySnapshot",
      "scoring",
      "standings",
      "lapNumber",
      "fuel",
      "delta",
      "derive",
      "EventSource",
      "localStorage",
      "fetch(",
    ]) {
      expect(source, `forbidden identifier ${forbidden}`).not.toContain(forbidden);
    }
  });
});
