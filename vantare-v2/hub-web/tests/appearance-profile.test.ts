import { describe, expect, it } from "vitest";
import fixture from "../fixtures/launcher-base.json";
import type { LauncherProfile } from "../src/contract/generated/contract";
import { previewProfile } from "../src/renderer/screens/settings/appearance-profile";

const profile = (name: string, favorite = false): LauncherProfile => ({
  ...fixture.profiles[0],
  options: fixture.profiles[0].options as LauncherProfile["options"],
  name,
  favorite,
});
describe("read-only native profile preview", () => {
  it("has no profile for an empty document", () =>
    expect(previewProfile([])).toBeUndefined());
  it("prefers favorites and then native ordinal name order without reordering the view", () => {
    const profiles = [profile("A"), profile("Z", true), profile("B", true)];
    expect(previewProfile(profiles)).toBe(profiles[2]);
    expect(profiles.map((value) => value.name)).toEqual(["A", "Z", "B"]);
  });
  it("matches Rust string order for supplementary Unicode characters", () => {
    const privateUse = profile("\uE000");
    expect(previewProfile([profile("😀"), privateUse])).toBe(privateUse);
  });
  it("falls back to the first ordinal name when no profile is favorite", () => {
    expect(previewProfile([profile("Z"), profile("A")])?.name).toBe("A");
  });
});
