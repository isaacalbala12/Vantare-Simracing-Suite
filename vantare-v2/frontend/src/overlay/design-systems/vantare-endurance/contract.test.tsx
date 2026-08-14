import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildHarnessTelemetry } from "../../authoring/fixtures/authoring-fixtures";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { createDefaultStandingsContent } from "../../widget-types/standings/standings-content";
import { buildStandingsViewModel } from "../../widget-types/standings/standings-view-model";
import { createDefaultRelativeContent } from "../../widget-types/relative/relative-content";
import { buildRelativeViewModel } from "../../widget-types/relative/relative-view-model";
import { DeltaEndurance } from "./delta/DeltaEndurance";
import { parseDeltaEnduranceSettings } from "./delta/delta-endurance-settings";
import { parsePedalsEnduranceSettings } from "./pedals/pedals-endurance-settings";
import { PedalsEndurance } from "./pedals/PedalsEndurance";
import { RelativeEndurance } from "./relative/RelativeEndurance";
import { parseRelativeEnduranceSettings } from "./relative/relative-endurance-settings";
import { StandingsEndurance } from "./standings/StandingsEndurance";
import { TrackMapEndurance } from "./track-map/TrackMapEndurance";
import { RELATIVE_DEFAULT_APPEARANCE } from "../../widget-types/relative/relative-renderer-helpers";
import { parseTrackMapEnduranceSettings } from "./track-map/track-map-endurance-settings";
import { buildTrackMapViewModel } from "../../widget-types/track-map/track-map-view-model";
import { createDefaultTrackMapContent } from "../../widget-types/track-map/track-map-content";
import { parseStandingsEnduranceSettings } from "./standings/standings-endurance-settings";
import { vantareEnduranceManifest } from "./manifest";
import type { DeltaViewModel } from "../../widget-types/delta/delta-view-model";
import type { PedalsViewModel } from "../../widget-types/pedals/pedals-view-model";

const testDir = dirname(fileURLToPath(import.meta.url));

afterEach(() => cleanup());

const snapshot = buildMockTelemetry({ session: "race", location: "track", state: "ready" });
const standingsModel = buildStandingsViewModel(snapshot, createDefaultStandingsContent());
const relativeModel = buildRelativeViewModel(snapshot, createDefaultRelativeContent());

const deltaModel: DeltaViewModel = {
  type: "delta",
  status: "ready",
  tone: "gaining",
  deltaText: "-0.312",
  lastLapText: "1:38.434",
  bestLapText: "1:36.186",
  progress: -0.156,
};

const pedalsModel: PedalsViewModel = {
  type: "pedals",
  status: "ready",
  throttle: 0.78,
  brake: 0.05,
  clutch: 0,
  throttleText: "78%",
  brakeText: "5%",
  clutchText: "0%",
};

function rootOf(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-widget-system="vantare-endurance"]') as HTMLElement;
}

describe("vantare-endurance contract", () => {
  it("registers exactly the five implemented core widgets", () => {
    expect(vantareEnduranceManifest.id).toBe("vantare-endurance");
    expect(vantareEnduranceManifest.version).toBe(1);
    expect(vantareEnduranceManifest.widgets.map((widget) => widget.widgetType)).toEqual([
      "delta",
      "standings",
      "relative",
      "pedals",
      "track-map",
    ]);
  });

  it("draws the outline when the circuit resolves, and badges it as reference", () => {
    const mapped = { ...snapshot, session: { ...snapshot.session, trackName: "Vantare Reference Loop" } };
    const model = buildTrackMapViewModel(mapped, createDefaultTrackMapContent());
    expect(model.synthetic).toBe(true);
    const view = render(
      <TrackMapEndurance model={model} settings={{}} renderMode="harness" />,
    );
    const root = rootOf(view.container);

    expect(root.getAttribute("data-widget-renderer")).toBe("track-map");
    expect(root.getAttribute("data-availability")).toBe("available");
    expect(root.querySelector(".ven-tm-outline")?.getAttribute("d")).toBe(model.outlinePath);
    expect(root.querySelector("[data-track-map-synthetic]")).toBeTruthy();
    expect(root.querySelector("[data-track-map-empty]")).toBeFalsy();
  });

  it("draws every placed car, with the player marked", () => {
    const mapped = {
      ...snapshot,
      session: { ...snapshot.session, trackName: "Vantare Reference Loop" },
      scoring: [
        { id: "car-1", isPlayer: true, groundPositionXMeters: 0, groundPositionZMeters: 0 },
        { id: "car-2", groundPositionXMeters: 200, groundPositionZMeters: -150 },
        { id: "car-3" },
      ],
    };
    const model = buildTrackMapViewModel(mapped, createDefaultTrackMapContent());
    const view = render(
      <TrackMapEndurance model={model} settings={{}} renderMode="harness" />,
    );
    const root = rootOf(view.container);

    const cars = [...root.querySelectorAll("[data-track-map-car]")] as SVGCircleElement[];
    expect(cars.map((car) => car.getAttribute("data-track-map-car"))).toEqual(["car-1", "car-2"]);
    expect(cars[0].getAttribute("data-player")).toBe("true");
    expect(cars[1].hasAttribute("data-player")).toBe(false);

    // The markup carries the published positions. Easing between samples is
    // applied imperatively on later frames, so a single render is still exactly
    // what telemetry said and the visual gate stays deterministic.
    expect(cars.map((car) => Number(car.getAttribute("cx")))).toEqual(
      model.markers.map((marker) => marker.x),
    );
    expect(cars.map((car) => Number(car.getAttribute("cy")))).toEqual(
      model.markers.map((marker) => marker.y),
    );
  });

  it("colours each car by its class, from the palette Relative already uses", () => {
    const mapped = {
      ...snapshot,
      session: { ...snapshot.session, trackName: "Vantare Reference Loop" },
      scoring: [
        { id: "hy", isPlayer: true, vehicleClass: "HYPERCAR", groundPositionXMeters: 0, groundPositionZMeters: 0 },
        { id: "p2", vehicleClass: "LMP2", groundPositionXMeters: 50, groundPositionZMeters: 0 },
        { id: "gt", vehicleClass: "LMGT3", groundPositionXMeters: 100, groundPositionZMeters: 0 },
        { id: "unknown", vehicleClass: "SOMETHING ELSE", groundPositionXMeters: 150, groundPositionZMeters: 0 },
        { id: "absent", groundPositionXMeters: 200, groundPositionZMeters: 0 },
      ],
    };
    const model = buildTrackMapViewModel(mapped, createDefaultTrackMapContent());
    const view = render(
      <TrackMapEndurance model={model} settings={{}} renderMode="harness" />,
    );
    const fills = new Map(
      [...rootOf(view.container).querySelectorAll("[data-track-map-car]")].map((car) => [
        car.getAttribute("data-track-map-car"),
        car.getAttribute("fill"),
      ]),
    );

    expect(fills.get("hy")).toBe(RELATIVE_DEFAULT_APPEARANCE.classHypercarColor);
    expect(fills.get("p2")).toBe(RELATIVE_DEFAULT_APPEARANCE.classLmp2Color);
    expect(fills.get("gt")).toBe(RELATIVE_DEFAULT_APPEARANCE.classGt3Color);
    // An unrecognised or absent class falls to neutral, never to another
    // category's colour.
    expect(fills.get("unknown")).toBe(RELATIVE_DEFAULT_APPEARANCE.classUnknownColor);
    expect(fills.get("absent")).toBe(RELATIVE_DEFAULT_APPEARANCE.classUnknownColor);
  });

  it("honours a configured class colour, so one setting means one category everywhere", () => {
    const mapped = {
      ...snapshot,
      session: { ...snapshot.session, trackName: "Vantare Reference Loop" },
      scoring: [{ id: "p2", vehicleClass: "LMP2", groundPositionXMeters: 0, groundPositionZMeters: 0 }],
    };
    const model = buildTrackMapViewModel(mapped, createDefaultTrackMapContent());
    const view = render(
      <TrackMapEndurance
        model={model}
        settings={{ classLmp2Color: "#00ff88" }}
        renderMode="harness"
      />,
    );
    expect(
      rootOf(view.container).querySelector('[data-track-map-car="p2"]')?.getAttribute("fill"),
    ).toBe("#00ff88");
  });

  it("keeps the player findable without relying on colour", () => {
    const mapped = {
      ...snapshot,
      session: { ...snapshot.session, trackName: "Vantare Reference Loop" },
      scoring: [
        { id: "me", isPlayer: true, vehicleClass: "LMP2", groundPositionXMeters: 0, groundPositionZMeters: 0 },
        { id: "rival", vehicleClass: "LMP2", groundPositionXMeters: 50, groundPositionZMeters: 0 },
      ],
    };
    const model = buildTrackMapViewModel(mapped, createDefaultTrackMapContent());
    const view = render(
      <TrackMapEndurance model={model} settings={{}} renderMode="harness" />,
    );
    const root = rootOf(view.container);
    const me = root.querySelector('[data-track-map-car="me"]')!;
    const rival = root.querySelector('[data-track-map-car="rival"]')!;

    // Same class, so the same fill: the distinction cannot come from colour.
    expect(me.getAttribute("fill")).toBe(rival.getAttribute("fill"));
    expect(me.getAttribute("data-player")).toBe("true");
    expect(Number(me.getAttribute("r"))).toBeGreaterThan(Number(rival.getAttribute("r")));
  });

  it("draws nothing and says so when the circuit is not mapped", () => {
    const unmapped = { ...snapshot, session: { ...snapshot.session, trackName: "Suzuka" } };
    const model = buildTrackMapViewModel(unmapped, createDefaultTrackMapContent());
    const view = render(
      <TrackMapEndurance model={model} settings={{}} renderMode="harness" />,
    );
    const root = rootOf(view.container);

    expect(root.getAttribute("data-availability")).toBe("unknown-track");
    expect(root.querySelector("svg")).toBeFalsy();
    expect(root.querySelector("[data-track-map-empty]")?.textContent).toBe("TRACK NOT MAPPED");
  });
  it("falls back to the declared template with an observable diagnostic", () => {
    for (const [parse, fallback] of [
      [parseDeltaEnduranceSettings, "delta-redline"],
      [parseStandingsEnduranceSettings, "standings-redline"],
      [parseRelativeEnduranceSettings, "relative-redline-mirror"],
      [parsePedalsEnduranceSettings, "pedals-redline"],
      [parseTrackMapEnduranceSettings, "track-map-outline"],
    ] as const) {
      const parsed = parse({ templateId: "nope" });
      expect(parsed.templateId).toBe(fallback);
      expect(parsed.templateDiagnostic).toBe("unknown-template");
      expect(parse({}).templateDiagnostic).toBeUndefined();
    }
  });

  it("renders standings tower as separate class panels with intra-class positions", () => {
    const multiclassModel = buildStandingsViewModel(
      buildHarnessTelemetry({
        session: "race",
        location: "track",
        state: "ready",
        widget: "standings",
        system: "vantare-endurance",
        variant: "standings-multiclass",
      }),
      { ...createDefaultStandingsContent(), classScope: "all-classes" },
    );
    const view = render(
      <StandingsEndurance
        model={multiclassModel}
        settings={{ templateId: "standings-tower" }}
        renderMode="harness"
      />,
    );
    const root = rootOf(view.container);
    expect(root.getAttribute("data-widget-renderer")).toBe("standings");
    expect(root.getAttribute("data-template")).toBe("standings-tower");

    const blocks = [...root.querySelectorAll("[data-class-block]")] as HTMLElement[];
    expect(blocks.map((block) => block.getAttribute("data-class-block"))).toEqual([
      "LMP2",
      "LMP3",
      "GT3",
    ]);
    for (const block of blocks) {
      expect(block.querySelector("[data-class-header]")).toBeTruthy();
      expect(block.querySelector(".ven-standings-head")).toBeTruthy();
      const chips = [...block.querySelectorAll(".ven-pos-chip")].map((chip) => chip.textContent);
      expect(chips).toEqual(chips.map((_, index) => String(index + 1)));
    }
    expect(root.querySelectorAll("[data-standings-row]").length).toBe(multiclassModel.rows.length);
  });

  it("keeps the player's class as the bottom panel and stacks the rest in hierarchy order", () => {
    const base = buildStandingsViewModel(
      buildHarnessTelemetry({
        session: "race",
        location: "track",
        state: "ready",
        widget: "standings",
        system: "vantare-endurance",
        variant: "standings-multiclass",
      }),
      { ...createDefaultStandingsContent(), classScope: "all-classes" },
    );
    expect(base.rows.find((row) => row.isPlayer)?.vehicleClass).toBe("GT3");

    const playerInLmp3 = {
      ...base,
      rows: base.rows.map((row) => ({
        ...row,
        isPlayer: row.vehicleClass === "LMP3" && row.driverName === "Rik Koen",
      })),
    };
    const view = render(
      <StandingsEndurance
        model={playerInLmp3}
        settings={{ templateId: "standings-tower" }}
        renderMode="harness"
      />,
    );
    const blocks = [...rootOf(view.container).querySelectorAll("[data-class-block]")];
    expect(blocks.map((block) => block.getAttribute("data-class-block"))).toEqual([
      "LMP2",
      "GT3",
      "LMP3",
    ]);
  });

  it("renders the F1 template with class segments, driver codes and per-class intervals", () => {
    const model = buildStandingsViewModel(
      buildHarnessTelemetry({
        session: "race",
        location: "track",
        state: "ready",
        widget: "standings",
        system: "vantare-endurance",
        variant: "standings-multiclass",
      }),
      { ...createDefaultStandingsContent(), classScope: "all-classes" },
    );
    const view = render(
      <StandingsEndurance
        model={model}
        settings={{ templateId: "standings-f1" }}
        renderMode="harness"
      />,
    );
    const root = rootOf(view.container);
    expect(root.getAttribute("data-template")).toBe("standings-f1");

    const blocks = [...root.querySelectorAll("[data-class-block]")] as HTMLElement[];
    expect(blocks.map((block) => block.getAttribute("data-class-block"))).toEqual([
      "LMP2",
      "LMP3",
      "GT3",
    ]);
    for (const block of blocks) {
      const firstRow = block.querySelector(".ven-f1-row") as HTMLElement;
      expect(firstRow.getAttribute("data-class-leader")).toBe("true");
      expect(firstRow.querySelector(".ven-f1-gap")?.textContent).toBe("Interval");
      const positions = [...block.querySelectorAll(".ven-f1-pos")].map((el) => el.textContent);
      expect(positions).toEqual(positions.map((_, index) => String(index + 1)));
      for (const code of block.querySelectorAll(".ven-f1-code")) {
        expect(code.textContent).toMatch(/^[A-ZÀ-Ü]{3}$/);
      }
    }
  });

  it("renders the WEC, LMU, Racelabs and Apex templates with class segmentation", () => {
    const model = buildStandingsViewModel(
      buildHarnessTelemetry({
        session: "race",
        location: "track",
        state: "ready",
        widget: "standings",
        system: "vantare-endurance",
        variant: "standings-multiclass",
      }),
      { ...createDefaultStandingsContent(), classScope: "all-classes" },
    );

    for (const templateId of [
      "standings-wec",
      "standings-lmu",
      "standings-racelabs",
      "standings-apex",
      "standings-neo",
      "standings-redline",
    ] as const) {
      const view = render(
        <StandingsEndurance model={model} settings={{ templateId }} renderMode="harness" />,
      );
      const root = rootOf(view.container);
      expect(root.getAttribute("data-template")).toBe(templateId);
      const blocks = [...root.querySelectorAll("[data-class-block]")].map((block) =>
        block.getAttribute("data-class-block"),
      );
      expect(blocks).toEqual(["LMP2", "LMP3", "GT3"]);
      expect(root.querySelector('[data-player="true"]')).toBeTruthy();
      cleanup();
    }
  });

  it("caps WEC blocks at eight rows while keeping an out-of-cut player visible", () => {
    const base = buildStandingsViewModel(
      buildHarnessTelemetry({
        session: "race",
        location: "track",
        state: "ready",
        widget: "standings",
        system: "vantare-endurance",
        variant: "standings-multiclass",
      }),
      { ...createDefaultStandingsContent(), classScope: "all-classes" },
    );
    const playerLastInGt3 = {
      ...base,
      rows: base.rows.map((row) => ({
        ...row,
        isPlayer: row.vehicleClass === "GT3" && row.driverName === "Conrad Laursen",
      })),
    };
    const view = render(
      <StandingsEndurance
        model={playerLastInGt3}
        settings={{ templateId: "standings-wec" }}
        renderMode="harness"
      />,
    );
    const gt3 = rootOf(view.container).querySelector('[data-class-block="GT3"]') as HTMLElement;
    const rows = [...gt3.querySelectorAll(".ven-wec-row")];
    expect(rows).toHaveLength(8);
    const lastRow = rows[7] as HTMLElement;
    expect(lastRow.getAttribute("data-player")).toBe("true");
    expect(lastRow.querySelector(".ven-wec-pos")?.textContent).toBe("10");
  });

  it("renders standings strip without class headers", () => {
    const view = render(
      <StandingsEndurance
        model={standingsModel}
        settings={{ templateId: "standings-strip" }}
        renderMode="harness"
      />,
    );
    const root = rootOf(view.container);
    expect(root.getAttribute("data-template")).toBe("standings-strip");
    expect(root.querySelectorAll("[data-class-header]").length).toBe(0);
    expect(root.querySelectorAll("[data-standings-row]").length).toBe(standingsModel.rows.length);
  });

  it("renders relative rows with tone-marked gaps and hides the titlebar in minimal", () => {
    const classic = render(
      <RelativeEndurance
        model={relativeModel}
        settings={{ templateId: "relative-classic" }}
        renderMode="harness"
      />,
    );
    expect(rootOf(classic.container).querySelector(".ven-titlebar")).toBeTruthy();
    cleanup();

    const minimal = render(
      <RelativeEndurance
        model={relativeModel}
        settings={{ templateId: "relative-minimal" }}
        renderMode="harness"
      />,
    );
    const root = rootOf(minimal.container);
    expect(root.querySelector(".ven-titlebar")).toBeNull();
    expect(root.querySelectorAll("[data-relative-row]").length).toBe(relativeModel.rows.length);
    for (const gap of root.querySelectorAll(".ven-relative-gap")) {
      expect(gap.getAttribute("data-tone")).toBeTruthy();
    }
  });

  it("renders the Neo family for relative, delta and pedals as floating cards", () => {
    const relative = render(
      <RelativeEndurance
        model={relativeModel}
        settings={{ templateId: "relative-neo" }}
        renderMode="harness"
      />,
    );
    const relativeRoot = rootOf(relative.container);
    expect(relativeRoot.getAttribute("data-template")).toBe("relative-neo");
    expect(relativeRoot.querySelector(".ven-neo-card")).toBeTruthy();
    expect(relativeRoot.querySelectorAll("[data-relative-row]").length).toBe(
      relativeModel.rows.length,
    );
    cleanup();

    const delta = render(
      <DeltaEndurance model={deltaModel} settings={{ templateId: "delta-neo" }} renderMode="harness" />,
    );
    const deltaRoot = rootOf(delta.container);
    expect(deltaRoot.getAttribute("data-template")).toBe("delta-neo");
    expect(deltaRoot.querySelector(".ven-neod-track")).toBeTruthy();
    expect(deltaRoot.querySelectorAll(".ven-neod-well")).toHaveLength(2);
    cleanup();

    const pedals = render(
      <PedalsEndurance
        model={pedalsModel}
        settings={{ templateId: "pedals-neo" }}
        renderMode="harness"
      />,
    );
    const pedalsRoot = rootOf(pedals.container);
    expect(pedalsRoot.getAttribute("data-template")).toBe("pedals-neo");
    expect(pedalsRoot.querySelectorAll("[data-pedal]")).toHaveLength(3);
  });

  it("dispatches delta between strip and block compositions", () => {
    const strip = render(
      <DeltaEndurance
        model={deltaModel}
        settings={{ templateId: "delta-strip" }}
        renderMode="harness"
      />,
    );
    expect(rootOf(strip.container).querySelector(".ven-delta-track")).toBeTruthy();
    cleanup();

    const block = render(
      <DeltaEndurance
        model={deltaModel}
        settings={{ templateId: "delta-block" }}
        renderMode="harness"
      />,
    );
    const root = rootOf(block.container);
    expect(root.querySelector(".ven-delta-track")).toBeNull();
    expect(root.querySelector(".ven-delta-laps")).toBeTruthy();
    expect(root.querySelector(".ven-delta-value")?.textContent).toBe("-0.312");
  });

  it("renders the three pedal bars with their values", () => {
    const view = render(
      <PedalsEndurance
        model={pedalsModel}
        settings={{ templateId: "pedals-classic" }}
        renderMode="harness"
      />,
    );
    const root = rootOf(view.container);
    const pedals = [...root.querySelectorAll("[data-pedal]")].map((el) =>
      el.getAttribute("data-pedal"),
    );
    expect(pedals).toEqual(["clutch", "brake", "throttle"]);
    const throttleFill = root.querySelector('[data-pedal="throttle"] .ven-pedal-fill') as HTMLElement;
    expect(throttleFill.style.getPropertyValue("--pedal-value")).toBe("0.78");
  });

  it("shows deterministic unavailable presentations and no editor controls", () => {
    const model = { ...deltaModel, status: "error" as const, statusMessage: "telemetry unavailable" };
    const view = render(<DeltaEndurance model={model} settings={{}} renderMode="harness" />);
    const root = rootOf(view.container);
    expect(root.getAttribute("data-status")).toBe("error");
    expect(root.querySelector(".ven-status-message")?.textContent).toBe("telemetry unavailable");
    expect(root.querySelector("button")).toBeNull();
    expect(root.querySelector("input")).toBeNull();
  });

  // Also a whole-tree scan; see the note in the Workshop characterization test.
  it("does not import forbidden runtime dependencies anywhere in the system", () => {
    const files = readdirSync(testDir, { recursive: true })
      .filter((file): file is string => typeof file === "string")
      .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".test.tsx"));
    for (const file of files) {
      const source = readFileSync(resolve(join(testDir, file)), "utf8");
      expect(source).not.toMatch(/@wailsio\/runtime/);
      expect(source).not.toMatch(/telemetry-store/);
      expect(source).not.toMatch(/getTelemetryRef/);
    }
  }, 30_000);
});
