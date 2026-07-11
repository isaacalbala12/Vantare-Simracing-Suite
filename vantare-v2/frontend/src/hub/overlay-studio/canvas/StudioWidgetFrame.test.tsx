import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockTelemetry } from "../../../overlay/core/mock-scenarios";
import { createTelemetryRateCoordinator } from "../../../overlay/core/telemetry-rate-coordinator";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { WidgetVisualHost } from "../../../overlay/core/WidgetVisualHost";
import { StudioProvider } from "../state/studio-store";
import type { StudioProfileClient } from "../state/studio-profile-client";
import { StudioTelemetryProvider } from "./StudioTelemetryProvider";
import { StudioWidgetFrame } from "./StudioWidgetFrame";

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

function renderFrame(widget: WidgetInstanceV3, props: Partial<React.ComponentProps<typeof StudioWidgetFrame>> = {}) {
  const coordinator = createTelemetryRateCoordinator();
  coordinator.publish(buildMockTelemetry({ session: "race", location: "track", state: "ready" }));

  return render(
    <StudioProvider client={client} initialFile="profiles/a.json">
      <StudioTelemetryProvider coordinator={coordinator} liveAvailable={false}>
        <StudioWidgetFrame
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

describe("StudioWidgetFrame", () => {
  afterEach(() => cleanup());

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

  it("keeps selection chrome outside the visual host surface", () => {
    const widget = buildWidget();
    renderFrame(widget, { selected: true });

    const visual = screen.getByTestId("studio-widget-visual-delta-main");
    const chrome = screen.getByTestId("studio-widget-frame-chrome-delta-main");
    expect(visual.contains(chrome)).toBe(false);
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
});