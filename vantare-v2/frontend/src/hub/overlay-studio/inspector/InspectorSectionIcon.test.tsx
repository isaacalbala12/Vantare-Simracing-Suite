import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InspectorSectionIcon } from "./InspectorSectionIcon";
import type { InspectorSectionId } from "../../../overlay/core/widget-definition";

const SECTIONS: readonly InspectorSectionId[] = [
  "design",
  "appearance",
  "content",
  "behavior",
  "layout",
  "actions",
];

afterEach(() => cleanup());

function markup(sectionId: InspectorSectionId): string {
  const { container } = render(<InspectorSectionIcon sectionId={sectionId} />);
  const svg = container.querySelector("svg");
  expect(svg).toBeTruthy();
  return svg!.innerHTML;
}

describe("InspectorSectionIcon", () => {
  it("draws a distinct icon for every inspector section", () => {
    // Antes las seis compartian el mismo rectangulo gris y solo dos se
    // distinguian, unicamente al estar activas: el carril no informaba de nada.
    const drawings = SECTIONS.map((sectionId) => {
      const drawing = markup(sectionId);
      cleanup();
      return drawing;
    });
    expect(new Set(drawings).size).toBe(SECTIONS.length);
    for (const drawing of drawings) {
      expect(drawing.trim()).not.toBe("");
    }
  });

  it("inherits colour so the active accent is decided by CSS", () => {
    const { container } = render(<InspectorSectionIcon sectionId="behavior" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps every icon local, with no remote references", () => {
    for (const sectionId of SECTIONS) {
      expect(markup(sectionId)).not.toMatch(/http|url\(/);
      cleanup();
    }
  });
});
