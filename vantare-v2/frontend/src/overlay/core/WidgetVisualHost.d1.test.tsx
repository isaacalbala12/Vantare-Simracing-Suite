import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WidgetVisualHost } from "./WidgetVisualHost";
import {
  getOverlayV2ViewModelEntry,
  overlayV2ViewModelRegistry,
} from "./overlay-v2-view-models";
import { widgetTypeRegistry } from "./widget-registry";
import { buildAuthoringV2ScenarioRuntime } from "../authoring/fixtures/authoring-v2-scenario-fixture";
import { engineerRadioDefinition } from "../widget-types/engineer-radio/engineer-radio-definition";
import { raceScheduleDefinition } from "../widget-types/race-schedule/race-schedule-definition";
import type { WidgetType } from "./profile-document";

afterEach(() => cleanup());

const hostSource = () =>
  readFileSync(resolve(process.cwd(), "src", "overlay", "core", "WidgetVisualHost.tsx"), "utf8");

function scenarioRuntime(type: WidgetType) {
  const definition = widgetTypeRegistry.get(type);
  const widget = definition.createDefault(`d1-${type}`);
  return {
    widget,
    runtime: buildAuthoringV2ScenarioRuntime({
      session: "race",
      location: "track",
      state: "ready",
      widget: type,
      system: widget.visual.systemId,
      variant: "default",
    }),
  };
}

describe("WidgetVisualHost D1 sin legacy", () => {
  it("no conserva prop snapshot, rama legacy ni builder legacy en el Host", () => {
    const source = hostSource();
    expect(source).not.toContain("TelemetrySnapshot");
    expect(source).not.toContain("definition.buildViewModel");
    expect(source).not.toContain("harnessMode && snapshot");
    expect(source).not.toContain("recordInputTelemetrySample");
    expect(source).not.toContain("readInputTelemetryHistory");
  });

  it("cero callers productivos pasan snapshot al Host", () => {
    const offenders: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx$/.test(entry.name) || /\.test\.tsx$/.test(entry.name)) continue;
        const source = readFileSync(path, "utf8");
        if (
          /<(?:Memo)?WidgetVisualHost\b/.test(source) &&
          /snapshot=\{/.test(source)
        ) {
          offenders.push(path);
        }
      }
    };
    walk(resolve(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });

  it("los 18 tipos V2 exigen frame y source, y los auxiliares siguen por su canal explícito", () => {
    expect(overlayV2ViewModelRegistry.size).toBe(18);
    expect(getOverlayV2ViewModelEntry("race-schedule" as never)).toBeUndefined();
    expect(getOverlayV2ViewModelEntry("engineer-radio" as never)).toBeUndefined();
  });

  it.each([...overlayV2ViewModelRegistry.keys()])(
    "%s renderiza con frame+source y exige cada uno por separado",
    (type) => {
      const { widget, runtime } = scenarioRuntime(type);

      const full = render(
        <WidgetVisualHost widget={widget} renderMode="desktop" runtime={runtime} />,
      );
      expect(
        full.container.querySelector(`[data-widget-renderer="${type}"]`),
      ).toBeTruthy();
      expect(full.queryByTestId("widget-host-diagnostic")).toBeNull();
      cleanup();

      const noFrame = render(
        <WidgetVisualHost
          widget={widget}
          renderMode="desktop"
          runtime={{ overlayV2Source: runtime.overlayV2Source }}
        />,
      );
      expect(noFrame.getByTestId("widget-host-diagnostic")).toBeTruthy();
      expect(
        noFrame.getByTestId("widget-host-diagnostic").getAttribute("data-diagnostic-code"),
      ).toBe("overlay-v2-frame-missing");
      cleanup();

      const noSource = render(
        <WidgetVisualHost
          widget={widget}
          renderMode="desktop"
          runtime={{ overlayV2Frame: runtime.overlayV2Frame }}
        />,
      );
      expect(
        noSource.getByTestId("widget-host-diagnostic").getAttribute("data-diagnostic-code"),
      ).toBe("overlay-v2-source-missing");
      cleanup();
    },
  );

  it("race-schedule llega solo por el canal auxiliar Calendar", () => {
    const widget = raceScheduleDefinition.createDefault("d1-calendar");
    const view = render(
      <WidgetVisualHost
        widget={widget}
        renderMode="desktop"
        runtime={{
          raceScheduleStatus: "ready",
          raceScheduleEvents: [
            {
              id: "calendar-1",
              title: "Le Mans Virtual Cup",
              track: "Le Mans",
              startAt: "2026-09-01T18:00:00Z",
              durationMinutes: 60,
              classes: ["Hypercar"],
              status: "upcoming",
            },
          ],
        }}
      />,
    );
    expect(view.getByText("Le Mans Virtual Cup")).toBeTruthy();
  });

  it("engineer-radio llega solo por su fuente auxiliar explícita", () => {
    const widget = engineerRadioDefinition.createDefault("d1-engineer");
    const view = render(<WidgetVisualHost widget={widget} renderMode="studio" />);
    expect(
      view.container.querySelector('[data-engineer-radio-root][data-preview="true"]'),
    ).toBeTruthy();
    expect(view.getByText("PREVIEW")).toBeTruthy();
  });
});
