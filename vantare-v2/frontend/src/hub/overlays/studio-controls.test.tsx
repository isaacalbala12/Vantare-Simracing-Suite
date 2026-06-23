import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudioSectionHeader, StudioSettingRow, StudioSubsectionLabel } from "./studio-controls";

describe("studio-controls", () => {
  it("renders a section header with title and hint", () => {
    render(<StudioSectionHeader title="Apariencia" hint="Tema y opacidad" />);
    expect(screen.getByText("Apariencia")).toBeTruthy();
    expect(screen.getByText("Tema y opacidad")).toBeTruthy();
  });

  it("renders a setting row with label and child control", () => {
    render(
      <StudioSettingRow label="Opacidad" htmlFor="opacity-input">
        <input id="opacity-input" aria-label="Opacidad" />
      </StudioSettingRow>,
    );
    expect(screen.getByLabelText("Opacidad")).toBeTruthy();
  });

  it("renders a subsection label as a presentational caption", () => {
    const { container } = render(<StudioSubsectionLabel>Mejor vuelta</StudioSubsectionLabel>);
    expect(container.textContent).toBe("Mejor vuelta");
  });
});