import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { engineerRadioDefinition } from "../widget-types/engineer-radio/engineer-radio-definition";
import { raceScheduleDefinition } from "../widget-types/race-schedule/race-schedule-definition";
import { trackMapDefinition } from "../widget-types/track-map/track-map-definition";

// ISA-894 E1a: el contrato ya no publica firmas snapshot. Solo auxiliar/V2.
describe("ISA-894 E1a retirada contrato snapshot", () => {
  it("WidgetTypeDefinition ya no menciona TelemetrySnapshot ni firmas snapshot", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src", "overlay", "core", "widget-definition.ts"),
      "utf8",
    );
    expect(source).not.toContain("TelemetrySnapshot");
    expect(source).not.toContain("buildViewModel");
    expect(source).not.toContain("buildRuntimeViewModel");
    expect(source).not.toContain("buildPreviewViewModel");
  });

  it("auxiliares exponen solo buildAuxiliaryViewModel", () => {
    for (const definition of [raceScheduleDefinition, engineerRadioDefinition]) {
      expect("buildViewModel" in definition).toBe(false);
      expect("buildRuntimeViewModel" in definition).toBe(false);
      expect("buildPreviewViewModel" in definition).toBe(false);
      expect(typeof definition.buildAuxiliaryViewModel).toBe("function");
    }
  });

  it("track-map ya no publica preview snapshot (la frontera V2 vive en el registro)", () => {
    expect("buildPreviewViewModel" in trackMapDefinition).toBe(false);
  });

  it("auxiliares conservan su autoridad real sin snapshot", () => {
    const calendar = raceScheduleDefinition.buildAuxiliaryViewModel!(
      { rowCount: 1, licenseFilter: "all", timeZone: "UTC" },
      {
        raceScheduleEvents: [
          { id: "a", title: "Race A", track: "Le Mans", startAt: "2026-07-15T10:00:00Z", durationMinutes: 45, classes: ["Hypercar"], status: "upcoming" },
        ],
        raceScheduleStatus: "ready",
      },
      "desktop",
    );
    expect(calendar.events.map((event) => event.id)).toEqual(["a"]);

    const silent = engineerRadioDefinition.buildAuxiliaryViewModel!({}, {}, "desktop");
    expect(silent).toMatchObject({ visible: false, status: "missing" });
    const preview = engineerRadioDefinition.buildAuxiliaryViewModel!({}, {}, "studio");
    expect(preview).toMatchObject({ visible: true, preview: true });
  });
});
