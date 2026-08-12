import { describe, expect, it } from "vitest";
import { nextBrakePeak, shouldRevealPeak } from "./pedals-motion";

describe("brake peak tracking", () => {
  it("starts a peak when the pedal leaves rest", () => {
    expect(nextBrakePeak(null, 0.4)).toBe(0.4);
  });

  it("only ever grows while the pedal is down", () => {
    expect(nextBrakePeak(0.4, 0.9)).toBe(0.9);
    expect(nextBrakePeak(0.9, 0.5)).toBe(0.9);
    expect(nextBrakePeak(0.9, 0.03)).toBe(0.9);
  });

  it("dies when the pedal comes back up, so the next corner starts clean", () => {
    expect(nextBrakePeak(0.9, 0)).toBeNull();
    expect(nextBrakePeak(0.9, 0.02)).toBeNull();
    expect(nextBrakePeak(null, 0)).toBeNull();
  });

  it("survives a full lap of braking and releasing", () => {
    let peak: number | null = null;
    for (const brake of [0, 0.3, 0.8, 1, 0.6, 0.2, 0]) {
      peak = nextBrakePeak(peak, brake);
    }
    expect(peak).toBeNull();

    peak = null;
    for (const brake of [0.3, 0.8, 1, 0.6]) {
      peak = nextBrakePeak(peak, brake);
    }
    expect(peak).toBe(1);
  });
});

describe("revealing the peak", () => {
  it("stays hidden while the brake is still at its peak", () => {
    expect(shouldRevealPeak(0.9, 0.9)).toBe(false);
    expect(shouldRevealPeak(0.9, 0.88)).toBe(false);
  });

  it("shows once the pedal has eased off it", () => {
    expect(shouldRevealPeak(0.9, 0.6)).toBe(true);
  });

  it("stays hidden with no peak, or once the brake is released", () => {
    expect(shouldRevealPeak(null, 0.5)).toBe(false);
    expect(shouldRevealPeak(0.9, 0)).toBe(false);
  });

  it("never reveals on a first frame, where the peak is the current value", () => {
    const peak = nextBrakePeak(null, 0.75);
    expect(shouldRevealPeak(peak, 0.75)).toBe(false);
  });
});
