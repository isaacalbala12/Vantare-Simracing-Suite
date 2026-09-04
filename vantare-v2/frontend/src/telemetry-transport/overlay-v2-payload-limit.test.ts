import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayUpdateV2 } from "../generated/telemetry";
import {
  decodeOverlayUpdateV2,
  OVERLAY_V2_MAX_PAYLOAD_BYTES,
} from "./overlay-frame-v2-store";

function golden(): OverlayUpdateV2 {
  return JSON.parse(
    readFileSync(
      path.resolve(process.cwd(), `../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json`),
      "utf8",
    ),
  ) as OverlayUpdateV2;
}

// Marco mínimo válido sin las series históricas: el validador estricto lo
// acepta hoy y permite medir solo el gate de tamaño.
function leanUpdate(): OverlayUpdateV2 {
  const base = golden();
  if (!base.frame) throw new Error("golden frame missing");
  return {
    ...base,
    frame: {
      ...base.frame,
      fuel: {
        remaining: { q: "missing" },
        capacity: { q: "missing" },
        perLap: { q: "missing" },
        estimatedLaps: { q: "missing" },
      },
    },
  };
}

function paddedTo(update: OverlayUpdateV2, bytes: number): string {
  const base = JSON.stringify(update);
  const deficit = bytes - new TextEncoder().encode(base).byteLength;
  if (deficit < 0) throw new Error(`lean update already exceeds ${bytes} bytes`);
  const sessionId = `${update.frame?.sessionId ?? "s"}${"x".repeat(deficit)}`;
  return JSON.stringify({ ...update, frame: { ...update.frame, sessionId } });
}

describe("overlay-v2 payload hard limit", () => {
  it("centraliza el límite duro en 72 KiB sin literales mágicos", () => {
    expect(OVERLAY_V2_MAX_PAYLOAD_BYTES).toBe(72 * 1024);
  });

  it("acepta exactamente 72 KiB y rechaza 72 KiB+1", () => {
    const update = leanUpdate();
    const exact = paddedTo(update, 72 * 1024);
    expect(new TextEncoder().encode(exact).byteLength).toBe(72 * 1024);
    expect(() => decodeOverlayUpdateV2(exact)).not.toThrow();

    const over = paddedTo(update, 72 * 1024 + 1);
    expect(new TextEncoder().encode(over).byteLength).toBe(72 * 1024 + 1);
    expect(() => decodeOverlayUpdateV2(over)).toThrow(
      "overlay-frame-v2:invalid-contract:size",
    );
  });
});
