import { describe, expect, it } from "vitest";
import {
  isOverlayWorkshopPath,
  parseOverlayWorkshopQuery,
  serializeOverlayWorkshopQuery,
} from "./overlay-workshop-query";
import { buildWorkshopWidget } from "./fixtures/authoring-v2-workshop-frame";

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

  it.each(["efficiency", "vantare-efficiency", "functional"]) (
    "normalizes the %s Workshop alias to the stable URL contract",
    (alias) => {
      const parsed = parseOverlayWorkshopQuery(`?widget=relative&system=${alias}&variant=default`);
      if ("error" in parsed) throw new Error(parsed.error);
      expect(parsed.system).toBe("vantare-functional");
      expect(serializeOverlayWorkshopQuery(parsed)).toContain("system=vantare-functional");
    },
  );

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
    expect(parseOverlayWorkshopQuery("?widget=relative&variant=relative-multiclass")).toEqual({
      error: "invalid variant parameter: relative-multiclass",
    });
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

  it("selects Efficiency Standings default and keeps all three study styles reproducible", () => {
    const parsed = parseOverlayWorkshopQuery(
      "?widget=standings&system=vantare-functional&variant=standings-functional-study&design=standings-functional-compact&study=v2-focus",
    );
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.studyStyle).toBe("v2-focus");
    expect(serializeOverlayWorkshopQuery(parsed)).toContain("study=v2-focus");

    expect(parseOverlayWorkshopQuery("?study=inventada")).toEqual({ error: "invalid study parameter: inventada" });

    const defaultStyle = parseOverlayWorkshopQuery("?widget=standings&system=vantare-functional&variant=default");
    if ("error" in defaultStyle) throw new Error(defaultStyle.error);
    expect(defaultStyle.studyStyle).toBe("default");
    expect(defaultStyle.around).toBe(4);
    expect(serializeOverlayWorkshopQuery(defaultStyle)).toContain("study=default");
    expect(serializeOverlayWorkshopQuery(defaultStyle)).toContain("around=4");

    // Un valor válido fuera de Standings de Eficiencia se descarta sin romper
    // la página.
    const outside = parseOverlayWorkshopQuery("?widget=relative&system=vantare-functional&variant=default&study=v2-focus&around=4");
    if ("error" in outside) throw new Error(outside.error);
    expect(outside.studyStyle).toBeUndefined();
    expect(outside.around).toBeUndefined();
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

  it("keeps Functional Standings modules on the canonical variant", () => {
    const parsed = parseOverlayWorkshopQuery(
      "?widget=standings&system=vantare-functional&variant=default&modules=bestLap,pit",
    );
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.modules).toEqual(["bestLap", "pit"]);
    expect(serializeOverlayWorkshopQuery(parsed)).toContain("modules=bestLap%2Cpit");

    const widget = buildWorkshopWidget({
      widget: "standings",
      system: "vantare-functional",
      variant: "default",
      session: "race",
      modules: parsed.modules,
    });
    const columns = (widget.content.columns as { metricId: string; enabled: boolean }[])
      .filter((column) => column.enabled)
      .map((column) => column.metricId);
    expect(columns).toEqual(["position", "driverName", "bestLap", "pit"]);
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

  it("round-trips the relative window and drops it outside relative", () => {
    const parsed = parseOverlayWorkshopQuery("?widget=relative&ahead=5&behind=0");
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.ahead).toBe(5);
    expect(parsed.behind).toBe(0);
    expect(serializeOverlayWorkshopQuery(parsed)).toContain("ahead=5");
    expect(serializeOverlayWorkshopQuery(parsed)).toContain("behind=0");
    expect(parseOverlayWorkshopQuery("?widget=delta&ahead=4")).not.toHaveProperty("ahead");
    expect(parseOverlayWorkshopQuery("?widget=relative&ahead=9")).toHaveProperty("error");
    expect(parseOverlayWorkshopQuery("?widget=relative&behind=-1")).toHaveProperty("error");
    expect(parseOverlayWorkshopQuery("?widget=relative&ahead=1.5")).toHaveProperty("error");
  });

  it("round-trips the standings row count and drops it outside standings", () => {
    const parsed = parseOverlayWorkshopQuery("?widget=standings&rows=27");
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.rows).toBe(27);
    expect(serializeOverlayWorkshopQuery(parsed)).toContain("rows=27");
    expect(parseOverlayWorkshopQuery("?widget=relative&rows=12")).not.toHaveProperty("rows");
    expect(parseOverlayWorkshopQuery("?widget=standings&rows=0")).toHaveProperty("error");
    expect(parseOverlayWorkshopQuery("?widget=standings&rows=31")).toHaveProperty("error");
    expect(parseOverlayWorkshopQuery("?widget=standings&rows=2.5")).toHaveProperty("error");
  });

  it("round-trips the shared standings neighbour window and player position", () => {
    const parsed = parseOverlayWorkshopQuery("?widget=standings&system=vantare-functional&study=v2-focus&rows=12&playerPosition=9&around=6");
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.around).toBe(6);
    expect(parsed.playerPosition).toBe(9);
    expect(serializeOverlayWorkshopQuery(parsed)).toContain("around=6");
    expect(serializeOverlayWorkshopQuery(parsed)).toContain("playerPosition=9");
    expect(parseOverlayWorkshopQuery("?widget=standings&system=vantare-functional&around=3")).toHaveProperty("error");
    expect(parseOverlayWorkshopQuery("?widget=delta&around=4")).not.toHaveProperty("around");
    expect(parseOverlayWorkshopQuery("?widget=delta&playerPosition=4")).not.toHaveProperty("playerPosition");
    expect(parseOverlayWorkshopQuery("?widget=standings&rows=8&playerPosition=9")).toHaveProperty("error");
  });

  it("round-trips explicit SessionV2 flag probes for flag-aware widgets", () => {
    const parsed = parseOverlayWorkshopQuery("?widget=pedals&flag=yellow");
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.flag).toBe("yellow");
    expect(serializeOverlayWorkshopQuery(parsed)).toContain("flag=yellow");

    const outside = parseOverlayWorkshopQuery("?widget=standings&flag=yellow");
    if ("error" in outside) throw new Error(outside.error);
    expect(outside).not.toHaveProperty("flag");
    const racingFlags = parseOverlayWorkshopQuery("?widget=racing-flags&system=vantare-functional&flag=yellow");
    if ("error" in racingFlags) throw new Error(racingFlags.error);
    expect(racingFlags.flag).toBe("yellow");
    expect(serializeOverlayWorkshopQuery(racingFlags)).toContain("flag=yellow");
    expect(parseOverlayWorkshopQuery("?widget=pedals&flag=not-a-flag")).toEqual({
      error: "invalid flag parameter: not-a-flag",
    });
  });

  it("round-trips the Functional Racing Flags text color and rejects invalid colors", () => {
    const parsed = parseOverlayWorkshopQuery("?widget=racing-flags&system=vantare-functional&textColor=%23ffcc00");
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.textColor).toBe("#ffcc00");
    expect(serializeOverlayWorkshopQuery(parsed)).toContain("textColor=%23ffcc00");
    expect(parseOverlayWorkshopQuery("?widget=racing-flags&system=vantare-functional&textColor=yellow")).toEqual({
      error: "invalid textColor parameter: yellow",
    });

    const outside = parseOverlayWorkshopQuery("?widget=standings&textColor=%23ffcc00");
    if ("error" in outside) throw new Error(outside.error);
    expect(outside).not.toHaveProperty("textColor");
  });
});
