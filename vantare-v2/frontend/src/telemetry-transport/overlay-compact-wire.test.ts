import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createOverlaySectionDecoder, decodeOverlayUpdateV2, OVERLAY_V2_MAX_PAYLOAD_BYTES, OVERLAY_V2_SNAPSHOT_EVENT } from "./overlay-frame-v2-store";

const fixture = (count = 1) => JSON.parse(readFileSync(`../internal/telemetry/projection/overlayv2/testdata/overlay_v2_${count}.golden.json`, "utf8"));
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

describe("lossless compact standings wire", () => {
  it("normalizes scalar timings and quality codes once, preserving zero and precision", () => {
    const input = fixture();
    Object.assign(input.frame.standings[0], {
      q: { q: "f", g: "s", b: "m", l: "i", position: "s" },
      gap: 1.23456789012345, bestLap: 0, lastLap: 99.45678901234567,
      cg: 0, cl: 0, cr: 1, i: 0, il: 0,
    });
    const row = decodeOverlayUpdateV2(input).frame!.standings[0]!;
    expect(row.gap).toEqual({ q: "stale", v: 1.23456789012345 });
    expect(row.bestLap).toEqual({ q: "missing" });
    expect(row.lastLap).toEqual({ q: "invalid", v: 99.45678901234567 });
    expect(row.quality).toEqual({ q: "fresh", position: "stale" });
    expect(row.classGap).toBe(0);
    expect(row.classGapLaps).toBe(0);
    expect(row.interval).toBe(0);
    expect(row.intervalLaps).toBe(0);
    expect(row.classRef).toBe(1);
    expect(Object.isFrozen(row)).toBe(true);
    expect(Object.isFrozen(row.gap)).toBe(true);
    expect(input.frame.standings[0].q.g).toBe("s");
    // Re-ingesting the normalized legacy spelling preserves identical data.
    expect(decodeOverlayUpdateV2(decodeOverlayUpdateV2(input)).frame!.standings[0]).toEqual(row);
  });

  it.each(["invented", "F", "", null, 0])("rejects unknown quality %s", (code) => {
    const input = fixture();
    input.frame.standings[0].q = { q: "f", g: code };
    expect(() => decodeOverlayUpdateV2(input)).toThrow("frame.standings[0]");
  });

  it.each(["quality", "classGap", "classGapLaps", "classRef", "interval", "intervalLaps"])("rejects ambiguous %s aliases", (field) => {
    const input = fixture();
    Object.assign(input.frame.standings[0], { q: { q: "f" }, cg: 1, cl: 1, cr: 1, i: 1, il: 1, [field]: field === "quality" ? { q: "fresh" } : 1 });
    expect(() => decodeOverlayUpdateV2(input)).toThrow("frame.standings[0]");
  });

  it("rejects absent scalar quality and nonzero missing timings", () => {
    const input = fixture();
    delete input.frame.standings[0].q;
    expect(() => decodeOverlayUpdateV2(input)).toThrow();
    input.frame.standings[0].q = { q: "m" };
    input.frame.standings[0].gap = 5;
    expect(() => decodeOverlayUpdateV2(input)).toThrow();
  });

  it("accepts legacy timing objects and explicit derived authority", () => {
    const input = fixture();
    input.frame.standings[0].gap = { q: "fresh", v: 0 };
    input.frame.standings[0].bestLap = { q: "missing" };
    input.frame.standings[0].lastLap = { q: "stale", v: 91.234 };
    input.frame.standings[0].q = { q: "fresh" };
    input.frame.relative[0].authority = "derived";
    const decoded = decodeOverlayUpdateV2(input);
    expect(decoded.frame!.standings[0]!.lastLap).toEqual({ q: "stale", v: 91.234 });
    expect(decoded.frame!.relative[0]!.authority).toBe("derived");
    input.frame.relative[0].authority = "invented";
    expect(() => decodeOverlayUpdateV2(input)).toThrow();
    delete input.frame.relative[0].authority;
    expect(() => decodeOverlayUpdateV2(input)).not.toThrow();
  });

  it("accounts section safety limits in raw wire bytes after normalized expansion", () => {
    const input = fixture(104);
    input.revision = 1;
    input.frame.standings[0].driver += "x".repeat(OVERLAY_V2_MAX_PAYLOAD_BYTES - 128 - bytes(input));
    expect(bytes(input)).toBeLessThan(OVERLAY_V2_MAX_PAYLOAD_BYTES);
    expect(bytes(decodeOverlayUpdateV2(input))).toBeGreaterThan(OVERLAY_V2_MAX_PAYLOAD_BYTES);
    const decode = createOverlaySectionDecoder();
    const wire = (delivery: number, data: unknown, baseRevision?: number) => JSON.stringify({ sessionId: "s", delivery, events: [{ name: OVERLAY_V2_SNAPSHOT_EVENT, data, ...(baseRevision === undefined ? {} : { baseRevision }) }] });
    decode(wire(1, input), { sessionId: "s", ack: 0 });
    const patch = { revision: 2, source: { state: "live" }, frame: { sequence: input.frame.sequence + 1 } };
    expect(() => decode(wire(2, patch, 1), { sessionId: "s", ack: 1 })).not.toThrow();
    const oversized = { revision: 3, source: { state: "live" }, frame: { standings: input.frame.standings.map((row: object) => ({ ...row, driver: "x".repeat(1000) })) } };
    expect(() => decode(wire(3, oversized, 2), { sessionId: "s", ack: 2 })).toThrow("size");
    expect(() => decode(wire(3, { ...patch, revision: 3 }, 2), { sessionId: "s", ack: 2 })).not.toThrow();
  });
});
