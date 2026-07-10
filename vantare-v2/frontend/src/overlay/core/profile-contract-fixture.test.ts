import { describe, expect, it } from "vitest";
import goldenV0 from "../../../../pkg/config/testdata/profile-v3-core-widgets-from-v0.golden.json";
import goldenV2 from "../../../../pkg/config/testdata/profile-v3-core-widgets-from-v2.golden.json";
import { parseProfileDocumentV3 } from "./profile-document";

describe("profile v3 contract fixtures", () => {
  it.each([
    ["v0 golden", goldenV0],
    ["v2 golden", goldenV2],
  ])("parses %s", (_label, golden) => {
    const parsed = parseProfileDocumentV3(golden);
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.layouts.general).toBeDefined();
  });

  it("parses v2 golden four core widgets", () => {
    const parsed = parseProfileDocumentV3(goldenV2);
    expect(parsed.layouts.general.widgets.map((widget) => widget.type)).toEqual([
      "delta",
      "standings",
      "relative",
      "pedals",
    ]);
    expect(parsed.layouts.general.widgets[0].visual.systemId).toMatch(/^vantare-/);
  });
});