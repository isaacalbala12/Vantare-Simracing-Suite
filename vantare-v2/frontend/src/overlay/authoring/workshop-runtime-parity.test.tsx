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
  it("delimita Relative por perfil sin reiniciar el estado al recrear el widget", async () => {
    const spy = vi.spyOn(relativeV2, "buildRelativeViewModelV2");
    const search = "?widget=relative&system=vantare-endurance&state=ready&surface=obs";
    const view = render(<OverlayWorkshopDevRoute search={search} profileId="profile-a" />);

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const firstOptions = spy.mock.calls.at(-1)?.[3];
    const firstScope = firstOptions?.state?.scopeKey;
    expect(firstOptions?.instanceKey).toBe("profile-a:relative-harness");
    expect(firstScope).toContain("profile-a:relative-harness");

    const callsBeforeSpread = spy.mock.calls.length;
    view.rerender(<OverlayWorkshopDevRoute search={search} profileId="profile-a" />);
    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(callsBeforeSpread));
    const spreadOptions = spy.mock.calls.at(-1)?.[3];
    expect(spreadOptions?.state).toBe(firstOptions?.state);
    expect(spreadOptions?.instanceKey).toBe("profile-a:relative-harness");
    expect(spreadOptions?.state?.scopeKey).toBe(firstScope);

    view.rerender(<OverlayWorkshopDevRoute search={search} profileId="profile-b" />);
    await waitFor(() => expect(spy.mock.calls.at(-1)?.[3]?.instanceKey).toBe("profile-b:relative-harness"));
    const changedProfileOptions = spy.mock.calls.at(-1)?.[3];
    expect(changedProfileOptions?.state).toBe(firstOptions?.state);
    expect(changedProfileOptions?.state?.scopeKey).toContain("profile-b:relative-harness");
    expect(changedProfileOptions?.state?.scopeKey).not.toBe(firstScope);
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
