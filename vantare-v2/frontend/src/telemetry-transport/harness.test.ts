import { describe, expect, it } from "vitest";
import { TELEMETRY_PRODUCTS } from "./contracts";
import { createTelemetryTransportHarness } from "./harness";

describe("explicit telemetry transport harness", () => {
  it.each(TELEMETRY_PRODUCTS)(
    "reproduces full, gap and reconnect for %s",
    (product) => {
      const harness = createTelemetryTransportHarness(product);
      harness.status();
      harness.full({ value: 1 });
      harness.gap({ value: 5 });
      harness.reconnect();
      const state = harness.snapshot();
      expect(state.snapshot?.payload).toEqual({ value: 5 });
      expect(state.diagnostics.map(({ code }) => code)).toEqual([
        "snapshot-resync",
        "reconnect",
      ]);
      expect(JSON.stringify(state.diagnostics)).not.toContain("value");
    },
  );

  it("reproduces facts and an observable facts gap", () => {
    const harness = createTelemetryTransportHarness("engineer");
    harness.status();
    harness.full({ player: {} });
    harness.fact({ kind: "lap.completed" });
    expect(() =>
      harness.fact({ kind: "pit.entered" }, 3),
    ).toThrow("fact-gap");
    expect(harness.snapshot().needsFactResync).toBe(true);
    expect(harness.snapshot().diagnostics.at(-1)?.factSequence).toBe(3);
  });
});
