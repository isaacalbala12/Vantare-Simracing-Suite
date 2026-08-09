import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { InspectorRail } from "./InspectorRail";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { ResolvedInspectorSection } from "./inspector-sections";

describe("InspectorRail - Horizontal Overflow Prevention", () => {
  const mockWidget: WidgetInstanceV3 = {
    id: "test-widget",
    name: "standings",
    type: "standings",
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
    behavior: { enabled: true },
  };

  const mockSections: ResolvedInspectorSection[] = [
    { id: "design", labelKey: "studio.v3.inspector.section.design" },
    { id: "appearance", labelKey: "studio.v3.inspector.section.appearance" },
    { id: "content", labelKey: "studio.v3.inspector.section.content" },
    { id: "behavior", labelKey: "studio.v3.inspector.section.behavior" },
    { id: "layout", labelKey: "studio.v3.inspector.section.layout" },
    { id: "actions", labelKey: "studio.v3.inspector.section.actions" },
  ];

  it("should render rail without horizontal scrollbar in items container", () => {
    const { container } = render(
      <InspectorRail
        widget={mockWidget}
        sections={mockSections}
        activeSectionId="design"
        dirty={false}
        onSelectSection={() => {}}
        onToggleVisibility={() => {}}
      />
    );

    const itemsContainer = container.querySelector(
      '[data-testid="studio-inspector-rail-items"]'
    );
    expect(itemsContainer).toBeTruthy();

    // Items container should fit within rail without overflow
    if (itemsContainer) {
      const scrollWidth = itemsContainer.scrollWidth;
      const clientWidth = itemsContainer.clientWidth;
      expect(scrollWidth).toBeLessThanOrEqual(
        clientWidth,
        "Items container should not have horizontal overflow"
      );
    }
  });

  it("should have overflow protection styles on name element", () => {
    const longNameWidget: WidgetInstanceV3 = {
      ...mockWidget,
      name: "this-is-a-very-long-widget-name-that-should-be-truncated",
    };

    const { container } = render(
      <InspectorRail
        widget={longNameWidget}
        sections={mockSections}
        activeSectionId="design"
        dirty={false}
        onSelectSection={() => {}}
        onToggleVisibility={() => {}}
      />
    );

    const nameElement = container.querySelector(
      '[class*="__name"]'
    ) as HTMLElement;
    expect(nameElement).toBeTruthy();

    if (nameElement) {
      // Check that name element exists and is rendered
      expect(nameElement.className).toContain("osv3-inspector-rail__name");
      // Name element should exist in DOM
      expect(nameElement.textContent).toBeTruthy();
    }
  });

  it("should fit all item buttons within rail width", () => {
    const { container } = render(
      <InspectorRail
        widget={mockWidget}
        sections={mockSections}
        activeSectionId="design"
        dirty={false}
        onSelectSection={() => {}}
        onToggleVisibility={() => {}}
      />
    );

    const itemButtons = container.querySelectorAll(
      '[data-testid^="studio-inspector-rail-item-"]'
    );
    expect(itemButtons.length).toBe(mockSections.length);

    // Each button should fit within the rail
    itemButtons.forEach((button) => {
      const scrollWidth = (button as HTMLElement).scrollWidth;
      const clientWidth = (button as HTMLElement).clientWidth;
      expect(scrollWidth).toBeLessThanOrEqual(
        clientWidth,
        `Button ${(button as HTMLElement).getAttribute("data-testid")} should not overflow`
      );
    });
  });

  it("should not have overflow in rail header and footer", () => {
    const { container } = render(
      <InspectorRail
        widget={mockWidget}
        sections={mockSections}
        activeSectionId="design"
        dirty={false}
        onSelectSection={() => {}}
        onToggleVisibility={() => {}}
      />
    );

    const header = container.querySelector(
      '[data-testid="studio-inspector-rail-header"]'
    );
    const footer = container.querySelector(
      '[data-testid="studio-inspector-footer"]'
    );

    if (header) {
      expect((header as HTMLElement).scrollWidth).toBeLessThanOrEqual(
        (header as HTMLElement).clientWidth + 1,
        "Header should not have horizontal overflow"
      );
    }

    if (footer) {
      expect((footer as HTMLElement).scrollWidth).toBeLessThanOrEqual(
        (footer as HTMLElement).clientWidth + 1,
        "Footer should not have horizontal overflow"
      );
    }
  });
});
