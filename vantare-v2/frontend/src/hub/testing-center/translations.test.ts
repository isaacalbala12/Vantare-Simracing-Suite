import { describe, expect, it } from "vitest";
import {
  testingCenterEn,
  testingCenterEs,
  testingCenterIt,
  testingCenterPt,
} from "./translations";

describe("Testing Center translations", () => {
  it("keeps the same non-empty keys in every supported language", () => {
    const expected = Object.keys(testingCenterEs).sort();
    for (const translations of [testingCenterEn, testingCenterIt, testingCenterPt]) {
      expect(Object.keys(translations).sort()).toEqual(expected);
      expect(Object.values(translations).every((value) => value.trim().length > 0))
        .toBe(true);
    }
  });
});
