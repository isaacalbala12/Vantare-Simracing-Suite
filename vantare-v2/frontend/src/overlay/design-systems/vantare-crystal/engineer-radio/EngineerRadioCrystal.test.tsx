import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EngineerRadioViewModel } from "../../../widget-types/engineer-radio/engineer-radio-definition";
import { EngineerRadioCrystal } from "./EngineerRadioCrystal";

const model: EngineerRadioViewModel = {
  type: "engineer-radio",
  status: "ready",
  visible: true,
  speaker: "Spotter",
  category: "SPOTTER",
  text: "Coche a la izquierda",
  severity: "critical",
  role: "spotter",
  messageId: "spotter-left-1",
};

describe("EngineerRadioCrystal", () => {
  it("renders an accessible live subtitle without adding a page background", () => {
    const { container } = render(
      <EngineerRadioCrystal model={model} settings={{}} renderMode="desktop" />,
    );
    const subtitle = screen.getByRole("alert");
    expect(subtitle.textContent).toContain("Coche a la izquierda");
    expect(subtitle.getAttribute("aria-atomic")).toBe("true");
    expect(container.firstElementChild?.hasAttribute("data-engineer-radio-root")).toBe(true);
    expect((container.firstElementChild as HTMLElement).style.backgroundColor).not.toBe("#000");
  });

  it("is transparent when policy has no active presentation", () => {
    const { container } = render(
      <EngineerRadioCrystal
        model={{ ...model, visible: false, status: "missing" }}
        settings={{}}
        renderMode="obs"
      />,
    );
    expect(container.childElementCount).toBe(0);
  });
});
