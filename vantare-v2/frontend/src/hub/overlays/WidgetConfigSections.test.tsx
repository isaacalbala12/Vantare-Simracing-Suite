import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WidgetConfigSections } from "./WidgetConfigSections";
import type { WidgetConfig } from "../../lib/profile";

afterEach(() => {
  cleanup();
});

const deltaWidget: WidgetConfig = {
  id: "delta",
  type: "delta",
  enabled: true,
  updateHz: 30,
  position: { x: 0, y: 0, w: 400, h: 48 },
};

const standingsWidget: WidgetConfig = {
  id: "standings",
  type: "standings",
  enabled: true,
  updateHz: 15,
  position: { x: 0, y: 0, w: 400, h: 300 },
};

const unknownWidget: WidgetConfig = {
  id: "unknown-type",
  type: "nonexistent-widget",
  enabled: true,
  updateHz: 10,
  position: { x: 0, y: 0, w: 200, h: 100 },
};

describe("WidgetConfigSections", () => {
  it("renders slots section for delta widget", () => {
    render(
      <WidgetConfigSections
        widget={deltaWidget}
      />,
    );
    expect(screen.getByText("Slots")).toBeDefined();
    expect(screen.getByText("headerStat")).toBeDefined();
  });

  it("renders columns section for standings widget", () => {
    render(
      <WidgetConfigSections
        widget={standingsWidget}
      />,
    );
    expect(screen.getByText("Columns")).toBeDefined();
    expect(screen.getByText("position")).toBeDefined();
  });

  it("renders column groups section for standings widget", () => {
    render(
      <WidgetConfigSections
        widget={standingsWidget}
      />,
    );
    expect(screen.getByText("Column Groups")).toBeDefined();
    expect(screen.getByText("hypercar")).toBeDefined();
  });

  it("renders nothing for unknown widget type", () => {
    const { container } = render(
      <WidgetConfigSections
        widget={unknownWidget}
      />,
    );
    expect(container.querySelector("[data-testid='widget-config-sections']")).toBeNull();
  });

  it("shows read-only indicator for foundation display", () => {
    render(
      <WidgetConfigSections
        widget={deltaWidget}
      />,
    );
    const indicator = screen.getByTestId("widget-config-read-only");
    expect(indicator.textContent).toContain("Read-only");
    expect(indicator.textContent).toContain("foundation");
  });

  it("contains no editing form elements or action buttons (read-only foundation)", () => {
    const { container } = render(
      <WidgetConfigSections
        widget={deltaWidget}
      />,
    );
    // No editing form elements — this is a read-only display, not an editor
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("select")).toHaveLength(0);
    expect(container.querySelectorAll("textarea")).toHaveLength(0);
    // No action buttons (Save/Apply/Delete/Submit) — only collapse toggles allowed
    const ACTION_LABELS = /save|apply|delete|submit|remove|discard/i;
    const buttons = Array.from(container.querySelectorAll("button"));
    const actionButtons = buttons.filter((b) => ACTION_LABELS.test(b.textContent ?? ""));
    expect(actionButtons).toHaveLength(0);
  });
});
