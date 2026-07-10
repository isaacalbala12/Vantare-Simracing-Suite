import { describe, expect, it } from "vitest";
import { buildStudioHarnessDocument } from "./studio-profile-fixture";
import {
  buildHarnessProfileApiResponse,
  profileDocumentV3ToLegacyProfile,
  resolveHarnessLayoutOrigin,
} from "./harness-profile-api";
import { setHarnessBrowserViewProfile, clearHarnessBrowserViewProfiles } from "./harness-browser-view-store";

describe("harness-profile-api", () => {
  it("converts a V3 harness document into legacy overlay profile JSON", () => {
    const document = buildStudioHarnessDocument();
    const legacy = profileDocumentV3ToLegacyProfile(document);

    expect(legacy.id).toBe("profile-harness");
    expect(legacy.widgets).toHaveLength(1);
    expect(legacy.widgets[0]?.type).toBe("delta");
    expect(legacy.widgets[0]?.position).toEqual({ x: 120, y: 96, w: 420, h: 180 });
    expect(legacy.widgets[0]?.props?.style).toBe("vantare-racing");
  });

  it("serves saved harness profiles by file reference", () => {
    clearHarnessBrowserViewProfiles();
    const document = buildStudioHarnessDocument();
    setHarnessBrowserViewProfile("profiles/harness.json", document);

    const response = buildHarnessProfileApiResponse("profiles/harness.json");
    expect(response).not.toBeNull();
    expect(response?.profile.name).toBe("Perfil harness");
    expect(resolveHarnessLayoutOrigin(document)).toEqual({ x: 120, y: 96 });
  });
});