import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { createDefaultRelativeColumns } from "../../overlay/widgets/relative-catalog";
import { getRelativeIntrinsicWidth } from "../../overlay/widgets/relative-format";
import { createDefaultStandingsColumns } from "../../overlay/widgets/standings-catalog";
import { getStandingsIntrinsicWidth } from "../../overlay/widgets/standings-format";
import { getWidgetPreviewContractSize } from "../preview/widget-preview-contract";
import { applyCanonicalPreviewOverrides } from "../../overlay/widgets/widget-preview-fixtures";
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
      expect(screen.getByTestId("widget-sandbox-renderer").className).toContain("h-full");
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

  it("keeps fill relative preview at saved position height while wrapping intrinsic width", async () => {
    const intrinsicWidth = getRelativeIntrinsicWidth(createDefaultRelativeColumns());
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
      expect(screen.getByTestId("widget-sandbox-scaler-inner").style.width).toBe(`${intrinsicWidth}px`);
      expect(screen.getByTestId("widget-sandbox-content").style.width).toBe("fit-content");
      expect(screen.getByTestId("widget-sandbox-renderer").className).toContain("h-full");
      expect(screen.getByTestId("widget-sandbox-renderer").className).not.toContain("w-full");
      expect(widget.position).toEqual({ x: 400, y: 500, w: 600, h: 420 });
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
      }
    }
  });

  it("propagates mock session scenario to the standings widget", async () => {
    const widget: WidgetConfig = {
      id: "standings",
      type: "standings",
      enabled: true,
      updateHz: 15,
      position: { x: 0, y: 0, w: 360, h: 300 },
    };

    render(<WidgetSandboxPreview profile={profileWith(widget)} activeWidget={widget} mockSessionScenario="race" />);

    await waitFor(() => {
      expect(screen.getByText("Leader")).toBeTruthy();
    });
  });

  it("uses intrinsic standings width without mutating position", () => {
    const columns = createDefaultStandingsColumns().map((column) =>
      column.id === "bestLap" || column.id === "lastLap" || column.id === "interval"
        ? { ...column, enabled: true }
        : column,
    );
    const widget: WidgetConfig = {
      id: "standings",
      type: "standings",
      enabled: true,
      updateHz: 15,
      variantId: "variant-standings",
      position: { x: 0, y: 0, w: 240, h: 300 },
      props: {},
    };
    const profile: ProfileConfig = {
      ...profileWith(widget),
      variants: [{ id: "variant-standings", widgetType: "standings", columns }],
    };

    render(<WidgetSandboxPreview profile={profile} activeWidget={widget} />);

    const inner = screen.getByTestId("widget-sandbox-scaler-inner");
    expect(parseInt(inner.style.width, 10)).toBeGreaterThan(240);
    expect(widget.position).toEqual({ x: 0, y: 0, w: 240, h: 300 });
  });

  it("uses standings intrinsic width when default columns fit without over-expansion", async () => {
    const columns = createDefaultStandingsColumns();
    const intrinsicWidth = getStandingsIntrinsicWidth(columns);
    const widget: WidgetConfig = {
      id: "standings",
      type: "standings",
      enabled: true,
      updateHz: 15,
      variantId: "variant-standings",
      position: { x: 0, y: 0, w: 600, h: 300 },
      props: {},
    };
    const profile: ProfileConfig = {
      ...profileWith(widget),
      variants: [{ id: "variant-standings", widgetType: "standings", columns }],
    };

    render(<WidgetSandboxPreview profile={profile} activeWidget={widget} />);

    await waitFor(() => {
      expect(screen.getByTestId("widget-sandbox-scaler-inner").style.width).toBe(`${intrinsicWidth}px`);
    });
    expect(screen.getByTestId("widget-sandbox-content").style.width).toBe("fit-content");
    expect(screen.getByTestId("widget-sandbox-renderer").className).not.toContain("w-full");
    expect(parseInt(screen.getByTestId("widget-sandbox-scaler-inner").style.width, 10)).toBeLessThanOrEqual(intrinsicWidth);
    expect(widget.position).toEqual({ x: 0, y: 0, w: 600, h: 300 });
  });

  it("expands standings width when a single optional column is enabled", () => {
    const defaultColumns = createDefaultStandingsColumns();
    const defaultIntrinsicWidth = getStandingsIntrinsicWidth(defaultColumns);
    const columns = defaultColumns.map((column) =>
      column.id === "bestLap" ? { ...column, enabled: true } : column,
    );
    const widget: WidgetConfig = {
      id: "standings",
      type: "standings",
      enabled: true,
      updateHz: 15,
      variantId: "variant-standings",
      position: { x: 0, y: 0, w: 240, h: 300 },
      props: {},
    };
    const profile: ProfileConfig = {
      ...profileWith(widget),
      variants: [{ id: "variant-standings", widgetType: "standings", columns }],
    };

    render(<WidgetSandboxPreview profile={profile} activeWidget={widget} />);

    const inner = screen.getByTestId("widget-sandbox-scaler-inner");
    expect(parseInt(inner.style.width, 10)).toBeGreaterThan(defaultIntrinsicWidth);
    expect(parseInt(inner.style.width, 10)).toBeGreaterThan(240);
    expect(widget.position).toEqual({ x: 0, y: 0, w: 240, h: 300 });
  });

  it("uses fit-content for relative fill intrinsic width when declared width is wider", async () => {
    const intrinsicWidth = getRelativeIntrinsicWidth(createDefaultRelativeColumns());
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
          filters: { rowHeightMode: "fill" },
        },
      ],
    };

    render(<WidgetSandboxPreview profile={profile} activeWidget={widget} />);

    await waitFor(() => {
      expect(screen.getByTestId("widget-sandbox-scaler-inner").style.width).toBe(`${intrinsicWidth}px`);
    });
    expect(screen.getByTestId("widget-sandbox-content").style.width).toBe("fit-content");
    expect(screen.getByTestId("widget-sandbox-renderer").className).not.toContain("w-full");
    expect(screen.getByTestId("widget-sandbox-renderer").className).toContain("h-full");
    expect(widget.position).toEqual({ x: 400, y: 500, w: 900, h: 420 });
  });

  it("uses fit-content for standings intrinsic width when declared width is wider", async () => {
    const columns = createDefaultStandingsColumns();
    const intrinsicWidth = getStandingsIntrinsicWidth(columns);
    const widget: WidgetConfig = {
      id: "standings",
      type: "standings",
      enabled: true,
      updateHz: 15,
      variantId: "variant-standings",
      position: { x: 0, y: 0, w: 600, h: 300 },
      props: {},
    };
    const profile: ProfileConfig = {
      ...profileWith(widget),
      variants: [{ id: "variant-standings", widgetType: "standings", columns }],
    };

    render(<WidgetSandboxPreview profile={profile} activeWidget={widget} />);

    await waitFor(() => {
      expect(screen.getByTestId("widget-sandbox-scaler-inner").style.width).toBe(`${intrinsicWidth}px`);
    });
    expect(screen.getByTestId("widget-sandbox-content").style.width).toBe("fit-content");
    expect(screen.getByTestId("widget-sandbox-renderer").className).not.toContain("w-full");
    expect(screen.getByTestId("widget-sandbox-renderer").className).toContain("h-full");
    expect(widget.position).toEqual({ x: 0, y: 0, w: 600, h: 300 });
  });

  it("keeps non-configurable widgets using declared layout width in sandbox", async () => {
    const widget: WidgetConfig = {
      id: "delta",
      type: "delta",
      enabled: true,
      updateHz: 15,
      position: { x: 100, y: 200, w: 320, h: 140 },
      props: {},
    };

    render(<WidgetSandboxPreview profile={profileWith(widget)} activeWidget={widget} />);

    await waitFor(() => {
      expect(screen.getByTestId("widget-sandbox-scaler-inner").style.width).toBe("320px");
      expect(screen.getByTestId("widget-sandbox-scaler-inner").style.height).toBe("140px");
    });
    expect(screen.getByTestId("widget-sandbox-content").style.width).not.toBe("fit-content");
    expect(screen.getByTestId("widget-sandbox-renderer").className).toContain("h-full");
    expect(screen.getByTestId("widget-sandbox-renderer").className).toContain("w-full");
  });

  it("uses contract size for official designs, ignoring widget.position", async () => {
    const contract = getWidgetPreviewContractSize("standings");
    const widget: WidgetConfig = {
      id: "standings",
      type: "standings",
      enabled: true,
      updateHz: 15,
      variantId: "official-standings-leaderboard-standings",
      position: { x: 0, y: 0, w: 200, h: 100 },
      props: {},
    };
    const profile: ProfileConfig = {
      ...profileWith(widget),
      variants: [{
        id: "official-standings-leaderboard-standings",
        widgetType: "standings",
        columns: createDefaultStandingsColumns(),
      }],
    };

    render(<WidgetSandboxPreview profile={profile} activeWidget={widget} />);

    await waitFor(() => {
      const inner = screen.getByTestId("widget-sandbox-scaler-inner");
      expect(parseInt(inner.style.width, 10)).toBe(contract.width);
      expect(parseInt(inner.style.height, 10)).toBe(contract.height);
    });
    expect(widget.position).toEqual({ x: 0, y: 0, w: 200, h: 100 });
  });

  it("canonical preview overrides preserve themeId/templateId of an official glassmorphism variant", () => {
    const widget: WidgetConfig = {
      id: "standings",
      type: "standings",
      enabled: true,
      updateHz: 15,
      variantId: "official-standings-glassmorphism-pro-standings",
      position: { x: 0, y: 0, w: 360, h: 300 },
    };
    const profile: ProfileConfig = {
      ...profileWith(widget),
      variants: [
        {
          id: "official-standings-glassmorphism-pro-standings",
          widgetType: "standings",
          templateId: "standings-vantare-default",
          themeId: "glassmorphism-pro",
          columns: createDefaultStandingsColumns(),
        },
      ],
    };

    const out = applyCanonicalPreviewOverrides(profile, widget);
    const variant = out.variants!.find((v) => v.id === widget.variantId)!;

    expect(variant.themeId).toBe("glassmorphism-pro");
    expect(variant.templateId).toBe("standings-vantare-default");
    expect(variant.columns).toBeTruthy();
  });

  });
