import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "../../../lib/access-policy";
import { buildMockTelemetry } from "../../../overlay/core/mock-scenarios";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { standingsDefinition } from "../../../overlay/widget-types/standings/standings-definition";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { relativeDefinition } from "../../../overlay/widget-types/relative/relative-definition";
import type { StudioCommand } from "../state/studio-command";
import { WidgetPropertyInspectorView } from "./WidgetPropertyInspectorView";

const suiteAccess: AccessContext = {
  planLabel: "suite",
  planStatus: "active",
  roles: [],
  isBlocked: false,
  isUnconfigured: false,
};

const freeAccess: AccessContext = {
  planLabel: "free",
  planStatus: "active",
  roles: [],
  isBlocked: false,
  isUnconfigured: false,
};

function buildDeltaWidget() {
  const widget = deltaDefinition.createDefault("delta-main");
  widget.layout = { x: 100, y: 100, w: 280, h: 96, zIndex: 0, aspectLocked: true };
  return widget;
}

function buildStandingsWidget() {
  const widget = standingsDefinition.createDefault("standings-main");
  widget.layout = { x: 100, y: 100, w: 280, h: 96, zIndex: 0, aspectLocked: true };
  return widget;
}

function buildRelativeWidget() {
  const widget = relativeDefinition.createDefault("relative-main");
  widget.layout = { x: 100, y: 100, w: 280, h: 96, zIndex: 0, aspectLocked: true };
  return widget;
}

function renderSection(
  sectionId: "appearance" | "content" | "behavior",
  options: {
    widget?: ReturnType<typeof buildDeltaWidget>;
    access?: AccessContext;
    disabled?: boolean;
    session?: "race" | "general";
  } = {},
) {
  const widget = options.widget ?? buildDeltaWidget();
  const dispatch = vi.fn();
  const session = options.session ?? "race";
  const snapshot = buildMockTelemetry({ session, location: "track" });
  render(
    <WidgetPropertyInspectorView
      sectionId={sectionId}
      widget={widget}
      session={session}
      snapshot={snapshot}
      access={options.access ?? suiteAccess}
      disabled={options.disabled ?? false}
      dispatch={dispatch}
    />,
  );
  return { dispatch, widget, snapshot, session };
}

afterEach(() => {
  cleanup();
});

describe("WidgetPropertyInspectorView", () => {
  it("renders appearance controls and dispatches widget/visual", () => {
    const { dispatch } = renderSection("appearance");
    expect(screen.getByTestId("widget-property-inspector")).toBeTruthy();
    expect(screen.getByTestId("studio-inspector-section-appearance")).toBeTruthy();

    const toggle = screen.getByRole("checkbox") as HTMLInputElement;
    fireEvent.click(toggle);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const command = dispatch.mock.calls[0][0] as StudioCommand;
    expect(command.type).toBe("widget/visual");
    expect(command.session).toBe("race");
    expect(command.widgetIds).toEqual(["delta-main"]);
  });

  it("renders content controls and dispatches widget/content for standings", () => {
    const { dispatch } = renderSection("content", { widget: buildStandingsWidget() });
    expect(screen.getByTestId("studio-inspector-section-content")).toBeTruthy();

    const checkbox = screen.getAllByRole("checkbox")[0] as HTMLInputElement;
    fireEvent.click(checkbox);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const command = dispatch.mock.calls[0][0] as StudioCommand;
    expect(command.type).toBe("widget/content");
    expect(command.session).toBe("race");
  });

  it("renders behavior controls and dispatches widget/behavior via the in-pit select", () => {
    const { dispatch } = renderSection("behavior");
    expect(screen.getByTestId("studio-inspector-section-behavior")).toBeTruthy();

    const select = screen.getByTestId("studio-behavior-in-pit") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "in-pit" } });

    expect(dispatch).toHaveBeenCalledTimes(1);
    const command = dispatch.mock.calls[0][0] as StudioCommand;
    expect(command.type).toBe("widget/behavior");
    expect(command.session).toBe("race");
  });

  it("disables controls when disabled prop is set", () => {
    renderSection("behavior", { disabled: true });
    const fieldset = screen.getByTestId("widget-property-inspector").querySelector("fieldset");
    expect(fieldset).not.toBeNull();
    expect(fieldset?.hasAttribute("disabled")).toBe(true);
  });

  it("does not dispatch when access denies the widget feature", () => {
    // relative requiere overlays.advanced; free no lo incluye.
    const { dispatch } = renderSection("content", {
      widget: buildRelativeWidget(),
      access: freeAccess,
    });
    const select = screen.queryByTestId("studio-behavior-in-pit");
    const fieldset = screen.getByTestId("widget-property-inspector").querySelector("fieldset");
    expect(fieldset?.hasAttribute("disabled")).toBe(true);
    expect(select).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("WidgetPropertyInspectorView boundary", () => {
  it("keeps commands using the received session", () => {
    const widget = buildDeltaWidget();
    const dispatch = vi.fn();
    const snapshot = buildMockTelemetry({ session: "general", location: "track" });
    render(
      <WidgetPropertyInspectorView
        sectionId="appearance"
        widget={widget}
        session="general"
        snapshot={snapshot}
        access={suiteAccess}
        dispatch={dispatch}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    const command = dispatch.mock.calls[0][0] as StudioCommand;
    expect(command.session).toBe("general");
  });

  it("uses a full profile document shape for typed inputs", () => {
    const document: ProfileDocumentV3 = {
      schemaVersion: 3,
      id: "profile-1",
      name: "Test",
      displayMode: "edit",
      monitorIndex: 0,
      layouts: {
        general: { type: "general", widgets: [buildDeltaWidget()] },
      },
    };
    expect(document.layouts.general.widgets).toHaveLength(1);
  });
});
