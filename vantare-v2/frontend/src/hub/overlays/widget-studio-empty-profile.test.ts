import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, isSyntheticProfile } from "./widget-studio-empty-profile";
import type { ProfileConfig } from "../../lib/profile";

describe("widget-studio-empty-profile", () => {
  it("EMPTY_PROFILE has correct defaults", () => {
    expect(EMPTY_PROFILE.schemaVersion).toBe(2);
    expect(EMPTY_PROFILE.widgets).toEqual([]);
    expect(EMPTY_PROFILE.variants).toEqual([]);
    expect(EMPTY_PROFILE.layouts).toEqual({});
  });

  it("EMPTY_PROFILE does not contain position/x/y/w/h", () => {
    const profile = EMPTY_PROFILE as Record<string, unknown>;
    expect(profile.position).toBeUndefined();
    expect(profile.x).toBeUndefined();
    expect(profile.y).toBeUndefined();
    expect(profile.w).toBeUndefined();
    expect(profile.h).toBeUndefined();
    // Also verify no widget has position
    for (const widget of EMPTY_PROFILE.widgets) {
      expect((widget as Record<string, unknown>).position).toBeUndefined();
    }
  });

  it("isSyntheticProfile returns true for null", () => {
    expect(isSyntheticProfile(null)).toBe(true);
  });

  it("isSyntheticProfile returns true for EMPTY_PROFILE", () => {
    expect(isSyntheticProfile(EMPTY_PROFILE)).toBe(true);
  });

  it("isSyntheticProfile returns false for a real profile", () => {
    const realProfile: ProfileConfig = {
      id: "real-id",
      name: "Real Profile",
      displayMode: "racing",
      monitorIndex: 0,
      widgets: [
        { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 0, y: 0, w: 400, h: 48 } },
      ],
    };
    expect(isSyntheticProfile(realProfile)).toBe(false);
  });

  it("isSyntheticProfile returns false for a profile with id but no widgets", () => {
    const profileWithId: ProfileConfig = {
      id: "empty-but-real",
      name: "Empty but Real",
      displayMode: "racing",
      monitorIndex: 0,
      widgets: [],
    };
    expect(isSyntheticProfile(profileWithId)).toBe(false);
  });
});
