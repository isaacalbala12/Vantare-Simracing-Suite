import { describe, it, expect } from "vitest";
import { resizeWithRatio, snap, clampSize, clampPosition } from "./canvas-math";

describe("canvas-math", () => {
  describe("snap", () => {
    it("rounds values to the 8px grid", () => {
      expect(snap(12)).toBe(16);
      expect(snap(11)).toBe(8);
      expect(snap(0)).toBe(0);
    });
  });

  describe("resizeWithRatio", () => {
    it("relative resizes proportionally using start aspect (horizontal drag)", () => {
      const startW = 300;
      const startH = 200;
      const aspect = startW / startH;
      const result = resizeWithRatio("relative", startW, startH, 100, 0);
      // axis dominante = 100 (X). newH = 200 + 100 = 300. newW = 300 * 1.5 = 450.
      expect(result.h).toBe(300);
      expect(result.w).toBe(450);
      expect(result.w / result.h).toBeCloseTo(aspect, 5);
    });

    it("relative resizes proportionally using start aspect (vertical drag)", () => {
      const startW = 100;
      const startH = 200;
      const aspect = startW / startH;
      const result = resizeWithRatio("relative", startW, startH, 0, 104);
      // axis dominante = 104 (Y). newH = 200 + 104 = 304. newW = 304 * 0.5 = 152.
      expect(result.h).toBe(304);
      expect(result.w).toBe(152);
      expect(result.w / result.h).toBeCloseTo(aspect, 5);
    });

    it("relative does not collapse width when only height shrinks", () => {
      const startW = 300;
      const startH = 200;
      const aspect = startW / startH;
      const result = resizeWithRatio("relative", startW, startH, 0, -10);
      // axis dominante = 10 (Y, abs). sign = -1. newH = 200 - 10 = 190. newW = 190 * 1.5 = 285.
      expect(result.h).toBe(190);
      expect(result.w).toBe(285);
      expect(result.w / result.h).toBeCloseTo(aspect, 5);
    });

    it("standings resizes proportionally using start aspect (horizontal expansion)", () => {
      const startW = 400;
      const startH = 200;
      const aspect = startW / startH;
      const result = resizeWithRatio("standings", startW, startH, 800, 0);
      // axis dominante = 800 (X). newH = 200 + 800 = 1000. newW = 1000 * 2 = 2000.
      expect(result.h).toBe(1000);
      expect(result.w).toBe(2000);
      expect(result.w / result.h).toBeCloseTo(aspect, 5);
    });

    it("standings resizes proportionally when shrinking", () => {
      const startW = 400;
      const startH = 200;
      const result = resizeWithRatio("standings", startW, startH, -200, -100);
      // axis dominante = 200 (X). sign = -1. newH = 200 - 200 = 0 -> clamped a MIN 40. newW = 40 * 2 = 80.
      expect(result.h).toBe(40);
      expect(result.w).toBe(80);
    });

    it("maintains aspect ratio for ratio-locked widget types (delta)", () => {
      const result = resizeWithRatio("delta", 400, 100, 0, 0);
      expect(result.w).toBe(400);
      expect(result.h).toBe(100);
      expect(result.w / result.h).toBeCloseTo(4, 5);
    });

    it("respects minimum size for ratio-locked widgets", () => {
      const result = resizeWithRatio("delta", 400, 100, 0, -200);
      expect(result.h).toBe(40);
      expect(result.w).toBe(160);
    });

    it("respects minimum size for proportional widgets", () => {
      const result = resizeWithRatio("relative", 100, 100, -200, -200);
      expect(result.w).toBe(80);
      expect(result.h).toBe(40);
    });

    it("relative uses baseAspect when provided instead of startW/startH", () => {
      // baseAspect = 258/240 ≈ 1.075. NOT startW/startH (300/200 = 1.5).
      const baseAspect = 258 / 240;
      const result = resizeWithRatio("relative", 300, 200, 100, 0, baseAspect);
      // dominant = 100 (X), sign = +1, newH = 200 + 100 = 300, newW = 300 * 1.075 = 322.5 ≈ 323
      expect(result.h).toBe(300);
      expect(result.w).toBe(323);
      expect(result.w / result.h).toBeCloseTo(baseAspect, 2);
    });

    it("standings uses baseAspect when provided", () => {
      const baseAspect = 400 / 300; // ≈ 1.333
      const result = resizeWithRatio("standings", 400, 200, 0, 100, baseAspect);
      // dominant = 100 (Y), sign = +1, newH = 200 + 100 = 300, newW = 300 * 1.333 = 400
      expect(result.h).toBe(300);
      expect(result.w).toBe(400);
      expect(result.w / result.h).toBeCloseTo(baseAspect, 2);
    });

    it("delta ignores baseAspect (legacy ratio)", () => {
      const result = resizeWithRatio("delta", 400, 100, 0, 0, 999);
      expect(result.w).toBe(400);
      expect(result.h).toBe(100);
      expect(result.w / result.h).toBeCloseTo(4, 5);
    });

    it("relative without baseAspect falls back to startW/startH (backward compat)", () => {
      const result = resizeWithRatio("relative", 300, 200, 100, 0);
      expect(result.w / result.h).toBeCloseTo(1.5, 5);
    });
  });

  describe("clampSize", () => {
    it("clamps size to canvas bounds from the given position", () => {
      const result = clampSize(2000, 1200, 100, 100);
      expect(result.w).toBe(1820);
      expect(result.h).toBe(980);
      expect(result.x).toBe(100);
      expect(result.y).toBe(100);
    });
  });

  describe("clampPosition", () => {
    it("keeps widget inside canvas bounds", () => {
      expect(clampPosition(1900, 1000, 200, 100)).toEqual({ x: 1720, y: 980 });
      expect(clampPosition(-10, -5, 200, 100)).toEqual({ x: 0, y: 0 });
    });
  });
});
