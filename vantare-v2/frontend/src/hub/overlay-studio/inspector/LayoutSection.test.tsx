import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import type { StudioCommand } from "../state/studio-command";
import { LayoutSection } from "./LayoutSection";

function buildDocument(): ProfileDocumentV3 {
  const widget = deltaDefinition.createDefault("delta-main");
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [widget],
      },
    },
  };
}

describe("LayoutSection", () => {
  afterEach(() => cleanup());

  it("does not expose numeric position or size inputs", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    const savedDocument = buildDocument();

    render(
      <LayoutSection
        widget={widget}
        session="general"
        widgets={[widget]}
        savedDocument={savedDocument}
        dispatch={vi.fn()}
        selectWidget={vi.fn()}
      />,
    );

    const section = screen.getByTestId("studio-inspector-section-layout");
    const forbiddenLabels = ["x", "y", "width", "height", "w", "h"];
    for (const label of forbiddenLabels) {
      expect(section.querySelector(`[aria-label="${label}"]`)).toBeNull();
      expect(screen.queryByLabelText(new RegExp(`^${label}$`, "i"))).toBeNull();
    }
    expect(section.querySelector('input[type="number"]')).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("disables aspect unlock when the widget forbids it", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    const savedDocument = buildDocument();

    render(
      <LayoutSection
        widget={widget}
        session="general"
        widgets={[widget]}
        savedDocument={savedDocument}
        dispatch={vi.fn()}
        selectWidget={vi.fn()}
      />,
    );

    const lock = screen.getByTestId("studio-layout-aspect-lock") as HTMLInputElement;
    expect(lock.disabled).toBe(true);
    expect(screen.getByTestId("studio-layout-aspect-lock-hint")).toBeTruthy();
  });

  it("routes layout actions through widget commands", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    const savedDocument = buildDocument();
    const dispatch = vi.fn<(command: StudioCommand) => void>();

    render(
      <LayoutSection
        widget={widget}
        session="general"
        widgets={[widget]}
        savedDocument={savedDocument}
        dispatch={dispatch}
        selectWidget={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("studio-layout-center"));
    expect(dispatch).toHaveBeenCalled();
    expect(dispatch.mock.calls[0]?.[0]?.type).toBe("widget/layout");

    fireEvent.click(screen.getByTestId("studio-layout-front"));
    expect(dispatch.mock.calls.at(-1)?.[0]?.type).toBe("widget/order");
  });
});