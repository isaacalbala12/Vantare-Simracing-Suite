import { describe, expect, it } from "vitest";
import {
  type PrototypeReceipt,
  verifyPrototypeReceipt,
} from "../scripts/visual-pass-prototype";

const expected = {
  sourceSha256: "source",
  state: "delta",
  theme: "light",
  sidebar: "open",
  dimensions: [1280, 800],
  browser: { product: "Chrome/156", jsVersion: "15.6" },
  fontHashes: ["inter", "rajdhani", "mono"],
};
const receipt = (): PrototypeReceipt => ({
  sourceSha256: "source",
  state: "delta",
  theme: "light",
  sidebar: "open",
  dimensions: [1280, 800],
  chromium: { product: "Chrome/156", jsVersion: "15.6" },
  fonts: [{ sha256: "mono" }, { sha256: "inter" }, { sha256: "rajdhani" }],
});
describe("prototype provenance", () => {
  it("accepts matching source, condition, engine and fonts regardless of font order", () =>
    expect(() => verifyPrototypeReceipt(receipt(), expected)).not.toThrow());
  it.each(["sourceSha256", "state", "theme", "sidebar"] as const)(
    "rejects a different %s instead of publishing its metric",
    (field) => {
      const value = receipt();
      value[field] = "other";
      expect(() => verifyPrototypeReceipt(value, expected)).toThrow();
    },
  );
  it("rejects the old 1280 by 720 reference for the 800 px pass", () => {
    const value = receipt();
    value.dimensions = [1280, 720];
    expect(() => verifyPrototypeReceipt(value, expected)).toThrow();
  });
  it.each(["product", "jsVersion"] as const)(
    "rejects a different engine %s",
    (field) => {
      const value = receipt();
      value.chromium[field] = "other";
      expect(() => verifyPrototypeReceipt(value, expected)).toThrow();
    },
  );
  it("rejects a substituted font and an empty font receipt", () => {
    const value = receipt();
    value.fonts[0].sha256 = "substituted";
    expect(() => verifyPrototypeReceipt(value, expected)).toThrow();
    expect(() =>
      verifyPrototypeReceipt(receipt(), { ...expected, fontHashes: [] }),
    ).toThrow();
  });
});
