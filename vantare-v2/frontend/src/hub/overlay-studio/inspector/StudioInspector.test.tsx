import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { ConnectedStudioTelemetryProvider } from "../canvas/StudioTelemetryProvider";
import { StudioProvider, useStudioDocument } from "../state/studio-store";
import type { StudioProfileClient } from "../state/studio-profile-client";
import { StudioInspector } from "./StudioInspector";

function buildDocument(widgets: WidgetInstanceV3[]): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test Profile",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets,
      },
    },
  };
}

function createMockClient(document: ProfileDocumentV3): StudioProfileClient {
  return {
    load: vi.fn(async () => ({ document: structuredClone(document), revision: "rev-1" })),
    save: vi.fn(async () => ({ status: "saved", document: structuredClone(document), revision: "rev-2" })),
  };
}

function SelectWidgetButtons() {
  const { selectWidget } = useStudioDocument();
  return (
    <>
      <button type="button" data-testid="select-delta-main" onClick={() => selectWidget("delta-main")}>
        Delta main
      </button>
      <button type="button" data-testid="select-delta-copy" onClick={() => selectWidget("delta-copy")}>
        Delta copy
      </button>
      <button type="button" data-testid="select-legacy" onClick={() => selectWidget("legacy-standings")}>
        Legacy
      </button>
    </>
  );
}

function MakeDirtyButton() {
  const { dispatch, activeSession } = useStudioDocument();
  return (
    <button
      type="button"
      data-testid="make-dirty"
      onClick={() =>
        dispatch({
          type: "widget/layout",
          session: activeSession,
          widgetIds: ["delta-main"],
          patch: { x: 180 },
        })
      }
    >
      Editar
    </button>
  );
}

function DirtyAppearanceButton() {
  const { dispatch, activeSession, activeLayout } = useStudioDocument();
  const widget = activeLayout?.widgets.find((entry) => entry.id === "delta-main");
  return (
    <button
      type="button"
      data-testid="dirty-appearance"
      disabled={!widget}
      onClick={() => {
        if (!widget) {
          return;
        }
        dispatch({
          type: "widget/visual",
          session: activeSession,
          widgetIds: ["delta-main"],
          visual: {
            ...widget.visual,
            appearanceOverrides: { current: true },
          },
        });
      }}
    >
      Cambiar apariencia
    </button>
  );
}

function AppearanceProbe() {
  const { activeLayout } = useStudioDocument();
  const widget = activeLayout?.widgets.find((entry) => entry.id === "delta-main");
  return (
    <div
      data-testid="appearance-probe"
      data-overrides={JSON.stringify(widget?.visual.appearanceOverrides ?? {})}
    />
  );
}

function AutoSelectWidget(props: { widgetId: string }) {
  const { selectWidget, activeLayout } = useStudioDocument();
  useEffect(() => {
    const exists = activeLayout?.widgets.some((widget) => widget.id === props.widgetId);
    if (exists) {
      selectWidget(props.widgetId);
    }
  }, [activeLayout, props.widgetId, selectWidget]);
  return null;
}

function renderInspector(document: ProfileDocumentV3, widgetId = "delta-main") {
  return render(
    <StudioProvider client={createMockClient(document)} initialFile="profiles/a.json">
      <ConnectedStudioTelemetryProvider>
        <AutoSelectWidget widgetId={widgetId} />
        <SelectWidgetButtons />
        <StudioInspector />
      </ConnectedStudioTelemetryProvider>
    </StudioProvider>,
  );
}

describe("StudioInspector", () => {
  afterEach(() => cleanup());

  it("mounts only the active section panel", async () => {
    const document = buildDocument([deltaDefinition.createDefault("delta-main")]);
    renderInspector(document);

    await waitFor(() => expect(screen.getByTestId("studio-inspector")).toBeTruthy());
    expect(screen.getByTestId("studio-inspector-section-design")).toBeTruthy();
    expect(screen.queryByTestId("studio-inspector-section-appearance")).toBeNull();

    fireEvent.click(screen.getByTestId("studio-inspector-rail-item-appearance"));
    await waitFor(() => expect(screen.getByTestId("studio-inspector-section-appearance")).toBeTruthy());
    expect(screen.queryByTestId("studio-inspector-section-design")).toBeNull();
  });

  it("resets the active section to the first available section when the widget changes", async () => {
    const deltaMain = deltaDefinition.createDefault("delta-main");
    const deltaCopy = deltaDefinition.createDefault("delta-copy");
    renderInspector(buildDocument([deltaMain, deltaCopy]));

    await waitFor(() => expect(screen.getByTestId("studio-inspector")).toBeTruthy());
    fireEvent.click(screen.getByTestId("studio-inspector-rail-item-behavior"));
    expect(screen.getByTestId("studio-inspector-section-behavior")).toBeTruthy();

    fireEvent.click(screen.getByTestId("select-delta-copy"));
    await waitFor(() =>
      expect(screen.getByTestId("studio-inspector-rail-item-design").getAttribute("aria-current")).toBe("true"),
    );
    expect(screen.getByTestId("studio-inspector-section-design")).toBeTruthy();
    expect(screen.queryByTestId("studio-inspector-section-behavior")).toBeNull();
  });

  it("removes unavailable sections immediately when capability disappears", async () => {
    const deltaMain = deltaDefinition.createDefault("delta-main");
    const legacyWidget: WidgetInstanceV3 = {
      ...deltaDefinition.createDefault("legacy-standings"),
      id: "legacy-standings",
      type: "standings",
    };
    renderInspector(buildDocument([deltaMain, legacyWidget]));

    await waitFor(() => expect(screen.getByTestId("studio-inspector")).toBeTruthy());
    fireEvent.click(screen.getByTestId("studio-inspector-rail-item-appearance"));
    expect(screen.getByTestId("studio-inspector-section-appearance")).toBeTruthy();

    fireEvent.click(screen.getByTestId("select-legacy"));
    await waitFor(() => expect(screen.queryByTestId("studio-inspector-rail-item-appearance")).toBeNull());
    expect(screen.getByTestId("studio-inspector-rail-item-design")).toBeTruthy();
    expect(screen.getByTestId("studio-inspector-section-design")).toBeTruthy();
  });

  it("toggles enabled state through the rail visibility control", async () => {
    const document = buildDocument([deltaDefinition.createDefault("delta-main")]);
    renderInspector(document);

    await waitFor(() => expect(screen.getByTestId("studio-inspector-visibility-toggle")).toBeTruthy());
    expect(screen.getByTestId("studio-inspector-visibility-toggle").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("studio-inspector-visibility-toggle"));
    await waitFor(() =>
      expect(screen.getByTestId("studio-inspector-visibility-toggle").getAttribute("aria-pressed")).toBe("false"),
    );
    expect(screen.getByText("Oculto")).toBeTruthy();
  });

  it("reports global dirty state in the footer without a local section save action", async () => {
    const document = buildDocument([deltaDefinition.createDefault("delta-main")]);
    render(
      <StudioProvider client={createMockClient(document)} initialFile="profiles/a.json">
        <ConnectedStudioTelemetryProvider>
          <AutoSelectWidget widgetId="delta-main" />
          <MakeDirtyButton />
          <StudioInspector />
        </ConnectedStudioTelemetryProvider>
      </StudioProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("studio-inspector-footer").getAttribute("data-dirty")).toBe("false"),
    );
    expect(screen.queryByRole("button", { name: /guardar sección/i })).toBeNull();

    fireEvent.click(screen.getByTestId("make-dirty"));
    await waitFor(() =>
      expect(screen.getByTestId("studio-inspector-footer").getAttribute("data-dirty")).toBe("true"),
    );
  });

  it("dispatches widget/reset-section with the saved snapshot", async () => {
    const savedWidget = deltaDefinition.createDefault("delta-main");
    savedWidget.visual.appearanceOverrides = { saved: true };
    const document = buildDocument([savedWidget]);

    render(
      <StudioProvider client={createMockClient(document)} initialFile="profiles/a.json">
        <ConnectedStudioTelemetryProvider>
          <AutoSelectWidget widgetId="delta-main" />
          <DirtyAppearanceButton />
          <AppearanceProbe />
          <StudioInspector />
        </ConnectedStudioTelemetryProvider>
      </StudioProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("studio-inspector")).toBeTruthy());
    fireEvent.click(screen.getByTestId("dirty-appearance"));
    await waitFor(() =>
      expect(screen.getByTestId("appearance-probe").getAttribute("data-overrides")).toBe('{"current":true}'),
    );

    fireEvent.click(screen.getByTestId("studio-inspector-rail-item-appearance"));
    fireEvent.click(screen.getByTestId("studio-inspector-section-reset"));

    await waitFor(() =>
      expect(screen.getByTestId("appearance-probe").getAttribute("data-overrides")).toBe('{"saved":true}'),
    );
  });
});