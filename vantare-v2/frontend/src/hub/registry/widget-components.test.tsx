import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  registerDesignSystem,
  clearDesignSystemRegistry,
  type DesignSystem,
} from "./index";
import {
  resolveWidgetComponents,
  useWidgetComponents,
} from "./widget-components";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HeaderComponent: ComponentType<any> = () => <div data-testid="custom-header" />;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RowComponent: ComponentType<any> = () => <div data-testid="custom-row" />;

// Use a complete fake tokens object (not `{} as DesignSystem["tokens"]`) so
// the test breaks if DesignSystemTokens changes — same pattern as B1.
const fakeTokens: DesignSystem["tokens"] = {
  id: "fake",
  name: "Fake",
  colors: { accent: "#000", background: "#000", surface: "#000", border: "#000", text: "#000", textMuted: "#000", textDim: "#000", positive: "#000", negative: "#000", warning: "#000", info: "#000", purple: "#000" },
  badges: { free: { bg: "#000", text: "#000", border: "#000" }, pro: { bg: "#000", text: "#000", border: "#000" }, tester: { bg: "#000", text: "#000", border: "#000" }, experimental: { bg: "#000", text: "#000", border: "#000" }, dataOk: { bg: "#000", text: "#000", border: "#000" }, dataPartial: { bg: "#000", text: "#000", border: "#000" }, dataPending: { bg: "#000", text: "#000", border: "#000" } },
  surfaces: { card: "#000", panel: "#000", header: "#000", rowEven: "#000", rowOdd: "#000", playerHighlight: "#000", lockedOverlay: "#000" },
  typography: { displayFont: "Inter", bodyFont: "Inter", monoFont: "JetBrains Mono" },
  radius: { sm: "4px", md: "8px", lg: "12px", xl: "16px" },
  glow: { accent: "none", none: "none" },
};

function makeSystem(id: string, components: DesignSystem["components"]): DesignSystem {
  return {
    id,
    name: id,
    tokens: fakeTokens,
    perWidgetAppearance: {},
    components,
  };
}

describe("resolveWidgetComponents", () => {
  beforeEach(() => clearDesignSystemRegistry());

  it("returns empty object for unregistered themeId", () => {
    expect(resolveWidgetComponents("standings", "unknown")).toEqual({});
  });

  it("returns empty object for null themeId", () => {
    expect(resolveWidgetComponents("standings", null)).toEqual({});
    expect(resolveWidgetComponents("standings", undefined)).toEqual({});
    expect(resolveWidgetComponents("standings", "")).toEqual({});
  });

  it("returns components for a registered system", () => {
    registerDesignSystem(
      makeSystem("vantare-v3", {
        standings: { Header: HeaderComponent, Row: RowComponent },
      }),
    );
    const result = resolveWidgetComponents("standings", "vantare-v3");
    expect(result.Header).toBe(HeaderComponent);
    expect(result.Row).toBe(RowComponent);
    expect(result.Footer).toBeUndefined();
  });

  it("returns empty object for a type the system doesn't cover", () => {
    registerDesignSystem(
      makeSystem("vantare-v3", {
        standings: { Header: HeaderComponent },
      }),
    );
    expect(resolveWidgetComponents("delta", "vantare-v3")).toEqual({});
  });
});

describe("useWidgetComponents", () => {
  beforeEach(() => clearDesignSystemRegistry());

  it("returns empty object for unregistered themeId", () => {
    const { result } = renderHook(() => useWidgetComponents("standings", "unknown"));
    expect(result.current).toEqual({});
  });

  it("returns the components a system provides", () => {
    registerDesignSystem(
      makeSystem("vantare-v3", {
        standings: { Header: HeaderComponent },
      }),
    );
    const { result } = renderHook(() => useWidgetComponents("standings", "vantare-v3"));
    expect(result.current.Header).toBe(HeaderComponent);
  });

  it("memoizes result by type + themeId", () => {
    registerDesignSystem(
      makeSystem("vantare-v3", {
        standings: { Header: HeaderComponent },
      }),
    );
    const { result, rerender } = renderHook(
      ({ type, themeId }: { type: string; themeId: string }) =>
        useWidgetComponents(type, themeId),
      { initialProps: { type: "standings", themeId: "vantare-v3" } },
    );
    const first = result.current;
    rerender({ type: "standings", themeId: "vantare-v3" });
    expect(result.current).toBe(first);
  });
});
