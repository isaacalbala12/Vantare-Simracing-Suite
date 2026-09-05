import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverlayWorkshopDevRoute, OVERLAY_WORKSHOP_PROFILE_ID } from "./OverlayWorkshopDevRoute";
import { RuntimeWidgetFrame } from "../runtime/RuntimeWidgetFrame";
import { createTelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import {
  buildWorkshopFrameV2,
  createScenarioWidget,
  isWorkshopV2Variant,
  STANDINGS_REPLAY_FRAME_COUNT,
  WORKSHOP_V2_DEV_VARIANTS,
  type WorkshopV2Scenario,
  type WorkshopV2Variant,
} from "./fixtures/authoring-v2-workshop-frame";
import { parseOverlayWorkshopQuery } from "./overlay-workshop-query";
import * as relativeV2 from "../widget-types/relative/relative-view-model-v2";
import { relativeDefinition } from "../widget-types/relative/relative-definition";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * The Workshop exists to show what a design will look like in a race. That is a
 * claim about equivalence with the runtime, and a claim of that kind belongs in
 * a test rather than in a reviewer's confidence.
 *
 * Both sides are given the same widget and the same V2 frame; the renderer
 * markup must come out identical. Anything the Workshop adds or drops around
 * the renderer — a class, an attribute, a wrapper — shows up here as a diff.
 */
function scenario(overrides: Partial<WorkshopV2Scenario> = {}): WorkshopV2Scenario {
  return {
    session: "race",
    location: "track",
    state: "ready",
    widget: "standings",
    system: "vantare-endurance",
    variant: "default",
    ...overrides,
  };
}

function rendererMarkup(root: ParentNode, widgetType: string): string {
  const node = root.querySelector(`[data-widget-renderer="${widgetType}"]`);
  if (!node) {
    throw new Error(`no renderer markup for ${widgetType}`);
  }
  return node.outerHTML;
}

async function workshopMarkup(search: string, widgetType: string): Promise<string> {
  const { container } = render(<OverlayWorkshopDevRoute search={search} />);
  await waitFor(() =>
    expect(container.querySelector(`[data-widget-renderer="${widgetType}"]`)).toBeTruthy(),
  );
  const markup = rendererMarkup(
    container.querySelector("[data-overlay-workshop-widget-root]")!,
    widgetType,
  );
  cleanup();
  return markup;
}

async function runtimeMarkup(parsed: {
  widget: WorkshopV2Scenario["widget"];
  system: WorkshopV2Scenario["system"];
  variant: WorkshopV2Variant;
  designId?: string;
  session: WorkshopV2Scenario["session"];
  location: WorkshopV2Scenario["location"];
  state: WorkshopV2Scenario["state"];
}): Promise<string> {
  const widget = createScenarioWidget({
    widget: parsed.widget,
    system: parsed.system,
    variant: parsed.variant,
    ...(parsed.designId ? { designId: parsed.designId } : {}),
  });
  const frame = buildWorkshopFrameV2({
    session: parsed.session,
    location: parsed.location,
    state: parsed.state,
    widget: parsed.widget,
    system: parsed.system,
    variant: parsed.variant,
  });
  const coordinator = createTelemetryRateCoordinator();
  coordinator.setOverlayFrame(frame.overlayV2Frame, frame.overlayV2Source);
  const { container } = render(
    <RuntimeWidgetFrame widget={widget} profileId={OVERLAY_WORKSHOP_PROFILE_ID} telemetry={coordinator} renderMode="obs" />,
  );
  await waitFor(() =>
    expect(container.querySelector(`[data-widget-renderer="${parsed.widget}"]`)).toBeTruthy(),
  );
  const markup = rendererMarkup(container, parsed.widget);
  cleanup();
  coordinator.dispose();
  return markup;
}

describe("buildWorkshopFrameV2", () => {
  it("rejects non-canonical variants even when cast", () => {
    expect(() => buildWorkshopFrameV2(scenario({ variant: "stress60" as WorkshopV2Variant }))).toThrow(
      /variante no soportada/,
    );
  });

  it("keeps the default frame identical to the canonical golden", () => {
    const first = JSON.stringify(buildWorkshopFrameV2(scenario()));
    const second = JSON.stringify(buildWorkshopFrameV2(scenario()));
    expect(first).toBe(second);
    const frame = buildWorkshopFrameV2(scenario()).overlayV2Frame!;
    expect(frame.standings).toHaveLength(20);
  });

  it("derives 60 stable rows for standings-stress60", () => {
    const canonical = buildWorkshopFrameV2(scenario()).overlayV2Frame!;
    const first = buildWorkshopFrameV2(scenario({ variant: "standings-stress60" })).overlayV2Frame!;
    const second = buildWorkshopFrameV2(scenario({ variant: "standings-stress60" })).overlayV2Frame!;
    expect(first.standings).toHaveLength(60);
    expect(first.standings.map((row) => row.id)).toEqual(second.standings.map((row) => row.id));
    expect(new Set(first.standings.map((row) => row.id)).size).toBe(60);
    // La primera copia conserva todos los ids canónicos, incluido el jugador.
    expect(first.standings.slice(0, 20).map((row) => row.id)).toEqual(
      canonical.standings.map((row) => row.id),
    );
    expect(first.standings.some((row) => row.id === first.player.id)).toBe(true);
    expect(first.standings.map((row) => row.position)).toEqual(
      Array.from({ length: 60 }, (_, index) => index + 1),
    );
  });

  it("moves observably between replay frames without Date.now", () => {
    const a = JSON.stringify(buildWorkshopFrameV2(scenario({ variant: "standings-replay", replayFrame: 0 })));
    const b = JSON.stringify(buildWorkshopFrameV2(scenario({ variant: "standings-replay", replayFrame: 4 })));
    expect(a).not.toBe(b);
    expect(JSON.stringify(buildWorkshopFrameV2(scenario({ variant: "standings-replay", replayFrame: 4 })))).toBe(b);
    expect(STANDINGS_REPLAY_FRAME_COUNT).toBe(10);
  });

  it("keeps observable rows and classes for relative-multiclass", () => {
    const frame = buildWorkshopFrameV2(scenario({ widget: "relative", variant: "relative-multiclass" }))
      .overlayV2Frame!;
    for (const section of [frame.relative, frame.relativeSettled] as const) {
      expect(section).toHaveLength(8);
      expect(section.map((row) => row.id)).toEqual(frame.relative.map((row) => row.id));
      expect(new Set(section.map((row) => row.id)).size).toBe(8);
      const players = section.filter((row) => row.side === "player");
      expect(players).toHaveLength(1);
      expect(players[0]!.id).toBe(frame.player.id);
      expect(players[0]!.gap).toMatchObject({ v: 0 });
      expect(section.filter((row) => row.side === "ahead")).toHaveLength(4);
      expect(section.filter((row) => row.side === "behind")).toHaveLength(3);
      expect(new Set(section.map((row) => row.classId)).size).toBeGreaterThan(1);
    }
  });

  it("crosses the same id through side and gap in relative-cross", () => {
    const before = buildWorkshopFrameV2(
      scenario({ widget: "relative", sceneId: "relative-cross", sceneFrame: 0 }),
    ).overlayV2Frame!;
    const after = buildWorkshopFrameV2(
      scenario({ widget: "relative", sceneId: "relative-cross", sceneFrame: 1 }),
    ).overlayV2Frame!;
    for (const [past, next] of [[before.relative, after.relative], [before.relativeSettled, after.relativeSettled]] as const) {
      const crosser = past.find((row) => row.side === "behind" && (row.gap.v ?? 0) < 0 && row.position === 20)!;
      expect(crosser).toBeDefined();
      const crossed = next.find((row) => row.id === crosser.id)!;
      expect(crossed.side).toBe("ahead");
      expect(crossed.gap.v ?? 0).toBeGreaterThan(0);
    }
  });

  it("hides and shows the entering id inside the product window", () => {
    const content = relativeDefinition.parseContent(
      relativeDefinition.createDefault("enter-probe").content,
    );
    const atRest = buildWorkshopFrameV2(scenario({ widget: "relative" })).overlayV2Frame!;
    const seatId = atRest.relative.find((row) => row.position === 19)!.id;
    const shown = relativeV2.buildSettledRelativeViewModelV2(
      buildWorkshopFrameV2(
        scenario({ widget: "relative", sceneId: "relative-enter", sceneFrame: 1 }),
      ).overlayV2Frame!,
      buildWorkshopFrameV2(scenario({ widget: "relative" })).overlayV2Source!,
      content,
    );
    const hidden = relativeV2.buildSettledRelativeViewModelV2(
      buildWorkshopFrameV2(
        scenario({ widget: "relative", sceneId: "relative-enter", sceneFrame: 0 }),
      ).overlayV2Frame!,
      buildWorkshopFrameV2(scenario({ widget: "relative" })).overlayV2Source!,
      content,
    );
    expect(shown.rows.some((row) => row.id === seatId)).toBe(true);
    expect(hidden.rows.some((row) => row.id === seatId)).toBe(false);
  });

  it("forces player and aligned history for pedals extremes", () => {
    const zero = buildWorkshopFrameV2(scenario({ widget: "pedals", variant: "pedals-zero" })).overlayV2Frame!;
    const full = buildWorkshopFrameV2(scenario({ widget: "pedals", variant: "pedals-full" })).overlayV2Frame!;
    expect(zero.player.throttle).toMatchObject({ v: 0 });
    expect(full.player.throttle).toMatchObject({ v: 1 });
    const canonical = buildWorkshopFrameV2(scenario({ widget: "pedals" })).overlayV2Frame!;
    expect(zero.controls.history.capturedAtMS).toEqual(canonical.controls.history.capturedAtMS);
    expect(zero.controls.history.throttle?.every((value) => value === 0)).toBe(true);
    expect(full.controls.history.throttle?.every((value) => value === 1)).toBe(true);
  });

  it("applies scene frames observably without snapshot", () => {
    const rest = JSON.stringify(
      buildWorkshopFrameV2(scenario({ sceneId: "standings-battle", sceneFrame: 0 })),
    );
    const fight = JSON.stringify(
      buildWorkshopFrameV2(scenario({ sceneId: "standings-battle", sceneFrame: 2 })),
    );
    expect(rest).not.toBe(fight);
  });

  it("accepts every Workshop variant through one source", () => {
    for (const variant of WORKSHOP_V2_DEV_VARIANTS) {
      expect(isWorkshopV2Variant(variant)).toBe(true);
    }
    expect(isWorkshopV2Variant("stress60")).toBe(false);
  });
});

describe("createScenarioWidget", () => {
  it("rejects incompatible official designs without applying them", () => {
    expect(() =>
      createScenarioWidget({
        widget: "standings",
        system: "vantare-original",
        variant: "default",
        designId: "standings-endurance-redline",
      }),
    ).toThrow(/incompatible/);
    expect(() =>
      createScenarioWidget({
        widget: "delta",
        system: "vantare-endurance",
        variant: "default",
        designId: "standings-endurance-redline",
      }),
    ).toThrow(/incompatible/);
    expect(() =>
      createScenarioWidget({
        widget: "standings",
        system: "vantare-endurance",
        variant: "default",
        designId: "no-such-design",
      }),
    ).toThrow(/desconocido/);
  });
});

describe("the Workshop renders what the runtime renders", () => {
  it("consume la autoridad settled de Relative Redline sin estado frontend por perfil", async () => {
    const input = scenario({ widget: "relative", system: "vantare-endurance" });
    const parsed = parseOverlayWorkshopQuery(
      "?widget=relative&system=vantare-endurance&state=ready&surface=obs",
    );
    if ("error" in parsed) {
      throw new Error(parsed.error);
    }
    const widget = createScenarioWidget({
      widget: parsed.widget,
      system: parsed.system,
      variant: parsed.variant,
    });
    const frame = buildWorkshopFrameV2(input);
    expect(frame.overlayV2Frame).toBeDefined();
    expect(frame.overlayV2Source).toBeDefined();
    const v2frame = frame.overlayV2Frame!;
    const model = relativeV2.buildSettledRelativeViewModelV2(
      {
        ...v2frame,
        relative: v2frame.relative.map((row, index) => ({ ...row, id: `raw-${index}` })),
      },
      frame.overlayV2Source!,
      relativeDefinition.parseContent(widget.content),
    );
    const settledIds = new Set(v2frame.relativeSettled.map((row) => row.id));
    expect(model.rows.length).toBeGreaterThan(0);
    expect(model.rows.every((row) => settledIds.has(row.id))).toBe(true);
    expect(model.rows.some((row) => row.id.startsWith("raw-"))).toBe(false);

    const search = "?widget=relative&system=vantare-endurance&state=ready&surface=obs";
    const first = render(<OverlayWorkshopDevRoute search={search} profileId="profile-a" />);
    await waitFor(() => expect(first.container.querySelector('[data-widget-renderer="relative"]')).toBeTruthy());
    const firstMarkup = rendererMarkup(first.container, "relative");
    first.unmount();
    const second = render(<OverlayWorkshopDevRoute search={search} profileId="profile-b" />);
    await waitFor(() => expect(second.container.querySelector('[data-widget-renderer="relative"]')).toBeTruthy());
    expect(rendererMarkup(second.container, "relative")).toBe(firstMarkup);
  });

  const cases = [
    {
      widget: "standings" as const,
      template: "standings-redline",
      search:
        "?widget=standings&system=vantare-endurance&design=standings-endurance-redline&state=ready&surface=obs",
    },
    {
      widget: "delta" as const,
      template: "delta-redline",
      search:
        "?widget=delta&system=vantare-endurance&design=delta-endurance-redline&state=ready&surface=obs",
    },
    {
      widget: "pedals" as const,
      template: "pedals-redline",
      search:
        "?widget=pedals&system=vantare-endurance&design=pedals-endurance-redline&state=ready&surface=obs",
    },
    {
      widget: "relative" as const,
      template: "relative-redline-mirror",
      search:
        "?widget=relative&system=vantare-endurance&design=relative-endurance-redline-mirror&state=ready&surface=obs",
    },
  ];

  for (const item of cases) {
    it(`produces identical ${item.template} markup in Workshop and runtime`, async () => {
      const parsed = parseOverlayWorkshopQuery(item.search);
      if ("error" in parsed) {
        throw new Error(parsed.error);
      }
      const fromWorkshop = await workshopMarkup(item.search, item.widget);
      const fromRuntime = await runtimeMarkup(parsed);
      expect(fromWorkshop).toBe(fromRuntime);
      expect(fromWorkshop).toContain(`data-template="${item.template}"`);
    });
  }
});
