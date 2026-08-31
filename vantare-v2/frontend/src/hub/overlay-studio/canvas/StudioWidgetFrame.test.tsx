import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockTelemetry } from "../../../overlay/core/mock-scenarios";
import { createTelemetryRateCoordinator } from "../../../overlay/core/telemetry-rate-coordinator";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { widgetTypeRegistry } from "../../../overlay/core/widget-registry";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { broadcastTowerDefinition } from "../../../overlay/widget-types/broadcast-tower/broadcast-tower-definition";
import { WidgetVisualHost } from "../../../overlay/core/WidgetVisualHost";
import type { WidgetRuntimeInput } from "../../../overlay/core/widget-definition";
import { StudioProvider } from "../state/studio-store";
import type { StudioProfileClient } from "../state/studio-profile-client";
import { StudioTelemetryProvider } from "./StudioTelemetryProvider";
import { StudioWidgetFrame } from "./StudioWidgetFrame";
import {
  applyStudioFrameLayoutPreview,
  beginStudioFramePreview,
  clearStudioFrameLayoutPreview,
} from "./canvas-frame-preview";
import { standingsDefinition } from "../../../overlay/widget-types/standings/standings-definition";
import type { StandingsContent } from "../../../overlay/widget-types/standings/standings-content";

vi.mock("../../../overlay/core/WidgetVisualHost", () => ({
  WidgetVisualHost: vi.fn(() => <div data-testid="widget-visual-host-mock" />),
}));

const client: StudioProfileClient = {
  load: async () => ({
    document: {
      schemaVersion: 3,
      id: "profile-1",
      name: "Test",
      displayMode: "edit",
      monitorIndex: 0,
      layouts: {
        general: {
          type: "general",
          widgets: [deltaDefinition.createDefault("delta-main")],
        },
      },
    },
    revision: "rev-1",
  }),
  save: async () => ({ status: "saved", document: buildDocument(), revision: "rev-2" }),
};

function buildDocument() {
  return {
    schemaVersion: 3 as const,
    id: "profile-1",
    name: "Test",
    displayMode: "edit" as const,
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general" as const,
        widgets: [deltaDefinition.createDefault("delta-main")],
      },
    },
  };
}

function renderFrame(
  widget: WidgetInstanceV3,
  props: Partial<React.ComponentProps<typeof StudioWidgetFrame>> = {},
  runtime?: WidgetRuntimeInput,
) {
  const coordinator = createTelemetryRateCoordinator();
  coordinator.publish(buildMockTelemetry({ session: "race", location: "track", state: "ready" }));

  return render(
    <StudioProvider client={client} initialFile="profiles/a.json">
      <StudioTelemetryProvider coordinator={coordinator} liveAvailable={false} runtime={runtime}>
        <StudioWidgetFrame
          profileId="profile-test"
          widget={widget}
          layout={widget.layout}
          selected={false}
          onSelect={vi.fn()}
          {...props}
        />
      </StudioTelemetryProvider>
    </StudioProvider>,
  );
}

function buildWidget(overrides: Partial<WidgetInstanceV3> = {}): WidgetInstanceV3 {
  return {
    ...deltaDefinition.createDefault("delta-main"),
    layout: {
      x: 120,
      y: 80,
      w: 280,
      h: 96,
      zIndex: 3,
      aspectLocked: true,
    },
    ...overrides,
  };
}

function buildMaximumRedlineWidget(): WidgetInstanceV3 {
  const widget = standingsDefinition.createDefault("standings-redline-selected");
  const content = standingsDefinition.parseContent(undefined);
  const presets = ["sm", "sm", "lg", "lg", "md", "md", "auto", "lg", "lg", "xs", "sm"] as const;
  return {
    ...widget,
    content: {
      ...content,
      columns: content.columns.map((column, index) => ({
        ...column,
        enabled: true,
        widthPreset: presets[index],
      })),
    } satisfies StandingsContent,
    layout: { ...widget.layout, x: 1640, w: 280, aspectLocked: false },
    visual: {
      ...widget.visual,
      systemId: "vantare-endurance",
      baseSettings: { templateId: "standings-redline" },
    },
  };
}

describe("StudioWidgetFrame", () => {
  afterEach(() => {
    clearStudioFrameLayoutPreview("standings-redline-selected");
    cleanup();
  });

  it("keeps a selected maximum Redline in its persisted physical frame during preview", () => {
    const widget = buildMaximumRedlineWidget();
    beginStudioFramePreview(widget.id, "resize", widget.layout);
    applyStudioFrameLayoutPreview(widget.id, widget.layout);

    renderFrame(widget, {
      selected: true,
      previewActive: true,
      onResizePointerDown: vi.fn(),
    });

    const frame = screen.getByTestId(`studio-widget-frame-${widget.id}`);
    const selection = screen.getByTestId(`studio-widget-selection-${widget.id}`);
    expect(frame.style.left).toBe("1094px");
    expect(frame.style.width).toBe("826px");
    expect(frame.dataset.effectiveMinimumWidth).toBe("826");
    expect(frame.dataset.layoutNormalized).toBe("true");
    expect(selection.parentElement).toBe(frame);
    expect(screen.getByTestId(`studio-resize-handle-e-${widget.id}`)).toBeTruthy();
    expect(screen.getByTestId(`studio-resize-handle-w-${widget.id}`)).toBeTruthy();
  });

  it("keeps a narrow Redline inside the canvas after moving one pixel away from the right edge", () => {
    const widget = buildMaximumRedlineWidget();
    widget.layout = { ...widget.layout, x: 1639 };
    beginStudioFramePreview(widget.id, "move", widget.layout);
    applyStudioFrameLayoutPreview(widget.id, widget.layout);

    renderFrame(widget, {
      selected: true,
      previewActive: true,
      onResizePointerDown: vi.fn(),
    });

    const frame = screen.getByTestId(`studio-widget-frame-${widget.id}`);
    const selection = screen.getByTestId(`studio-widget-selection-${widget.id}`);
    expect(frame.style.left).toBe("1094px");
    expect(frame.style.width).toBe("826px");
    expect(Number.parseFloat(frame.style.left) + Number.parseFloat(frame.style.width)).toBe(1920);
    expect(selection.parentElement).toBe(frame);
    expect(screen.getByTestId(`studio-resize-handle-e-${widget.id}`)).toBeTruthy();
    expect(screen.getByTestId(`studio-resize-handle-w-${widget.id}`)).toBeTruthy();
  });

  it("positions the frame from layout x/y/w/h/zIndex", () => {
    const widget = buildWidget();
    renderFrame(widget);

    const frame = screen.getByTestId("studio-widget-frame-delta-main");
    expect(frame.style.left).toBe("120px");
    expect(frame.style.top).toBe("80px");
    expect(frame.style.width).toBe("280px");
    expect(frame.style.height).toBe("96px");
    expect(frame.style.zIndex).toBe("3");
  });

  it("renders WidgetVisualHost in studio mode inside the visual surface", () => {
    const widget = buildWidget();
    renderFrame(widget);

    expect(WidgetVisualHost).toHaveBeenCalledWith(
      expect.objectContaining({
        widget: expect.objectContaining({ id: widget.id, layout: widget.layout }),
        renderMode: "studio",
      }),
      undefined,
    );
    expect(screen.getByTestId("studio-widget-visual-delta-main")).toBeTruthy();
    expect(screen.getByTestId("widget-visual-host-mock")).toBeTruthy();
  });

  it("passes the pure Overlay V2 runtime through the shared visual host", () => {
    const widget = buildWidget();
    const runtime: WidgetRuntimeInput = {
      overlayV2Features: ["delta"],
      overlayV2Source: { state: "live" },
    };
    renderFrame(widget, {}, runtime);

    expect(WidgetVisualHost).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: expect.objectContaining({
          ...runtime,
          relativeViewModelInstanceKey: "profile-test:delta-main",
        }),
      }),
      undefined,
    );
  });

  it("keeps selection chrome outside the visual host surface", () => {
    const widget = buildWidget();
    renderFrame(widget, { selected: true });

    const visual = screen.getByTestId("studio-widget-visual-delta-main");
    const chrome = screen.getByTestId("studio-widget-frame-chrome-delta-main");
    expect(visual.contains(chrome)).toBe(false);
  });

  it("offers only east and west resize handles for the broadcast tower", () => {
    const widget = broadcastTowerDefinition.createDefault("broadcast-tower-main");
    renderFrame(widget, { selected: true, onResizePointerDown: vi.fn() });

    expect(screen.getByTestId("studio-resize-handle-e-broadcast-tower-main")).toBeTruthy();
    expect(screen.getByTestId("studio-resize-handle-w-broadcast-tower-main")).toBeTruthy();
    for (const handle of ["n", "ne", "se", "s", "sw", "nw"]) {
      expect(screen.queryByTestId(`studio-resize-handle-${handle}-broadcast-tower-main`)).toBeNull();
    }
  });

  it("shows a hidden badge for disabled widgets while keeping the frame selectable", () => {
    const onSelect = vi.fn();
    const widget = buildWidget({ behavior: { enabled: false, updateHz: 30 } });
    renderFrame(widget, { onSelect });

    expect(screen.getByTestId("studio-widget-hidden-badge-delta-main").textContent).toBe("Oculto");
    fireEvent.pointerDown(screen.getByTestId("studio-widget-frame-delta-main"));
    expect(onSelect).toHaveBeenCalledWith("delta-main");
  });

  it("consumes widget updateHz through the shared telemetry coordinator", () => {
    const widget = buildWidget({ behavior: { enabled: true, updateHz: 15 } });
    renderFrame(widget);

    expect(WidgetVisualHost).toHaveBeenCalled();
  });

  it.each(widgetTypeRegistry.list())(
    "scales unlocked $type content from a stable canonical width",
    (definition) => {
      const widget = definition.createDefault(`${definition.type}-main`);
      widget.layout = {
        ...widget.layout,
        w: 500,
        h: 180,
        aspectLocked: false,
      };

      renderFrame(widget);

      const frame = screen.getByTestId(`studio-widget-frame-${definition.type}-main`);
      const viewport = screen.getByTestId(`studio-widget-viewport-${definition.type}-main`);
      const horizontalOnly = definition.capabilities.resizeMode === "horizontal-only";
      const expectedScale = horizontalOnly ? 1 : 500 / definition.capabilities.defaultSize.width;
      expect(frame.style.width).toBe("500px");
      expect(frame.style.height).toBe("180px");
      expect(screen.getByTestId(`studio-widget-visual-${definition.type}-main`)).toBeTruthy();
      expect(viewport.style.width).toBe(`${horizontalOnly ? 500 : definition.capabilities.defaultSize.width}px`);
      expect(Number.parseFloat(viewport.style.height)).toBeCloseTo(180 / expectedScale, 5);
      expect(viewport.style.transform).toBe(`scale(${expectedScale})`);
    },
  );

  it.each(widgetTypeRegistry.list())(
    "scales locked $type content without changing the document frame",
    (definition) => {
      const widget = definition.createDefault(`${definition.type}-locked`);
      widget.layout = {
        ...widget.layout,
        w: 500,
        h: 180,
        aspectLocked: true,
      };

      renderFrame(widget);

      const frame = screen.getByTestId(`studio-widget-frame-${definition.type}-locked`);
      const viewport = screen.getByTestId(`studio-widget-viewport-${definition.type}-locked`);
      const horizontalOnly = definition.capabilities.resizeMode === "horizontal-only";
      const expectedScale = horizontalOnly ? 1 : 500 / definition.capabilities.defaultSize.width;
      expect(frame.style.width).toBe("500px");
      expect(frame.style.height).toBe("180px");
      expect(screen.getByTestId(`studio-widget-visual-${definition.type}-locked`)).toBeTruthy();
      expect(viewport.style.width).toBe(`${horizontalOnly ? 500 : definition.capabilities.defaultSize.width}px`);
      expect(Number.parseFloat(viewport.style.height)).toBeCloseTo(180 / expectedScale, 5);
      expect(viewport.style.transform).toBe(`scale(${expectedScale})`);
    },
  );
});
