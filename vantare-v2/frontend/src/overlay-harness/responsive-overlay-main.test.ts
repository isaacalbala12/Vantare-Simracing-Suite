import { describe, expect, it, vi } from "vitest";

vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: vi.fn() }),
}));

describe("responsive overlay harness", () => {
  it("conserva los tres widgets y su configuración al usar V2", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const { buildResponsiveDocument } = await import("./responsive-overlay-main");
    const widgets = buildResponsiveDocument().layouts.general?.widgets ?? [];

    expect(widgets).toHaveLength(3);
    expect(widgets.find((widget) => widget.type === "broadcast-tower")).toMatchObject({
      layout: { x: 0, y: 0, w: 1920, h: 71, zIndex: 1 },
      content: { rowCount: 10 },
      visual: { systemId: "vantare-original" },
    });
    expect(widgets.find((widget) => widget.type === "standings")).toMatchObject({
      layout: { x: 1500, y: 90, zIndex: 2 },
      content: { classScope: "all-classes" },
      visual: { systemId: "vantare-crystal" },
    });
    expect(widgets.find((widget) => widget.type === "delta")).toMatchObject({
      layout: { x: 120, y: 940, zIndex: 3 },
      visual: { systemId: "vantare-crystal" },
    });

    const standings = widgets.find((widget) => widget.type === "standings");
    const columns = Array.isArray(standings?.content.columns) ? standings.content.columns : [];
    expect(columns.find((column) => column.metricId === "bestLap")).toMatchObject({ enabled: true });
  });
});
