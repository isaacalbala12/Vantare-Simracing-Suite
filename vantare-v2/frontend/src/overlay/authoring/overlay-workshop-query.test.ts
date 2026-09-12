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
      session: "race",
      location: "track",
      background: "grid",
      scale: 1,
      preset: "1080p",
    });
  });

  it("round trips controls and rejects unsafe stage values", () => {
    const parsed = parseOverlayWorkshopQuery("?widget=delta&system=vantare-original&state=ready&surface=studio&variant=default&session=practice&location=pits&background=transparent&scale=1.25&preset=720p&width=640&height=240&compare=obs");
    if ("error" in parsed) throw new Error(parsed.error);
    expect(serializeOverlayWorkshopQuery(parsed)).toContain("background=transparent");
    expect(serializeOverlayWorkshopQuery(parsed)).toContain("compare=obs");
    expect(parseOverlayWorkshopQuery("?background=unsafe")).toEqual({ error: "invalid background parameter: unsafe" });
    expect(parseOverlayWorkshopQuery("?scale=9")).toEqual({ error: "invalid scale parameter: 9" });
    expect(parseOverlayWorkshopQuery("?width=12")).toEqual({ error: "invalid declared dimensions" });
    expect(parseOverlayWorkshopQuery("?width=640")).toEqual({ error: "width and height must be declared together" });
  });

  it("rejects invalid or mismatched selections instead of silently falling back", () => {
    expect(parseOverlayWorkshopQuery("?widget=unknown")).toEqual({ error: "invalid widget parameter: unknown" });
    expect(parseOverlayWorkshopQuery("?widget=pedals&system=vantare-crystal&design=delta-crystal-simple")).toEqual({
      error: "design delta-crystal-simple requires widget=delta",
    });
    expect(parseOverlayWorkshopQuery("?widget=engineer-radio&system=vantare-original")).toEqual({
      error: "engineer-radio requires system=vantare-crystal or vantare-functional",
    });
  });

  it("accepts the two reproducible Redline column variants only for standings", () => {
    for (const variant of ["standings-minimal", "standings-all-columns"]) {
      const parsed = parseOverlayWorkshopQuery(
        `?widget=standings&system=vantare-endurance&variant=${variant}`,
      );
      expect("error" in parsed).toBe(false);
      expect(parseOverlayWorkshopQuery(`?widget=delta&variant=${variant}`)).toEqual({
        error: `${variant} variant requires widget=standings`,
      });
    }
  });

  it("keeps the Efficiency study skin only inside the functional study variant", () => {
    const parsed = parseOverlayWorkshopQuery(
      "?widget=standings&system=vantare-functional&variant=standings-functional-study&design=standings-functional-compact&study=v2-focus",
    );
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.studyStyle).toBe("v2-focus");
    expect(serializeOverlayWorkshopQuery(parsed)).toContain("study=v2-focus");

    expect(parseOverlayWorkshopQuery("?study=inventada")).toEqual({ error: "invalid study parameter: inventada" });

    // Un valor válido fuera del estudio se descarta sin romper la página.
    const outside = parseOverlayWorkshopQuery("?widget=standings&system=vantare-functional&variant=default&study=v2-focus");
    if ("error" in outside) throw new Error(outside.error);
    expect(outside.studyStyle).toBeUndefined();
    expect(serializeOverlayWorkshopQuery(outside)).not.toContain("study=");
  });

  it("round-trips the brand selector and rejects unknown values", () => {
    const parsed = parseOverlayWorkshopQuery("?widget=standings&system=vantare-functional&variant=standings-multiclass&brand=off");
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.brand).toBe("off");
    expect(serializeOverlayWorkshopQuery(parsed)).toContain("brand=off");
    expect(parseOverlayWorkshopQuery("?brand=quizas")).toEqual({ error: "invalid brand parameter: quizas" });
    const unset = parseOverlayWorkshopQuery("?widget=standings&system=vantare-functional&variant=standings-multiclass");
    if ("error" in unset) throw new Error(unset.error);
    expect(unset.brand).toBeUndefined();
    expect(serializeOverlayWorkshopQuery(unset)).not.toContain("brand=");
  });

  it("keeps the development route inaccessible outside development and serializes the full selection", () => {
    expect(isOverlayWorkshopPath("/workshop", false)).toBe(false);
    expect(isOverlayWorkshopPath("/hub", true)).toBe(false);
    const parsed = parseOverlayWorkshopQuery("?widget=relative&system=vantare-original&state=ready&surface=studio&variant=relative-fill");
    if ("error" in parsed) throw new Error(parsed.error);
    expect(serializeOverlayWorkshopQuery(parsed)).toBe(
      "widget=relative&system=vantare-original&state=ready&surface=studio&variant=relative-fill&session=race&location=track&background=grid&scale=1&preset=1080p",
    );
  });

  it("parses footer slots for functional standings/relative without a cap and drops them elsewhere", () => {
    const standings = parseOverlayWorkshopQuery("?widget=standings&system=vantare-functional&slots=time,lap,gap,track,wind,ambient");
    expect(standings).not.toHaveProperty("error");
    if (!("error" in standings)) expect(standings.slots).toEqual(["time", "lap", "gap", "track", "wind", "ambient"]);
    const relative = parseOverlayWorkshopQuery("?widget=relative&system=vantare-functional&slots=bestLap");
    if (!("error" in relative)) expect(relative.slots).toEqual(["bestLap"]);
    expect(parseOverlayWorkshopQuery("?widget=delta&system=vantare-functional&slots=gap")).not.toHaveProperty("slots");
    expect(parseOverlayWorkshopQuery("?widget=standings&system=vantare-original&slots=gap")).not.toHaveProperty("slots");
    expect(parseOverlayWorkshopQuery("?widget=standings&system=vantare-functional&slots=unknown")).toHaveProperty("error");
  });
});
