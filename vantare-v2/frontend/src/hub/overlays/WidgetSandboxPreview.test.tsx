import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { createDefaultRelativeColumns } from "../../overlay/widgets/relative-catalog";
import { getRelativeIntrinsicWidth } from "../../overlay/widgets/relative-format";
import { WidgetSandboxPreview } from "./WidgetSandboxPreview";

function profileWith(widget: WidgetConfig): ProfileConfig {
  return {
    id: "profile-test",
    name: "Test",
    displayMode: "racing",
    monitorIndex: 0,
    widgets: [widget],
    variants: [],
  };
}

afterEach(() => {
  cleanup();
});

describe("WidgetSandboxPreview", () => {
  it("renders an empty state without an active widget", () => {
    render(
      <WidgetSandboxPreview
        profile={{ id: "p", name: "P", displayMode: "racing", monitorIndex: 0, widgets: [], variants: [] }}
        activeWidget={null}
      />,
    );

    expect(screen.getByTestId("widget-sandbox-preview-empty")).toBeTruthy();
  });

  it("renders the active widget without PreviewWidgetFrame", () => {
    const widget: WidgetConfig = {
      id: "relative",
      type: "relative",
      enabled: true,
      updateHz: 15,
      position: { x: 400, y: 500, w: 600, h: 420 },
      props: {},
    };

    render(<WidgetSandboxPreview profile={profileWith(widget)} activeWidget={widget} />);

    expect(screen.getByTestId("widget-sandbox-preview")).toBeTruthy();
    expect(screen.getByTestId("widget-sandbox-renderer")).toBeTruthy();
    expect(screen.queryByTestId("preview-widget-frame-relative")).toBeNull();
  });

  it("uses intrinsic relative width without mutating position", () => {
    const columns = createDefaultRelativeColumns().map((column) =>
      column.id === "bestLap" || column.id === "lastLap" ? { ...column, enabled: true } : column,
    );
    const widget: WidgetConfig = {
      id: "relative",
      type: "relative",
      enabled: true,
      updateHz: 15,
      variantId: "variant-relative",
      position: { x: 400, y: 500, w: 220, h: 420 },
      props: {},
    };
    const profile: ProfileConfig = {
      ...profileWith(widget),
      variants: [{ id: "variant-relative", widgetType: "relative", columns }],
    };

    render(<WidgetSandboxPreview profile={profile} activeWidget={widget} />);

    const inner = screen.getByTestId("widget-sandbox-scaler-inner");
    expect(parseInt(inner.style.width, 10)).toBeGreaterThan(220);
    expect(widget.position).toEqual({ x: 400, y: 500, w: 220, h: 420 });
  });

  it("lets compact relative preview shrink to real widget width and height", async () => {
    const intrinsicWidth = getRelativeIntrinsicWidth(createDefaultRelativeColumns());
    const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    const originalScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth");
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return this.getAttribute("data-testid") === "widget-sandbox-content" ? 188 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        return this.getAttribute("data-testid") === "widget-sandbox-content" ? intrinsicWidth : 0;
      },
    });
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.getAttribute("data-testid") === "widget-sandbox-content") {
        return {
          x: 0,
          y: 0,
          width: intrinsicWidth,
          height: 188,
          top: 0,
          right: intrinsicWidth,
          bottom: 188,
          left: 0,
          toJSON: () => ({}),
        };
      }
      return originalGetBoundingClientRect.call(this);
    };

    try {
      const widget: WidgetConfig = {
        id: "relative",
        type: "relative",
        enabled: true,
        updateHz: 15,
        variantId: "variant-relative",
        position: { x: 400, y: 500, w: 900, h: 420 },
        props: {},
      };
      const profile: ProfileConfig = {
        ...profileWith(widget),
        variants: [
          {
            id: "variant-relative",
            widgetType: "relative",
            columns: createDefaultRelativeColumns(),
            filters: { rowHeightMode: "compact" },
          },
        ],
      };

      render(<WidgetSandboxPreview profile={profile} activeWidget={widget} />);

      await waitFor(() => {
        expect(screen.getByTestId("widget-sandbox-scaler-inner").style.height).toBe("188px");
      });
      expect(screen.getByTestId("widget-sandbox-scaler-inner").style.width).toBe(`${intrinsicWidth}px`);
      expect(screen.getByTestId("widget-sandbox-content").style.width).toBe("fit-content");
      expect(screen.getByTestId("widget-sandbox-renderer").className).not.toContain("h-full");
      expect(screen.getByTestId("widget-sandbox-renderer").className).not.toContain("w-full");
      expect(widget.position).toEqual({ x: 400, y: 500, w: 900, h: 420 });
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
      }
      if (originalScrollWidth) {
        Object.defineProperty(HTMLElement.prototype, "scrollWidth", originalScrollWidth);
      }
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });

  it("does not keep a wide logical box for compact relative when position.w is larger than content", async () => {
    const intrinsicWidth = getRelativeIntrinsicWidth(createDefaultRelativeColumns());
    const originalScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth");
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        return this.getAttribute("data-testid") === "widget-sandbox-content" ? intrinsicWidth : 0;
      },
    });
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.getAttribute("data-testid") === "widget-sandbox-content") {
        return {
          x: 0,
          y: 0,
          width: intrinsicWidth,
          height: 188,
          top: 0,
          right: intrinsicWidth,
          bottom: 188,
          left: 0,
          toJSON: () => ({}),
        };
      }
      return originalGetBoundingClientRect.call(this);
    };

    try {
      const widget: WidgetConfig = {
        id: "relative",
        type: "relative",
        enabled: true,
        updateHz: 15,
        variantId: "variant-relative",
        position: { x: 400, y: 500, w: 900, h: 420 },
        props: {},
      };
      const profile: ProfileConfig = {
        ...profileWith(widget),
        variants: [
          {
            id: "variant-relative",
            widgetType: "relative",
            columns: createDefaultRelativeColumns(),
            filters: { rowHeightMode: "compact" },
          },
        ],
      };

      render(<WidgetSandboxPreview profile={profile} activeWidget={widget} />);

      await waitFor(() => {
        expect(screen.getByTestId("widget-sandbox-scaler-inner").style.width).toBe(`${intrinsicWidth}px`);
      });
      expect(parseInt(screen.getByTestId("widget-sandbox-scaler-inner").style.width, 10)).toBeLessThan(900);
      expect(widget.position).toEqual({ x: 400, y: 500, w: 900, h: 420 });
    } finally {
      if (originalScrollWidth) {
        Object.defineProperty(HTMLElement.prototype, "scrollWidth", originalScrollWidth);
      }
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });

  it("keeps fill relative preview at least as tall as saved position height", async () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");

    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return this.getAttribute("data-testid") === "widget-sandbox-content" ? 188 : 0;
      },
    });

    try {
      const widget: WidgetConfig = {
        id: "relative",
        type: "relative",
        enabled: true,
        updateHz: 15,
        variantId: "variant-relative",
        position: { x: 400, y: 500, w: 600, h: 420 },
        props: {},
      };
      const profile: ProfileConfig = {
        ...profileWith(widget),
        variants: [
          {
            id: "variant-relative",
            widgetType: "relative",
            columns: createDefaultRelativeColumns(),
            filters: { rowHeightMode: "fill" },
          },
        ],
      };

      render(<WidgetSandboxPreview profile={profile} activeWidget={widget} />);

      await waitFor(() => {
        expect(screen.getByTestId("widget-sandbox-scaler-inner").style.height).toBe("420px");
      });
      expect(screen.getByTestId("widget-sandbox-scaler-inner").style.width).toBe("600px");
      expect(screen.getByTestId("widget-sandbox-renderer").className).toContain("h-full");
      expect(widget.position).toEqual({ x: 400, y: 500, w: 600, h: 420 });
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
      }
    }
  });
});
