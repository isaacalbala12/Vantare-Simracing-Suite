import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverlayWorkshopDevRoute, OVERLAY_WORKSHOP_PROFILE_ID } from "./OverlayWorkshopDevRoute";
import { RuntimeWidgetFrame } from "../runtime/RuntimeWidgetFrame";
import { createTelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import {
  buildAuthoringFixtureTelemetry,
  buildAuthoringFixtureWidget,
} from "./fixtures/authoring-fixtures";
import type { AuthoringFixtureScenario } from "./fixtures/authoring-fixtures";
import { buildAuthoringV2Runtime } from "./fixtures/authoring-v2-fixture";
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
 * Both sides are given the same widget and the same snapshot; the renderer
 * markup must come out identical. Anything the Workshop adds or drops around
 * the renderer — a class, an attribute, a wrapper — shows up here as a diff.
 */
function scenario(overrides: Partial<AuthoringFixtureScenario> = {}): AuthoringFixtureScenario {
  return {
    session: "race",
    location: "track",
    state: "ready",
    widget: "standings",
    system: "vantare-endurance",
    surface: "obs",
    ...overrides,
  } as AuthoringFixtureScenario;
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

async function runtimeMarkup(input: AuthoringFixtureScenario): Promise<string> {
  const widget = buildAuthoringFixtureWidget(input);
  const snapshot = buildAuthoringFixtureTelemetry(input);
  const coordinator = createTelemetryRateCoordinator();
  coordinator.publish(snapshot);
  const runtime = buildAuthoringV2Runtime(widget.type, snapshot);
  coordinator.setOverlayFrame(runtime.overlayV2Frame, runtime.overlayV2Source);
  const { container } = render(
    <RuntimeWidgetFrame widget={widget} profileId={OVERLAY_WORKSHOP_PROFILE_ID} telemetry={coordinator} renderMode="obs" />,
  );
  await waitFor(() =>
    expect(container.querySelector(`[data-widget-renderer="${input.widget}"]`)).toBeTruthy(),
  );
  const markup = rendererMarkup(container, input.widget);
  cleanup();
  coordinator.dispose();
  return markup;
}

describe("the Workshop renders what the runtime renders", () => {
  it("consume la autoridad settled de Relative Redline sin estado frontend por perfil", async () => {
    const input = scenario({ widget: "relative", system: "vantare-endurance" });
    const widget = buildAuthoringFixtureWidget(input);
    const snapshot = buildAuthoringFixtureTelemetry(input);
    const runtime = buildAuthoringV2Runtime(widget.type, snapshot);
    expect(runtime.overlayV2Frame).toBeDefined();
    expect(runtime.overlayV2Source).toBeDefined();
    const frame = runtime.overlayV2Frame!;
    const model = relativeV2.buildSettledRelativeViewModelV2(
      {
        ...frame,
        relative: frame.relative.map((row, index) => ({ ...row, id: `raw-${index}` })),
      },
      runtime.overlayV2Source!,
      relativeDefinition.parseContent(widget.content),
    );
    const settledIds = new Set(frame.relativeSettled.map((row) => row.id));
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
      design: "standings-endurance-redline",
      search:
        "?widget=standings&system=vantare-endurance&design=standings-endurance-redline&state=ready&surface=obs",
    },
    {
      widget: "delta" as const,
      design: "delta-endurance-redline",
      search:
        "?widget=delta&system=vantare-endurance&design=delta-endurance-redline&state=ready&surface=obs",
    },
    {
      widget: "pedals" as const,
      design: "pedals-endurance-redline",
      search:
        "?widget=pedals&system=vantare-endurance&design=pedals-endurance-redline&state=ready&surface=obs",
    },
    {
      widget: "relative" as const,
      design: "relative-endurance-redline-mirror",
      search:
        "?widget=relative&system=vantare-endurance&design=relative-endurance-redline-mirror&state=ready&surface=obs",
    },
  ];

  for (const item of cases) {
    it(`produces identical markup to the runtime for ${item.widget}`, async () => {
      const fromWorkshop = await workshopMarkup(item.search, item.widget);
      const fromRuntime = await runtimeMarkup(scenario({ widget: item.widget, designId: item.design as never }));
      expect(fromWorkshop).toBe(fromRuntime);
    });
  }
});
