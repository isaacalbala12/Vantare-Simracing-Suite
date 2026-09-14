import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OverlayUpdateV2 } from "../generated/telemetry";
import {
  decodeOverlayUpdateV2,
  OVERLAY_V2_MAX_PAYLOAD_BYTES,
  parseOverlayPullJSON,
  OVERLAY_V2_SNAPSHOT_EVENT,
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
        sessionLaps: { q: "missing" },
        requiredFuel: { q: "missing" },
        history: { q: "missing" },
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
  it("retains per-update UTF-8 limits even inside a larger pull envelope", () => {
    const wrap = (data: string) => `{"sessionId":"s","delivery":1,"events":[{"name":"${OVERLAY_V2_SNAPSHOT_EVENT}","data":${data}}]}`;
    const exact = paddedTo(leanUpdate(), OVERLAY_V2_MAX_PAYLOAD_BYTES);
    const parsed = parseOverlayPullJSON(wrap(exact)) as {events: {data: unknown}[]};
    expect(() => decodeOverlayUpdateV2(parsed.events[0]!.data)).not.toThrow();
    expect(() => parseOverlayPullJSON(wrap(paddedTo(leanUpdate(), OVERLAY_V2_MAX_PAYLOAD_BYTES + 1)))).toThrow("size");
    const unicode = JSON.parse(exact) as OverlayUpdateV2;
    const tooLarge = {...unicode, frame: {...unicode.frame, sessionId: "é".repeat(OVERLAY_V2_MAX_PAYLOAD_BYTES / 2)}};
    expect(() => parseOverlayPullJSON(wrap(JSON.stringify(tooLarge)))).toThrow("size");
  });

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
