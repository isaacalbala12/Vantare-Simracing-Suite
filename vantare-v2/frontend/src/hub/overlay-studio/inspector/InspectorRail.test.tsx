import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { InspectorRail } from "./InspectorRail";

const widget = deltaDefinition.createDefault("delta-main");

const sections = [
  { id: "design" as const, labelKey: "overlay.studio.inspector.sections.design" },
  { id: "appearance" as const, labelKey: "overlay.studio.inspector.sections.appearance" },
  { id: "behavior" as const, labelKey: "overlay.studio.inspector.sections.behavior" },
];

describe("InspectorRail", () => {
  afterEach(() => cleanup());

  it("renders the V10-style rail header, mini-preview items and dirty footer", () => {
    render(
      <InspectorRail
        widget={widget}
        sections={sections}
        activeSectionId="design"
        dirty
        onSelectSection={vi.fn()}
        onToggleVisibility={vi.fn()}
      />,
    );

    expect(screen.getByTestId("studio-inspector-rail")).toBeTruthy();
    expect(screen.getByTestId("studio-inspector-rail-header")).toBeTruthy();
    expect(screen.getByTestId("studio-inspector-rail-items")).toBeTruthy();
    expect(screen.getByTestId("studio-inspector-rail-item-design")).toBeTruthy();
    expect(screen.getByTestId("studio-inspector-rail-item-appearance")).toBeTruthy();
    expect(screen.getByTestId("studio-inspector-footer").getAttribute("data-dirty")).toBe("true");
    expect(screen.getByTestId("studio-inspector-dirty-indicator").textContent).toContain("Cambios");
  });

  it("dispatches visibility changes through the singular rail toggle", () => {
    const onToggleVisibility = vi.fn();
    render(
      <InspectorRail
        widget={widget}
        sections={sections}
        activeSectionId="design"
        dirty={false}
        onSelectSection={vi.fn()}
        onToggleVisibility={onToggleVisibility}
      />,
    );

    fireEvent.click(screen.getByTestId("studio-inspector-visibility-toggle"));
    expect(onToggleVisibility).toHaveBeenCalledTimes(1);
  });

  it("selects sections from the rail", () => {
    const onSelectSection = vi.fn();
    render(
      <InspectorRail
        widget={widget}
        sections={sections}
        activeSectionId="design"
        dirty={false}
        onSelectSection={onSelectSection}
        onToggleVisibility={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("studio-inspector-rail-item-appearance"));
    expect(onSelectSection).toHaveBeenCalledWith("appearance");
  });
});