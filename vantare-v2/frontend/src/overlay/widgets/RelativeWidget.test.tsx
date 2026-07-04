import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("./widget-appearance", () => ({
  resolveWidgetAppearance: vi.fn((_type: string, props?: Record<string, unknown>) => {
    const style = (props?.style as string) ?? "vantare-racing";
    return {
      style,
      appearance: {
        accentColor: "#9b2226",
        backgroundColor: "#000000",
        textColor: "#FFFFFF",
        borderColor: "#9b2226",
        opacity: 1,
        positiveColor: "#e74c3c",
        negativeColor: "#2ecc71",
        gapAheadColor: "#f87171",
        gapBehindColor: "#4ade80",
        classHypercarColor: "#c1121f",
        classLmp2Color: "#0055A4",
        classLmp3Color: "#f59e0b",
        classGt3Color: "#2ecc71",
        classUnknownColor: "#6b7280",
      },
    };
  }),
}));

vi.mock("./widget-design-system", () => ({
  resolveWidgetDesignSystem: vi.fn((themeId?: string) => {
    if (themeId === "vantare-crystal") {
      return {
        id: "vantare-crystal",
        name: "Vantare Crystal",
        colors: { accent: "#ff3b3b", border: "#1E1E1E", text: "#f5f5f5" },
        surfaces: {
          rowEven: "rgba(255,255,255,.015)",
          rowOdd: "rgba(0,0,0,.25)",
          playerHighlight: "linear-gradient(90deg,rgba(255,42,59,.22),rgba(230,57,70,.05))",
        },
        radius: { lg: "12px" },
        glow: { accent: "0 0 10px rgba(255,59,59,.5)" },
      };
    }
    return {
      id: "base",
      name: "Base",
      colors: { accent: "#9b2226", border: "#222222", text: "#ffffff" },
      surfaces: {
        rowEven: "rgba(255,255,255,.03)",
        rowOdd: "rgba(0,0,0,.3)",
        playerHighlight: "linear-gradient(90deg,rgba(155,34,38,.3),rgba(155,34,38,.05))",
      },
      radius: { lg: "10px" },
      glow: { accent: "0 0 8px rgba(155,34,38,.5)" },
    };
  }),
}));

vi.mock("../../lib/telemetry-ref", () => ({
  getTelemetryRef: vi.fn(() => ({ vehicles: [] })),
}));

vi.mock("./mock-telemetry", () => ({
  getMockTelemetry: vi.fn(() => ({ vehicles: [] })),
}));

vi.mock("../../lib/frame-budget", () => ({
  startFrameBudgetLoop: vi.fn(() => () => {}),
}));

vi.mock("../../lib/dom-write", () => ({
  setHTMLIfChanged: vi.fn(),
}));

vi.mock("./relative-filters", () => ({
  getRelativeFilters: vi.fn(() => ({
    rangeAhead: 5,
    rangeBehind: 5,
    classScope: "all",
    includePlayer: true,
    rowHeightMode: "auto",
  })),
  selectRelativeRows: vi.fn(() => []),
}));

vi.mock("./relative-format", () => ({
  formatRelativeDriverName: vi.fn((_name: string) => _name),
  formatRelativeLapTime: vi.fn(() => "1:23.456"),
  DEFAULT_RELATIVE_COLUMN_WIDTHS: {},
  getRelativeColumnAlign: vi.fn(() => "left"),
  getRelativeColumnColor: vi.fn((_col: unknown, fallback: string) => fallback),
  getRelativeColumnWidth: vi.fn(() => 80),
  getRelativeIntrinsicWidth: vi.fn(() => 400),
  getRelativeJustifyClass: vi.fn(() => "justify-start"),
}));

vi.mock("./relative-widget-helpers", () => ({
  formatSignedGap: vi.fn((v: number) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2))),
  resolveClassColor: vi.fn(() => "#6b7280"),
}));

vi.mock("./relative-catalog", () => ({
  createDefaultRelativeColumns: vi.fn(() => []),
}));

vi.mock("../../lib/color-utils", () => ({
  brandTextColor: vi.fn(() => "#FFFFFF"),
}));

vi.mock("../../lib/html-escape", () => ({
  escapeHTML: vi.fn((s: string) => s),
}));

// ── Import after mocks ─────────────────────────────────────────────────────

import { RelativeWidget } from "./RelativeWidget";

afterEach(() => {
  cleanup();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("RelativeWidget", () => {
  it("renders with vantare-crystal style without errors", () => {
    render(
      <RelativeWidget
        editMode={false}
        props={{ style: "vantare-crystal" }}
      />,
    );
    const panel = screen.getByTestId("relative-panel");
    expect(panel).toBeDefined();
    expect(panel.style.borderRadius).toBe("12px");
  });

  it("renders with base style (existing, still works)", () => {
    render(
      <RelativeWidget
        editMode={false}
        props={{ style: "vantare-racing" }}
      />,
    );
    const panel = screen.getByTestId("relative-panel");
    expect(panel).toBeDefined();
    expect(panel.style.borderRadius).toBe("8px");
  });

  it("columns can be edited without position changing", () => {
    const position = { x: 100, y: 200, w: 300, h: 400 };
    const positionCopy = { ...position };

    render(
      <RelativeWidget
        editMode={true}
        props={{
          style: "vantare-racing",
          variant: {
            columns: [
              { id: "driverName", metricId: "driverName", enabled: true, width: 120 },
              { id: "gap", metricId: "gap", enabled: true, width: 80 },
            ],
          },
          position,
        }}
      />,
    );

    // Position should not have been mutated by column rendering
    expect(position.x).toBe(positionCopy.x);
    expect(position.y).toBe(positionCopy.y);
    expect(position.w).toBe(positionCopy.w);
    expect(position.h).toBe(positionCopy.h);
    expect(screen.getByTestId("relative-panel")).toBeDefined();
  });

  it("renders glassmorphism-pro style with glass panel background", () => {
    render(
      <RelativeWidget
        editMode={false}
        props={{ style: "glassmorphism-pro" }}
      />,
    );
    const panel = screen.getByTestId("relative-panel");
    expect(panel).toBeDefined();
    expect(panel.style.borderRadius).toBe("10px");
    expect(panel.style.backdropFilter).toBe("blur(24px)");
  });
});
