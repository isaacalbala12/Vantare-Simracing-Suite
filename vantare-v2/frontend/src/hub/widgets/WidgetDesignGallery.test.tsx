import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WidgetDesignGallery } from "./WidgetDesignGallery";
import {
  OFFICIAL_DESIGNS,
  getOfficialDesign,
} from "./widget-design-gallery";
import type { WidgetConfig } from "../../lib/profile";

afterEach(() => {
  cleanup();
});

function makeWidget(overrides: Partial<WidgetConfig> = {}): WidgetConfig {
  return {
    id: "rel-1",
    type: "relative",
    enabled: true,
    updateHz: 15,
    position: { x: 100, y: 200, w: 320, h: 280 },
    ...overrides,
  };
}

describe("WidgetDesignGallery", () => {
  it("renders nothing when no widget is selected", () => {
    const { container } = render(
      <WidgetDesignGallery widget={null} onApplyDesign={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("lists only designs matching the widget type", () => {
    render(<WidgetDesignGallery widget={makeWidget()} onApplyDesign={vi.fn()} />);

    const relativeDesigns = OFFICIAL_DESIGNS.filter((d) => d.widgetType === "relative");
    for (const design of relativeDesigns) {
      expect(screen.getByTestId(`widget-design-item-${design.id}`)).toBeTruthy();
    }
    const nonRelativeDesigns = OFFICIAL_DESIGNS.filter((d) => d.widgetType !== "relative");
    for (const design of nonRelativeDesigns) {
      expect(screen.queryByTestId(`widget-design-item-${design.id}`)).toBeNull();
    }
  });

  it("filters correctly for standings widget", () => {
    render(
      <WidgetDesignGallery
        widget={makeWidget({ id: "st-1", type: "standings" })}
        onApplyDesign={vi.fn()}
      />,
    );

    const standingsDesigns = OFFICIAL_DESIGNS.filter((d) => d.widgetType === "standings");
    expect(standingsDesigns.length).toBeGreaterThan(0);
    for (const design of standingsDesigns) {
      expect(screen.getByTestId(`widget-design-item-${design.id}`)).toBeTruthy();
    }
    expect(
      screen.queryByTestId(`widget-design-item-${OFFICIAL_DESIGNS.find((d) => d.widgetType === "relative")!.id}`),
    ).toBeNull();
  });

  it("filters correctly for pedals widget", () => {
    render(
      <WidgetDesignGallery
        widget={makeWidget({ id: "p-1", type: "pedals" })}
        onApplyDesign={vi.fn()}
      />,
    );
    const pedalsDesigns = OFFICIAL_DESIGNS.filter((d) => d.widgetType === "pedals");
    for (const design of pedalsDesigns) {
      expect(screen.getByTestId(`widget-design-item-${design.id}`)).toBeTruthy();
    }
    expect(screen.queryByTestId(`widget-design-item-vantare-racing-essential`)).toBeNull();
  });

  it("filters correctly for delta widget", () => {
    render(
      <WidgetDesignGallery
        widget={makeWidget({ id: "d-1", type: "delta" })}
        onApplyDesign={vi.fn()}
      />,
    );
    const deltaDesigns = OFFICIAL_DESIGNS.filter((d) => d.widgetType === "delta");
    for (const design of deltaDesigns) {
      expect(screen.getByTestId(`widget-design-item-${design.id}`)).toBeTruthy();
    }
  });

  it("shows the widget type in the section header", () => {
    render(
      <WidgetDesignGallery
        widget={makeWidget({ id: "st-1", type: "standings" })}
        onApplyDesign={vi.fn()}
      />,
    );
    const gallery = screen.getByTestId("widget-design-gallery");
    expect(gallery.textContent).toContain("standings");
  });

  it("calls onApplyDesign with the design when Aplicar is clicked", () => {
    const onApply = vi.fn();
    render(<WidgetDesignGallery widget={makeWidget()} onApplyDesign={onApply} />);

    const target = OFFICIAL_DESIGNS.find((d) => d.widgetType === "relative")!;
    fireEvent.click(screen.getByTestId(`widget-design-apply-${target.id}`));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(target);
  });

  it("shows the Activo badge and no Aplicar button for the active design", () => {
    const activeId = "relative-vantare-crystal";
    render(
      <WidgetDesignGallery
        widget={makeWidget({ id: "rel-1", type: "relative", variantId: `official-${activeId}-rel-1` })}
        onApplyDesign={vi.fn()}
        activeDesignId={activeId}
      />,
    );

    expect(screen.getByTestId(`widget-design-active-${activeId}`)).toBeTruthy();
    expect(screen.queryByTestId(`widget-design-apply-${activeId}`)).toBeNull();
  });

  it("still exposes Aplicar for non-active designs", () => {
    const activeId = "relative-vantare-crystal";
    render(
      <WidgetDesignGallery
        widget={makeWidget({ id: "rel-1", type: "relative", variantId: `official-${activeId}-rel-1` })}
        onApplyDesign={vi.fn()}
        activeDesignId={activeId}
      />,
    );

    const other = OFFICIAL_DESIGNS.find((d) => d.widgetType === "relative" && d.id !== activeId)!;
    expect(screen.getByTestId(`widget-design-apply-${other.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`widget-design-active-${other.id}`)).toBeNull();
  });

  it("disables Aplicar button when the design is being applied", () => {
    const target = OFFICIAL_DESIGNS.find((d) => d.widgetType === "relative")!;
    render(
      <WidgetDesignGallery
        widget={makeWidget()}
        onApplyDesign={vi.fn()}
        applyingDesignId={target.id}
      />,
    );
    const btn = screen.getByTestId(`widget-design-apply-${target.id}`) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("does not render empty state when designs exist", () => {
    render(<WidgetDesignGallery widget={makeWidget()} onApplyDesign={vi.fn()} />);
    expect(screen.queryByTestId("widget-design-empty")).toBeNull();
  });

  it("renders empty state when no compatible designs exist", () => {
    render(
      <WidgetDesignGallery
        widget={makeWidget({ id: "x-1", type: "telemetry" })}
        onApplyDesign={vi.fn()}
      />,
    );
    expect(screen.getByTestId("widget-design-empty")).toBeTruthy();
  });

  it("marks each item with data-design-type attribute", () => {
    render(<WidgetDesignGallery widget={makeWidget()} onApplyDesign={vi.fn()} />);
    const items = screen.getAllByTestId(/^widget-design-item-/);
    for (const item of items) {
      expect((item as HTMLElement).getAttribute("data-design-type")).toBe("relative");
    }
  });

  it("exposes the catalog through the section without leaking the helper", () => {
    expect(getOfficialDesign("vantare-racing-essential")).toBeDefined();
    render(<WidgetDesignGallery widget={makeWidget()} onApplyDesign={vi.fn()} />);
    expect(screen.getByTestId("widget-design-item-vantare-racing-essential")).toBeTruthy();
  });
});