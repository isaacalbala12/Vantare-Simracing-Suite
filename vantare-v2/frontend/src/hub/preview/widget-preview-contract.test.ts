import { describe, expect, it } from "vitest";
import { getWidgetPreviewContractSize } from "./widget-preview-contract";

describe("widget-preview-contract", () => {
  it("standings contract is 420×620", () => {
    const size = getWidgetPreviewContractSize("standings");
    expect(size.mode).toBe("contract");
    expect(size.width).toBe(420);
    expect(size.height).toBe(620);
  });

  it("relative contract is 420×260", () => {
    const size = getWidgetPreviewContractSize("relative");
    expect(size.mode).toBe("contract");
    expect(size.width).toBe(420);
    expect(size.height).toBe(260);
  });

  it("delta contract is 420×140", () => {
    const size = getWidgetPreviewContractSize("delta");
    expect(size.mode).toBe("contract");
    expect(size.width).toBe(420);
    expect(size.height).toBe(140);
  });

  it("pedals contract is 420×120", () => {
    const size = getWidgetPreviewContractSize("pedals");
    expect(size.mode).toBe("contract");
    expect(size.width).toBe(420);
    expect(size.height).toBe(120);
  });

  it("all widget types share the same width", () => {
    const standings = getWidgetPreviewContractSize("standings");
    const relative = getWidgetPreviewContractSize("relative");
    const delta = getWidgetPreviewContractSize("delta");
    const pedals = getWidgetPreviewContractSize("pedals");
    expect(standings.width).toBe(relative.width);
    expect(relative.width).toBe(delta.width);
    expect(delta.width).toBe(pedals.width);
  });

  it("standings is taller than relative (20 rows vs 5 rows)", () => {
    const standings = getWidgetPreviewContractSize("standings");
    const relative = getWidgetPreviewContractSize("relative");
    expect(standings.height).toBeGreaterThan(relative.height);
  });

  it("delta and pedals do not dominate standings/relative", () => {
    const standings = getWidgetPreviewContractSize("standings");
    const delta = getWidgetPreviewContractSize("delta");
    const pedals = getWidgetPreviewContractSize("pedals");
    expect(delta.height).toBeLessThan(standings.height);
    expect(pedals.height).toBeLessThan(standings.height);
  });

  it("is idempotent — same type returns same size on repeated calls", () => {
    for (const type of ["standings", "relative", "delta", "pedals"]) {
      const size1 = getWidgetPreviewContractSize(type);
      const size2 = getWidgetPreviewContractSize(type);
      expect(size1.width).toBe(size2.width);
      expect(size1.height).toBe(size2.height);
    }
  });

  it("all four types use mode 'contract' — not 'declared' or 'intrinsic'", () => {
    for (const type of ["standings", "relative", "delta", "pedals"]) {
      const size = getWidgetPreviewContractSize(type);
      expect(size.mode).toBe("contract");
    }
  });

  it("returns fallback for unknown widget type", () => {
    const size = getWidgetPreviewContractSize("unknown-widget");
    expect(size.mode).toBe("contract");
    expect(size.width).toBe(320);
    expect(size.height).toBe(180);
  });
});
