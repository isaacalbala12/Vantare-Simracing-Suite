import { describe, expect, it } from "vitest";
import {
  OVERLAY_SHADOW_MAX_ENTRIES,
  limitShadowEntries,
  sanitizeShadowObservation,
  sanitizeShadowPath,
} from "./overlay-shadow-sanitizer";

describe("overlay shadow sanitizer", () => {
  it("redacts arbitrary strings and only exposes allowlisted enums", () => {
    const canary = "PII_DRIVER_ISAAC_105";

    expect(
      sanitizeShadowObservation(canary, `${canary}_NEW`, { kind: "redacted" }),
    ).toEqual({ kind: "redacted" });
    expect(
      sanitizeShadowObservation("ready", "stale", {
        kind: "enum",
        allowed: ["ready", "stale"],
      }),
    ).toEqual({ kind: "enum", legacy: "ready", projection: "stale" });
    expect(
      JSON.stringify(
        sanitizeShadowObservation(canary, "ready", {
          kind: "enum",
          allowed: ["ready", "stale"],
        }),
      ),
    ).not.toContain(canary);
  });

  it("keeps only finite numbers, booleans and presence", () => {
    expect(
      sanitizeShadowObservation(12.3456789123, 12.3456789765, { kind: "number" }),
    ).toEqual({ kind: "number", legacy: 12.345679, projection: 12.345679 });
    expect(sanitizeShadowObservation(false, true, { kind: "boolean" })).toEqual({
      kind: "boolean",
      legacy: false,
      projection: true,
    });
    expect(sanitizeShadowObservation(undefined, 0, { kind: "presence" })).toEqual({
      kind: "presence",
      legacy: false,
      projection: true,
    });
    expect(sanitizeShadowObservation(Number.NaN, Infinity, { kind: "number" })).toEqual({
      kind: "redacted",
    });
  });

  it("preserves finite numeric limits without serializing Infinity or null", () => {
    const observation = sanitizeShadowObservation(
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
      { kind: "number" },
    );

    expect(observation).toEqual({
      kind: "number",
      legacy: Number.MAX_VALUE,
      projection: -Number.MAX_VALUE,
    });
    expect(JSON.stringify(observation)).not.toMatch(/Infinity|null/);
  });

  it("uses only closed diagnostic paths", () => {
    expect(sanitizeShadowPath("rows[].driverName")).toBe("rows[].driverName");
    expect(sanitizeShadowPath("PII/C:/Users/isaac/token")).toBe("invalid-path");
    expect(sanitizeShadowPath(`field.${"x".repeat(200)}`)).toBe("invalid-path");
  });

  it("enforces the hard cap even when a caller asks for more", () => {
    const values = Array.from({ length: 100 }, (_, index) => index);

    expect(limitShadowEntries(values, 1_000)).toEqual({
      entries: values.slice(0, OVERLAY_SHADOW_MAX_ENTRIES),
      truncated: true,
    });
    expect(limitShadowEntries(values, 3)).toEqual({
      entries: [0, 1, 2],
      truncated: true,
    });
  });
});
