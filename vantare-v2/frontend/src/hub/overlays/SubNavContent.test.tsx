import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SubNavContent } from "./SubNavContent";
import type { SubNavSection } from "./sub-nav-config";

const mockSections: SubNavSection[] = [
  { id: "diseno", title: "Diseño", label: "Diseño", accent: "" },
  { id: "apariencia", title: "Apariencia", label: "Apariencia", accent: "purple" },
];

afterEach(cleanup);

describe("SubNavContent", () => {
  it("renders the active section title in header", () => {
    render(
      <SubNavContent
        sections={mockSections}
        activeSectionId="diseno"
        onResetSection={() => {}}
      >
        <div data-testid="diseno-content">Design content</div>
        <div data-testid="apariencia-content" className="hidden">Appearance content</div>
      </SubNavContent>
    );
    expect(screen.getByText("Diseño")).toBeTruthy();
  });

  it("renders reset and more-actions buttons in header", () => {
    render(
      <SubNavContent
        sections={mockSections}
        activeSectionId="diseno"
        onResetSection={() => {}}
      >
        <div>Content</div>
      </SubNavContent>
    );
    expect(screen.getByTitle("Reset sección")).toBeTruthy();
    expect(screen.getByTitle("Más opciones")).toBeTruthy();
  });

  it("calls onResetSection when reset button is clicked", () => {
    const onReset = vi.fn();
    render(
      <SubNavContent
        sections={mockSections}
        activeSectionId="diseno"
        onResetSection={onReset}
      >
        <div>Content</div>
      </SubNavContent>
    );
    screen.getByTitle("Reset sección").click();
    expect(onReset).toHaveBeenCalled();
  });

  it("renders children inside the body", () => {
    render(
      <SubNavContent
        sections={mockSections}
        activeSectionId="diseno"
        onResetSection={() => {}}
      >
        <div data-testid="child">Child content</div>
      </SubNavContent>
    );
    expect(screen.getByTestId("child")).toBeTruthy();
  });
});
