import { describe, expect, it } from "vitest";
import { infographicFilename, type InfographicData } from "./strategy-infographic";

const data: InfographicData = {
  eyebrow: "Estrategia · Vantare",
  title: "ELMS Sprint Trophy",
  subtitle: "LMGT3 · Spa (WEC)",
  window: "14:40 → 15:10",
  duration: "30 min",
  planName: "Estrategia #1",
  figures: [],
  stints: [],
  stops: [],
  stopsEmpty: "sin paradas",
  inputs: [],
  axis: [],
  labels: {
    timeline: "t", stops: "p", inputs: "e", stopLap: "v", stopIn: "i", stopOut: "o", stopTime: "s", laps: "v",
  },
  footer: "pie",
};

describe("hoja de la estrategia", () => {
  it("nombra el fichero con el evento y la fecha", () => {
    const name = infographicFilename(data.title, "png", new Date(2026, 7, 25));
    expect(name).toBe("vantare-elms-sprint-trophy-20260825.png");
  });

  it("no deja el nombre vacío cuando el evento no tiene título utilizable", () => {
    expect(infographicFilename("···", "pdf", new Date(2026, 0, 3))).toBe("vantare-estrategia-20260103.pdf");
  });

  it("recorta nombres largos para que el fichero siga siendo manejable", () => {
    const long = "Campeonato interminable de resistencia con nombre larguísimo de verdad";
    const name = infographicFilename(long, "png", new Date(2026, 11, 31));
    expect(name.length).toBeLessThanOrEqual("vantare-".length + 48 + "-20261231.png".length);
  });
});
