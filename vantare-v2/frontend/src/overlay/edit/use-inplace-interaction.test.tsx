import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProfileDocumentV3, WidgetInstanceV3, WidgetLayoutV3 } from "../core/profile-document";
import { deltaDefinition } from "../widget-types/delta/delta-definition";
import { relativeDefinition } from "../widget-types/relative/relative-definition";
import { clearInplaceFrameLayoutPreview } from "./inplace-frame-preview";
import { useInplaceInteraction } from "./use-inplace-interaction";

const VIEWPORT = { width: 1920, height: 1080 };

function buildDelta(): WidgetInstanceV3 {
  const delta = deltaDefinition.createDefault("delta-main");
  delta.layout = { x: 100, y: 100, w: 280, h: 96, zIndex: 0, aspectLocked: true };
  return delta;
}

function buildRelative(): WidgetInstanceV3 {
  const relative = relativeDefinition.createDefault("relative-main");
  relative.layout = { x: 400, y: 200, w: 280, h: 96, zIndex: 0, aspectLocked: true };
  return relative;
}

function buildDocument(): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [buildDelta(), buildRelative()],
      },
    },
  };
}

type HarnessProps = {
  widgets: readonly WidgetInstanceV3[];
  scale?: number;
  onCommit?: (widgetId: string, layout: WidgetLayoutV3) => void;
  onSelect?: (widgetId: string) => void;
};

function Harness({ widgets, scale = 1, onCommit, onSelect }: HarnessProps): React.ReactElement {
  const sceneRef = useRef<HTMLDivElement>(null);
  const interaction = useInplaceInteraction({
    widgets,
    session: "general",
    scale,
    layoutViewport: VIEWPORT,
    sceneRef,
    selectedWidgetId: null,
    onCommit: onCommit ?? (() => undefined),
    onSelect: onSelect ?? (() => undefined),
  });
  return (
    <div>
      <div ref={sceneRef} data-testid="inplace-edit-scene">
        {interaction.guides.map((guide, index) => (
          <div
            key={index}
            data-testid={`inplace-guide-${guide.orientation}`}
            data-guide-kind={guide.kind}
            data-guide-position={guide.position}
            style={{
              position: "absolute",
              ...(guide.orientation === "vertical"
                ? { left: guide.position, top: 0, bottom: 0, width: 1 }
                : { top: guide.position, left: 0, right: 0, height: 1 }),
            }}
          />
        ))}
        {widgets.map((widget) => {
          const previewActive = interaction.isWidgetPreviewActive(widget.id);
          const geometry = interaction.resolveLayout(widget);
          return (
            <div
              key={widget.id}
              data-testid={`inplace-edit-frame-${widget.id}`}
              style={{ left: geometry.x, top: geometry.y, width: geometry.w, height: geometry.h, position: "absolute" }}
              onPointerDown={(event) => interaction.onFramePointerDown(widget.id, event)}
              onLostPointerCapture={(event) => interaction.onLostPointerCapture(event.nativeEvent)}
            >
              {widget.id === "delta-main" ? (
                <button
                  data-testid={`inplace-resize-handle-se-${widget.id}`}
                  onPointerDown={(event) => interaction.onResizePointerDown(widget.id, "se", event)}
                  onLostPointerCapture={(event) => interaction.onLostPointerCapture(event.nativeEvent)}
                />
              ) : null}
              {previewActive ? <div data-testid={`inplace-preview-active-${widget.id}`} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function mockSceneRect(): void {
  const scene = () => screen.getByTestId("inplace-edit-scene");
  scene().getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: VIEWPORT.width,
    bottom: VIEWPORT.height,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    toJSON: () => ({}),
  });
}

function renderHarness(props: Omit<HarnessProps, "widgets"> & { widgets?: readonly WidgetInstanceV3[] } = {}): void {
  render(<Harness widgets={props.widgets ?? buildDocument().layouts.general.widgets} scale={props.scale} onCommit={props.onCommit} onSelect={props.onSelect} />);
  mockSceneRect();
}

function pointerDownFrame(pointerId = 1): void {
  const frame = screen.getByTestId("inplace-edit-frame-delta-main");
  fireEvent.pointerDown(frame, { pointerId, button: 0, clientX: 100, clientY: 100, bubbles: true });
}

function pointerDownResizeHandle(pointerId = 1): void {
  const handle = screen.getByTestId("inplace-resize-handle-se-delta-main");
  fireEvent.pointerDown(handle, { pointerId, button: 0, clientX: 380, clientY: 196, bubbles: true });
}

function pointerMove(
  clientX: number,
  clientY: number,
  pointerId = 1,
  options: { altKey?: boolean } = {},
): void {
  fireEvent.pointerMove(window, {
    pointerId,
    clientX,
    clientY,
    altKey: options.altKey ?? false,
    bubbles: true,
  });
}

function pointerUp(pointerId = 1): void {
  fireEvent.pointerUp(window, { pointerId, bubbles: true });
}

function readFrameVisualLeft(frame: HTMLElement): number {
  const base = Number.parseFloat(frame.style.left || "0");
  const transform = frame.style.transform;
  const match = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  if (!match) {
    return base;
  }
  return base + Number.parseFloat(match[1]);
}

afterEach(() => {
  cleanup();
  clearInplaceFrameLayoutPreview("delta-main");
});

describe("useInplaceInteraction", () => {
  it("moves the frame imperatively during pointermove without committing", () => {
    const commits: Array<{ widgetId: string; layout: WidgetLayoutV3 }> = [];
    renderHarness({ onCommit: (widgetId, layout) => commits.push({ widgetId, layout }) });

    pointerDownFrame();
    pointerMove(140, 130);

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
    expect(readFrameVisualLeft(frame)).toBe(144);
    expect(commits).toEqual([]);
  });

  it("commits a single layout change on pointerup", () => {
    const commits: Array<{ widgetId: string; layout: WidgetLayoutV3 }> = [];
    renderHarness({ onCommit: (widgetId, layout) => commits.push({ widgetId, layout }) });

    pointerDownFrame();
    pointerMove(140, 130);
    pointerUp();

    expect(commits).toHaveLength(1);
    expect(commits[0].widgetId).toBe("delta-main");
    expect(commits[0].layout.x).toBe(144);
    expect(commits[0].layout.y).toBe(128);
    expect(commits[0].layout.w).toBe(280);
    expect(commits[0].layout.h).toBe(96);
  });

  it("restores the original geometry on Escape", () => {
    const commits: Array<{ widgetId: string; layout: WidgetLayoutV3 }> = [];
    renderHarness({ onCommit: (widgetId, layout) => commits.push({ widgetId, layout }) });

    pointerDownFrame();
    pointerMove(140, 130);
    fireEvent.keyDown(window, { key: "Escape" });
    pointerUp();

    const frame = screen.getByTestId("inplace-edit-frame-delta-main") as HTMLElement;
    expect(readFrameVisualLeft(frame)).toBe(100);
    expect(frame.style.top).toBe("100px");
    expect(commits).toEqual([]);
  });

  it("reports a center guide when the widget snaps to the viewport center", () => {
    renderHarness();

    pointerDownFrame();
    // Delta hasta el centro del viewport: target = (1920-280)/2 = 820.
    pointerMove(820, 100);

    const verticalCenter = screen.queryByTestId("inplace-guide-vertical");
    expect(verticalCenter).toBeTruthy();
    expect(verticalCenter?.getAttribute("data-guide-kind")).toBe("center");
    expect(verticalCenter?.getAttribute("data-guide-position")).toBe("960");
  });

  it("reports edge guides when the widget snaps to a sibling edge", () => {
    renderHarness();

    // El hermano relative empieza en x=400; mover delta-main hasta x=400.
    pointerDownFrame();
    pointerMove(400, 100);

    const verticalEdge = screen.queryByTestId("inplace-guide-vertical");
    expect(verticalEdge).toBeTruthy();
    expect(verticalEdge?.getAttribute("data-guide-kind")).toBe("edge");
    expect(verticalEdge?.getAttribute("data-guide-position")).toBe("400");
  });

  it("clears guides when the interaction ends without a commit", () => {
    renderHarness();

    pointerDownFrame();
    pointerMove(820, 100);
    expect(screen.queryByTestId("inplace-guide-vertical")).toBeTruthy();

    pointerUp();
    expect(screen.queryByTestId("inplace-guide-vertical")).toBeNull();
  });

  it("cancels and restores on lostpointercapture", () => {
    const commits: Array<{ widgetId: string; layout: WidgetLayoutV3 }> = [];
    renderHarness({ onCommit: (widgetId, layout) => commits.push({ widgetId, layout }) });

    pointerDownFrame();
    pointerMove(140, 130);
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 140, clientY: 130, bubbles: true });
    fireEvent.lostPointerCapture(window, { pointerId: 1, bubbles: true });

    expect(commits).toEqual([]);
  });

  it("disables snapping while Alt is held", () => {
    const commits: Array<{ widgetId: string; layout: WidgetLayoutV3 }> = [];
    renderHarness({ onCommit: (widgetId, layout) => commits.push({ widgetId, layout }) });

    pointerDownFrame();
    pointerMove(105, 102, 1, { altKey: true });
    pointerUp();

    expect(commits[0].layout.x).toBe(105);
    expect(commits[0].layout.y).toBe(102);
  });

  it("clamps the widget inside the layout viewport", () => {
    const commits: Array<{ widgetId: string; layout: WidgetLayoutV3 }> = [];
    renderHarness({ onCommit: (widgetId, layout) => commits.push({ widgetId, layout }) });

    pointerDownFrame();
    pointerMove(4000, 4000);
    pointerUp();

    const layout = commits[0].layout;
    expect(layout.x).toBeLessThanOrEqual(VIEWPORT.width - 32);
    expect(layout.x + layout.w).toBeGreaterThanOrEqual(32);
    expect(layout.y).toBeLessThanOrEqual(VIEWPORT.height - 32);
    expect(layout.y + layout.h).toBeGreaterThanOrEqual(32);
  });

  it("does not open a gesture on right click", () => {
    const commits: Array<{ widgetId: string; layout: WidgetLayoutV3 }> = [];
    renderHarness({ onCommit: (widgetId, layout) => commits.push({ widgetId, layout }) });

    fireEvent.pointerDown(screen.getByTestId("inplace-edit-frame-delta-main"), { pointerId: 1, button: 2, clientX: 100, clientY: 100, bubbles: true });
    pointerMove(140, 130);
    pointerUp();

    expect(commits).toEqual([]);
  });

  it("marks the frame as preview-active during the gesture only", () => {
    renderHarness();
    expect(screen.queryByTestId("inplace-preview-active-delta-main")).toBeNull();

    pointerDownFrame();
    expect(screen.getByTestId("inplace-preview-active-delta-main")).toBeTruthy();

    pointerUp();
    expect(screen.queryByTestId("inplace-preview-active-delta-main")).toBeNull();
  });

  it("resizes with the se handle and respects aspect lock", () => {
    const commits: Array<{ widgetId: string; layout: WidgetLayoutV3 }> = [];
    renderHarness({ onCommit: (widgetId, layout) => commits.push({ widgetId, layout }) });

    pointerDownResizeHandle();
    pointerMove(660, 476, 1, { altKey: true });
    pointerUp();

    expect(commits).toHaveLength(1);
    expect(commits[0].layout.x).toBe(100);
    expect(commits[0].layout.y).toBe(100);
    expect(commits[0].layout.w).toBe(560);
    expect(commits[0].layout.h).toBe(192);
  });

  it("only shows e/w handles for horizontal-only widgets", () => {
    renderHarness({ widgets: [buildRelative()] });
    const frame = screen.getByTestId("inplace-edit-frame-relative-main") as HTMLElement;
    expect(frame.style.left).toBe("400px");
    expect(frame.style.top).toBe("200px");
  });
});
