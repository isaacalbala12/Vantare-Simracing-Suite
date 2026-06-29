import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WidgetEditFrame } from "./WidgetEditFrame";
import type { WidgetConfig } from "../lib/profile";

vi.mock("./shared-widget-map", () => ({
  WIDGET_COMPONENTS: {
    delta: () => <div data-testid="delta-mock">Delta</div>,
    relative: () => <div data-testid="relative-mock">Relative</div>,
    standings: () => <div data-testid="standings-mock">Standings</div>,
    pedals: () => <div data-testid="pedals-mock">Pedals</div>,
  },
}));

vi.mock("./widgets/widget-base-size", () => ({
  getWidgetBaseSize: (type: string) => {
    if (type === "relative") return { width: 258, height: 240 };
    if (type === "standings") return { width: 400, height: 300 };
    return null;
  },
  normalizeWidgetVisualRect: (position: { x: number; y: number; w: number; h: number }, baseSize: { width: number; height: number } | null, round = true) => {
    if (!baseSize || baseSize.width <= 0 || baseSize.height <= 0) return position;
    const rawH = Math.max(40, position.w * baseSize.height / baseSize.width);
    const h = round ? Math.round(rawH) : rawH;
    return { x: position.x, y: position.y, w: position.w, h };
  },
}));

function makeWidget(overrides?: Partial<WidgetConfig>): WidgetConfig {
  return {
    id: "w1",
    type: "delta",
    enabled: true,
    updateHz: 30,
    position: { x: 10, y: 10, w: 100, h: 50 },
    props: {},
    ...overrides,
  };
}

describe("WidgetEditFrame", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the widget", () => {
    render(<WidgetEditFrame widget={makeWidget()} onChange={vi.fn()} />);
    expect(screen.getByTestId("edit-frame-w1")).toBeTruthy();
  });

  it("calls onChange after resize with ratio-lock for delta (4:1)", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const onChange = vi.fn();
    render(<WidgetEditFrame widget={makeWidget()} onChange={onChange} />);
    const handle = screen.getByTestId("resize-handle-w1");
    fireEvent.mouseDown(handle, { clientX: 110, clientY: 60 });
    fireEvent.mouseMove(window, { clientX: 130, clientY: 80 });
    const frame = screen.getByTestId("edit-frame-w1");
    // delta ratio=4: h=70 → w=280
    expect(frame.style.width).toBe("280px");
    expect(frame.style.height).toBe("70px");
    fireEvent.mouseUp(window);
    expect(onChange).toHaveBeenCalled();
    const rect = onChange.mock.calls[0][1];
    expect(rect.w).toBe(280);
    expect(rect.h).toBe(70);
    vi.restoreAllMocks();
  });

  it("moves the frame by writing DOM position during drag", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const onChange = vi.fn();
    render(<WidgetEditFrame widget={makeWidget()} onChange={onChange} />);
    const frame = screen.getByTestId("edit-frame-w1");

    fireEvent.mouseDown(frame, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 35, clientY: 45 });

    expect(frame.style.left).toBe("35px");
    expect(frame.style.top).toBe("45px");

    fireEvent.mouseUp(window);
    expect(onChange).toHaveBeenCalledWith("w1", expect.objectContaining({ x: 35, y: 45 }));
    vi.restoreAllMocks();
  });

  it("resize de delta preserva ratio fijo 4:1 (sin baseSize pero con WIDGET_RATIOS)", () => {
    const onChange = vi.fn();
    render(<WidgetEditFrame widget={makeWidget({ type: "delta" })} onChange={onChange} />);
    const handle = screen.getByTestId("resize-handle-w1");
    fireEvent.mouseDown(handle, { clientX: 110, clientY: 60 });
    fireEvent.mouseMove(window, { clientX: 160, clientY: 110 });
    fireEvent.mouseUp(window);
    const rect = onChange.mock.calls[0][1];
    // delta ratio=4: h=50+50=100 → w=100*4=400
    expect(rect.w).toBe(400);
    expect(rect.h).toBe(100);
    expect(rect.w / rect.h).toBe(4);
  });

  it("resize de relative preserva aspect ratio via baseSize", () => {
    const onChange = vi.fn();
    render(
      <WidgetEditFrame
        widget={makeWidget({ type: "relative", position: { x: 10, y: 10, w: 258, h: 240 } })}
        onChange={onChange}
      />,
    );
    const handle = screen.getByTestId("resize-handle-w1");
    fireEvent.mouseDown(handle, { clientX: 268, clientY: 250 });
    fireEvent.mouseMove(window, { clientX: 368, clientY: 350 });
    fireEvent.mouseUp(window);
    const rect = onChange.mock.calls[0][1];
    // baseAspect = 258/240 ≈ 1.075, dominant = 100 (X), sign = +1
    // newH = 240 + 100 = 340, newW = 340 * 1.075 = 365.5 ≈ 366
    expect(rect.w).toBe(366);
    expect(rect.h).toBe(340);
    expect(rect.w / rect.h).toBeCloseTo(258 / 240, 1);
  });

  it("resize de standings preserva aspect ratio via baseSize", () => {
    const onChange = vi.fn();
    render(
      <WidgetEditFrame
        widget={makeWidget({ type: "standings", position: { x: 10, y: 10, w: 400, h: 300 } })}
        onChange={onChange}
      />,
    );
    const handle = screen.getByTestId("resize-handle-w1");
    fireEvent.mouseDown(handle, { clientX: 410, clientY: 310 });
    fireEvent.mouseMove(window, { clientX: 610, clientY: 410 });
    fireEvent.mouseUp(window);
    const rect = onChange.mock.calls[0][1];
    // baseAspect = 400/300 ≈ 1.333, dominant = 200 (X), sign = +1
    // newH = 300 + 200 = 500, newW = 500 * 1.333 = 667
    expect(rect.w).toBe(667);
    expect(rect.h).toBe(500);
    expect(rect.w / rect.h).toBeCloseTo(400 / 300, 1);
  });
});
