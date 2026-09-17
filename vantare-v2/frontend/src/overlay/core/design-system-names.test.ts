import { describe, expect, it } from "vitest";
import {
  EFFICIENCY_LEGACY_SYSTEM_ID,
  EFFICIENCY_SYSTEM_ID,
  EFFICIENCY_SYSTEM_NAME,
  isEfficiencySystem,
  normalizeDesignSystemId,
} from "./design-system-names";

describe("Efficiency design-system naming", () => {
  it("uses Efficiency as the canonical name while retaining the stable public ID", () => {
    expect(EFFICIENCY_SYSTEM_NAME).toBe("Efficiency");
    expect(EFFICIENCY_SYSTEM_ID).toBe("vantare-functional");
    expect(EFFICIENCY_LEGACY_SYSTEM_ID).toBe(EFFICIENCY_SYSTEM_ID);
  });

  it.each(["efficiency", "vantare-efficiency", "functional", "vantare-functional", " EFFICIENCY "]) (
    "normalizes the %s compatibility spelling",
    (value) => {
      expect(normalizeDesignSystemId(value)).toBe(EFFICIENCY_SYSTEM_ID);
      expect(isEfficiencySystem(value)).toBe(true);
    },
  );

  it("does not treat unknown values as supported systems", () => {
    expect(normalizeDesignSystemId("not-a-system")).toBeUndefined();
    expect(isEfficiencySystem("not-a-system")).toBe(false);
    expect(isEfficiencySystem(undefined)).toBe(false);
  });
});
