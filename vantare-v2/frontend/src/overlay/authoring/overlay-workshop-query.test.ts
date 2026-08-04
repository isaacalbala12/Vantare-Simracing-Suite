import { describe, expect, it } from "vitest";
import {
  isOverlayWorkshopPath,
  parseOverlayWorkshopQuery,
  serializeOverlayWorkshopQuery,
} from "./overlay-workshop-query";

describe("Overlay Workshop query", () => {
  it("parses an explicit reproducible product selection", () => {
    expect(parseOverlayWorkshopQuery(
      "?widget=delta&system=vantare-crystal&design=delta-crystal-simple&state=stale&surface=obs&variant=default",
    )).toEqual({
      widget: "delta",
      system: "vantare-crystal",
      designId: "delta-crystal-simple",
      state: "stale",
      surface: "obs",
      variant: "default",
    });
  });

  it("rejects invalid or mismatched selections instead of silently falling back", () => {
    expect(parseOverlayWorkshopQuery("?widget=unknown")).toEqual({ error: "invalid widget parameter: unknown" });
    expect(parseOverlayWorkshopQuery("?widget=pedals&system=vantare-crystal&design=delta-crystal-simple")).toEqual({
      error: "design delta-crystal-simple requires widget=delta",
    });
    expect(parseOverlayWorkshopQuery("?widget=engineer-radio&system=vantare-original")).toEqual({
      error: "engineer-radio requires system=vantare-crystal",
    });
  });

  it("keeps the development route inaccessible outside development and serializes the full selection", () => {
    expect(isOverlayWorkshopPath("/workshop", false)).toBe(false);
    expect(isOverlayWorkshopPath("/hub", true)).toBe(false);
    const parsed = parseOverlayWorkshopQuery("?widget=relative&system=vantare-original&state=ready&surface=studio&variant=relative-fill");
    if ("error" in parsed) throw new Error(parsed.error);
    expect(serializeOverlayWorkshopQuery(parsed)).toBe(
      "widget=relative&system=vantare-original&state=ready&surface=studio&variant=relative-fill",
    );
  });
});
