import { describe, expect, it } from "vitest";
import {
  buildStandingsAppearanceStyle,
  resolveStandingsClassColor,
  STANDINGS_DEFAULT_APPEARANCE,
} from "./standings-renderer-helpers";

describe("standings-renderer-helpers", () => {
  it("maps every supported vehicle class to its default colour", () => {
    const defaults = {};
    expect(resolveStandingsClassColor("HYPERCAR", defaults)).toBe(
      STANDINGS_DEFAULT_APPEARANCE.classHypercarColor,
    );
    expect(resolveStandingsClassColor("LMP2", defaults)).toBe(
      STANDINGS_DEFAULT_APPEARANCE.classLmp2Color,
    );
    expect(resolveStandingsClassColor("LMP3", defaults)).toBe(
      STANDINGS_DEFAULT_APPEARANCE.classLmp3Color,
    );
    expect(resolveStandingsClassColor("GT3", defaults)).toBe(
      STANDINGS_DEFAULT_APPEARANCE.classGt3Color,
    );
    expect(resolveStandingsClassColor("LMGT3", defaults)).toBe(
      STANDINGS_DEFAULT_APPEARANCE.classGt3Color,
    );
  });

  it("is case insensitive and falls back for unknown or missing classes", () => {
    expect(resolveStandingsClassColor("hypercar", {})).toBe(
      STANDINGS_DEFAULT_APPEARANCE.classHypercarColor,
    );
    expect(resolveStandingsClassColor("GTE", {})).toBe(
      STANDINGS_DEFAULT_APPEARANCE.classUnknownColor,
    );
    expect(resolveStandingsClassColor(undefined, {})).toBe(
      STANDINGS_DEFAULT_APPEARANCE.classUnknownColor,
    );
    expect(resolveStandingsClassColor("", {})).toBe(
      STANDINGS_DEFAULT_APPEARANCE.classUnknownColor,
    );
  });

  it("prefers configured colours over defaults", () => {
    expect(resolveStandingsClassColor("LMP2", { classLmp2Color: "#010203" })).toBe("#010203");
    expect(resolveStandingsClassColor("GT3", { classGt3Color: "  " })).toBe(
      STANDINGS_DEFAULT_APPEARANCE.classGt3Color,
    );
    expect(resolveStandingsClassColor("LMP3", { classLmp3Color: 42 })).toBe(
      STANDINGS_DEFAULT_APPEARANCE.classLmp3Color,
    );
  });

  it("publishes the accent colour as a scoped custom property", () => {
    expect(buildStandingsAppearanceStyle({ accentColor: "#ff0000" })).toEqual({
      "--vo-standings-accent": "#ff0000",
    });
    expect(buildStandingsAppearanceStyle({})).toEqual({
      "--vo-standings-accent": STANDINGS_DEFAULT_APPEARANCE.accentColor,
    });
  });
});
