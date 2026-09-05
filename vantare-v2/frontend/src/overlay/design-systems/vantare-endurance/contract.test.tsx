import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildAuthoringV2ScenarioRuntime } from "../../authoring/fixtures/authoring-v2-scenario-fixture";
import { buildWorkshopFrameV2 } from "../../authoring/fixtures/authoring-v2-workshop-frame";
import { createDefaultStandingsContent, getEnabledStandingsColumns } from "../../widget-types/standings/standings-content";
import { buildStandingsViewModelV2 } from "../../widget-types/standings/standings-view-model-v2";
import type { StandingsRowViewModel, StandingsViewModel } from "../../widget-types/standings/standings-view-model";
import { createDefaultRelativeContent, getEnabledRelativeColumns } from "../../widget-types/relative/relative-content";
import type { RelativeRowViewModel, RelativeViewModel } from "../../widget-types/relative/relative-view-model";
import type { TrackMapViewModel } from "../../widget-types/track-map/track-map-view-model";
import { DeltaEndurance } from "./delta/DeltaEndurance";
import { parseDeltaEnduranceSettings } from "./delta/delta-endurance-settings";
import { parsePedalsEnduranceSettings } from "./pedals/pedals-endurance-settings";
import { PedalsEndurance } from "./pedals/PedalsEndurance";
import { RelativeEndurance } from "./relative/RelativeEndurance";
import { parseRelativeEnduranceSettings } from "./relative/relative-endurance-settings";
import { StandingsEndurance } from "./standings/StandingsEndurance";
import { TrackMapEndurance } from "./track-map/TrackMapEndurance";
import { parseTrackMapEnduranceSettings } from "./track-map/track-map-endurance-settings";
import { parseStandingsEnduranceSettings } from "./standings/standings-endurance-settings";
import { vantareEnduranceManifest } from "./manifest";
import type { DeltaViewModel } from "../../widget-types/delta/delta-view-model";
import type { PedalsViewModel } from "../../widget-types/pedals/pedals-view-model";

const testDir = dirname(fileURLToPath(import.meta.url));

afterEach(() => cleanup());

const standingsTemplateRow: StandingsRowViewModel = {
  id: "template",
  position: 1,
  driverNumber: "",
  driverName: "Driver",
  vehicleClass: "HYPERCAR",
  teamCode: "",
  teamBrandColor: "",
  gapText: "+0.0s",
  intervalText: "+0.0s",
  currentLapText: "1",
  lastLapText: "1:31.234",
  bestLapText: "1:30.999",
  pitText: "",
  tireCompound: "",
  isPlayer: false,
  isLeader: false,
};

const standingsModel: StandingsViewModel = {
  type: "standings",
  status: "ready",
  activeClass: "HYPERCAR",
  sessionLabel: "RACE",
  remainingText: "—",
  columns: getEnabledStandingsColumns(createDefaultStandingsContent()),
  rows: [
    { ...standingsTemplateRow, id: "1", isLeader: true },
    { ...standingsTemplateRow, id: "2", position: 2, driverName: "Player", isPlayer: true },
    { ...standingsTemplateRow, id: "3", position: 3 },
  ],
};

const relativeTemplateRow: RelativeRowViewModel = {
  id: "template",
  position: 1,
  vehicleClass: "HYPERCAR",
  driverNumber: "",
  driverName: "Driver",
  gapText: "+0.0s",
  bestLapText: "-",
  lastLapText: "-",
  isPlayer: false,
  side: "ahead",
  tone: "neutral",
  gapSeconds: 0,
};

const relativeModel: RelativeViewModel = {
  type: "relative",
  status: "ready",
  columns: getEnabledRelativeColumns(createDefaultRelativeContent()),
  rowHeightMode: "compact",
  rows: [
    { ...relativeTemplateRow, id: "2", position: 2, tone: "ahead", gapText: "+2.0", gapSeconds: 2 },
    { ...relativeTemplateRow, id: "4", position: 4, driverName: "Player", isPlayer: true, tone: "player" },
    { ...relativeTemplateRow, id: "5", position: 5, side: "behind", tone: "behind", gapText: "-1.0", gapSeconds: -1 },
  ],
};

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

// E1c: el modelo multiclass ya no sale del megamódulo snapshot; se construye
// desde el frame V2 canónico (20 filas hypercar/lmp2/gte, jugador
// vehicle-000 en hypercar). Misma semántica de renderer, datos canónicos.
function buildEnduranceMulticlassModel() {
  const runtime = buildAuthoringV2ScenarioRuntime({
    session: "race",
    location: "track",
    state: "ready",
    widget: "standings",
    system: "vantare-endurance",
    variant: "standings-multiclass",
  });
  return buildStandingsViewModelV2(
    runtime.overlayV2Frame!,
    runtime.overlayV2Source!,
    { ...createDefaultStandingsContent(), classScope: "all-classes" },
  );
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
    const model: TrackMapViewModel = {
      type: "track-map",
      status: "ready",
      trackLabel: "Vantare Reference Loop",
      outlinePath: "M0 0L320 220",
      synthetic: true,
      viewBox: "0 0 320 220",
      showTrackLabel: true,
      markers: [],
    };
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
    const model: TrackMapViewModel = {
      type: "track-map",
      status: "ready",
      trackLabel: "Vantare Reference Loop",
      outlinePath: "M0 0L320 220",
      synthetic: true,
      viewBox: "0 0 320 220",
      showTrackLabel: true,
      markers: [
        { id: "car-1", x: 160, y: 110, isPlayer: true },
        { id: "car-2", x: 200, y: 80, isPlayer: false },
      ],
    };
    const view = render(
      <TrackMapEndurance model={model} settings={{}} renderMode="harness" />,
    );
    const root = rootOf(view.container);

    const cars = [...root.querySelectorAll("[data-track-map-car]")] as SVGCircleElement[];
    expect(cars.map((car) => car.getAttribute("data-track-map-car"))).toEqual(["car-1", "car-2"]);
    expect(cars[0].getAttribute("data-player")).toBe("true");
    expect(cars[1].hasAttribute("data-player")).toBe(false);
  });

  it("draws nothing and says so when the circuit is not mapped", () => {
    const model: TrackMapViewModel = {
      type: "track-map",
      status: "missing",
      synthetic: false,
      unavailableReason: "unknown-track",
      viewBox: "0 0 320 220",
      showTrackLabel: true,
      markers: [],
    };
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
    const multiclassModel = buildEnduranceMulticlassModel();
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
      "lmp2",
      "gte",
      "hypercar",
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
    const base = buildEnduranceMulticlassModel();
    expect(base.rows.find((row) => row.isPlayer)?.vehicleClass).toBe("hypercar");

    const playerInLmp2 = {
      ...base,
      rows: base.rows.map((row) => ({
        ...row,
        isPlayer: row.vehicleClass === "lmp2" && row.driverName === "Driver 001",
      })),
    };
    const view = render(
      <StandingsEndurance
        model={playerInLmp2}
        settings={{ templateId: "standings-tower" }}
        renderMode="harness"
      />,
    );
    const blocks = [...rootOf(view.container).querySelectorAll("[data-class-block]")];
    expect(blocks.map((block) => block.getAttribute("data-class-block"))).toEqual([
      "hypercar",
      "gte",
      "lmp2",
    ]);
  });

  it("renders the F1 template with class segments, driver codes and per-class intervals", () => {
    const model = buildEnduranceMulticlassModel();
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
      "lmp2",
      "gte",
      "hypercar",
    ]);
    for (const block of blocks) {
      const firstRow = block.querySelector(".ven-f1-row") as HTMLElement;
      expect(firstRow.getAttribute("data-class-leader")).toBe("true");
      expect(firstRow.querySelector(".ven-f1-gap")?.textContent).toBe("Interval");
      const positions = [...block.querySelectorAll(".ven-f1-pos")].map((el) => el.textContent);
      expect(positions).toEqual(positions.map((_, index) => String(index + 1)));
      for (const code of block.querySelectorAll(".ven-f1-code")) {
        // E1c: el golden canónico nombra "Driver NNN", así que los códigos
        // son numéricos ("000"); la derivación (3 primeras del apellido en
        // mayúsculas) la fija standings-endurance-shared, no este contract.
        expect(code.textContent).toMatch(/^[A-Z0-9]{3}$/);
      }
    }
  });

  it("renders the WEC, LMU, Racelabs and Apex templates with class segmentation", () => {
    const model = buildEnduranceMulticlassModel();

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
      expect(blocks).toEqual(["lmp2", "gte", "hypercar"]);
      expect(root.querySelector('[data-player="true"]')).toBeTruthy();
      cleanup();
    }
  });

  it("caps WEC blocks at eight rows while keeping an out-of-cut player visible", () => {
    // E1c: el canónico trae 7 hypercar como máximo (el tope 8 no mordería);
    // la densidad sale de la variante dev stress60 (21 hypercar), ya V2.
    const stress = buildWorkshopFrameV2({
      session: "race",
      location: "track",
      state: "ready",
      widget: "standings",
      system: "vantare-endurance",
      variant: "standings-stress60",
    });
    const base = buildStandingsViewModelV2(
      stress.overlayV2Frame!,
      stress.overlayV2Source!,
      { ...createDefaultStandingsContent(), classScope: "all-classes", rowCount: 60 },
    );
    const lastHypercar = base.rows.filter((row) => row.vehicleClass === "hypercar").at(-1)!;
    const playerLastInHypercar = {
      ...base,
      rows: base.rows.map((row) => ({ ...row, isPlayer: row.id === lastHypercar.id })),
    };
    const view = render(
      <StandingsEndurance
        model={playerLastInHypercar}
        settings={{ templateId: "standings-wec" }}
        renderMode="harness"
      />,
    );
    const hypercar = rootOf(view.container).querySelector('[data-class-block="hypercar"]') as HTMLElement;
    const rows = [...hypercar.querySelectorAll(".ven-wec-row")];
    expect(rows).toHaveLength(8);
    const lastRow = rows[7] as HTMLElement;
    expect(lastRow.getAttribute("data-player")).toBe("true");
    expect(lastRow.querySelector(".ven-wec-pos")?.textContent).toBe("21");
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
