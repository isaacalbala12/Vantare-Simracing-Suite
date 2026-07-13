import { describe, expect, it } from "vitest";
import {
  OFFICIAL_ICON_ASSETS,
  getOfficialIconAsset,
  resolveIconCandidates,
} from "./app-icons";

describe("launcher icon registry", () => {
  it("keeps all official IDs explicit without network URLs", () => {
    expect(Object.keys(OFFICIAL_ICON_ASSETS)).toEqual([
      "lmu",
      "obs",
      "crewchief",
      "discord",
      "spotify",
      "motec",
      "simhub",
    ]);
    for (const asset of Object.values(OFFICIAL_ICON_ASSETS)) {
      expect(asset ?? "").not.toMatch(/^https?:\/\//i);
    }
  });

  it("rejects remote icon overrides and preserves local candidates", () => {
    expect(getOfficialIconAsset("lmu")).toBeUndefined();
    expect(
      resolveIconCandidates({
        id: "manual",
        displayName: "Manual",
        abbreviation: "MA",
        category: "utility",
        launchMethod: "executable",
        detected: false,
        iconUrl: "https://example.invalid/icon.png",
        gradientFrom: "#111",
        gradientTo: "#222",
      }),
    ).toEqual([]);
    expect(
      resolveIconCandidates({
        id: "manual",
        displayName: "Manual",
        abbreviation: "MA",
        category: "utility",
        launchMethod: "executable",
        detected: false,
        iconUrl: "data:image/png;base64,AA==",
        gradientFrom: "#111",
        gradientTo: "#222",
      }),
    ).toEqual(["data:image/png;base64,AA=="]);
  });
});
