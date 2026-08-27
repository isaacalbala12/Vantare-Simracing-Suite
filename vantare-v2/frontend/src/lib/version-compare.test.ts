import { describe, expect, it } from "vitest";
import { compareVersions, isDowngrade, isNewerVersion, parseVersion } from "./version-compare";

describe("parseVersion", () => {
  it("reads the four numeric parts and the suffix", () => {
    expect(parseVersion("v0.1.0.7-nightly.12")).toEqual({
      major: 0,
      minor: 1,
      patch: 0,
      build: 7,
      suffix: "nightly.12",
    });
  });

  it("treats missing parts as zero", () => {
    expect(parseVersion("v1")).toEqual({ major: 1, minor: 0, patch: 0, build: 0, suffix: "" });
  });

  it("does not crash on a tag it cannot read", () => {
    expect(parseVersion("dev")).toEqual({ major: 0, minor: 0, patch: 0, build: 0, suffix: "" });
  });
});

describe("compareVersions", () => {
  it("orders by the numeric parts first", () => {
    expect(compareVersions("v0.1.0.8", "v0.1.0.7")).toBe(1);
    expect(compareVersions("v0.1.0.7", "v0.1.0.8")).toBe(-1);
  });

  it("orders nightly 10 after nightly 9, not before", () => {
    expect(compareVersions("v0.1.0.7-nightly.10", "v0.1.0.7-nightly.9")).toBe(1);
  });

  it("considers a stable version newer than a pre-release of the same line", () => {
    expect(compareVersions("v0.1.0.7", "v0.1.0.7-nightly.12")).toBe(1);
    expect(compareVersions("v0.1.0.7-nightly.12", "v0.1.0.7")).toBe(-1);
  });

  it("orders a bare suffix before its numbered variants", () => {
    expect(compareVersions("v0.1.0.7-nightly", "v0.1.0.7-nightly.1")).toBe(-1);
  });

  it("ignores the leading v", () => {
    expect(compareVersions("0.1.0.7-nightly.3", "v0.1.0.7-nightly.3")).toBe(0);
  });
});

describe("isNewerVersion", () => {
  it("separates two nightlies that isDowngrade cannot tell apart", () => {
    // isDowngrade solo mira la parte numerica: para el son la misma version.
    expect(isDowngrade("v0.1.0.7-nightly.11", "v0.1.0.7-nightly.12")).toBe(false);
    expect(isDowngrade("v0.1.0.7-nightly.12", "v0.1.0.7-nightly.11")).toBe(false);

    expect(isNewerVersion("v0.1.0.7-nightly.12", "v0.1.0.7-nightly.11")).toBe(true);
    expect(isNewerVersion("v0.1.0.7-nightly.11", "v0.1.0.7-nightly.12")).toBe(false);
  });

  it("is false for the version already installed", () => {
    expect(isNewerVersion("v0.1.0.7-nightly.12", "v0.1.0.7-nightly.12")).toBe(false);
  });
});
