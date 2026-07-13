import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SubNavRail } from "./SubNavRail";
import type { SubNavSection } from "./sub-nav-config";

const mockSections: SubNavSection[] = [
  { id: "diseno", title: "Diseño", label: "Diseño", accent: "" },
  { id: "apariencia", title: "Apariencia", label: "Apariencia", accent: "purple" },
  { id: "slots", title: "Slots", label: "Slots", accent: "blue" },
];

afterEach(cleanup);

describe("SubNavRail", () => {
  it("renders widget name in header", () => {
    render(
      <SubNavRail
        widgetName="Delta trace"
        widgetEnabled={true}
        sections={mockSections}
        activeSectionId="diseno"
        onSelectSection={() => {}}
        onToggleVisibility={() => {}}
        dirty={false}
        onReset={() => {}}
      />
    );
    expect(screen.getByText("Delta trace")).toBeTruthy();
  });

  it("shows active status when widget is enabled", () => {
    render(
      <SubNavRail
        widgetName="Delta"
        widgetEnabled={true}
        sections={mockSections}
        activeSectionId="diseno"
        onSelectSection={() => {}}
        onToggleVisibility={() => {}}
        dirty={false}
        onReset={() => {}}
      />
    );
    expect(screen.getByText(/Activo/i)).toBeTruthy();
  });

  it("renders a button per section", () => {
    render(
      <SubNavRail
        widgetName="Delta"
        widgetEnabled={true}
        sections={mockSections}
        activeSectionId="diseno"
        onSelectSection={() => {}}
        onToggleVisibility={() => {}}
        dirty={false}
        onReset={() => {}}
      />
    );
    expect(screen.getByText("Diseño")).toBeTruthy();
    expect(screen.getByText("Apariencia")).toBeTruthy();
    expect(screen.getByText("Slots")).toBeTruthy();
  });

  it("calls onSelectSection when a section button is clicked", () => {
    const onSelect = vi.fn();
    render(
      <SubNavRail
        widgetName="Delta"
        widgetEnabled={true}
        sections={mockSections}
        activeSectionId="diseno"
        onSelectSection={onSelect}
        onToggleVisibility={() => {}}
        dirty={false}
        onReset={() => {}}
      />
    );
    fireEvent.click(screen.getByText("Slots"));
    expect(onSelect).toHaveBeenCalledWith("slots");
  });

  it("calls onToggleVisibility when visibility toggle is clicked", () => {
    const onToggle = vi.fn();
    render(
      <SubNavRail
        widgetName="Delta"
        widgetEnabled={true}
        sections={mockSections}
        activeSectionId="diseno"
        onSelectSection={() => {}}
        onToggleVisibility={onToggle}
        dirty={false}
        onReset={() => {}}
      />
    );
    const buttons = screen.getAllByRole("button");
    // The visibility toggle is the button with class sn-rail-visibility
    const toggle = buttons.find((b) => b.className.includes("sn-rail-visibility"));
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle!);
    expect(onToggle).toHaveBeenCalled();
  });

  it("shows dirty indicator when dirty is true", () => {
    render(
      <SubNavRail
        widgetName="Delta"
        widgetEnabled={true}
        sections={mockSections}
        activeSectionId="diseno"
        onSelectSection={() => {}}
        onToggleVisibility={() => {}}
        dirty={true}
        onReset={() => {}}
      />
    );
    expect(screen.getByText(/cambios/i)).toBeTruthy();
  });

  it("calls onReset when reset button is clicked", () => {
    const onReset = vi.fn();
    render(
      <SubNavRail
        widgetName="Delta"
        widgetEnabled={true}
        sections={mockSections}
        activeSectionId="diseno"
        onSelectSection={() => {}}
        onToggleVisibility={() => {}}
        dirty={true}
        onReset={onReset}
      />
    );
    fireEvent.click(screen.getByText("Reset"));
    expect(onReset).toHaveBeenCalled();
  });
});
