import { describe, expect, it } from "vitest";
import { readOverlayRouteParams } from "./overlay-route-params";

describe("readOverlayRouteParams", () => {
  it("reads profile and studio preview flags from the overlay query", () => {
    expect(readOverlayRouteParams("?profile=profiles%2Fa.json&studioPreview=1")).toEqual({
      profileName: "profiles/a.json",
      studioPreview: true,
    });
    expect(readOverlayRouteParams("")).toEqual({
      profileName: "example-streaming.json",
      studioPreview: false,
    });
  });
});