import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { StudioCommand } from "../state/studio-command";
import { AppearanceSection } from "./AppearanceSection";

describe("AppearanceSection", () => {
  afterEach(() => cleanup());

  it("writes appearance overrides without mutating base settings", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    const dispatch = vi.fn<(command: StudioCommand) => void>();

    render(<AppearanceSection widget={widget} session="general" dispatch={dispatch} />);

    const toggle = screen.getByTestId("studio-inspector-control-show-header").querySelector("input");
    expect(toggle).toBeTruthy();
    expect((toggle as HTMLInputElement).checked).toBe(true);

    fireEvent.click(toggle!);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const command = dispatch.mock.calls[0]?.[0];
    expect(command?.type).toBe("widget/visual");
    if (command?.type === "widget/visual") {
      expect(command.visual.appearanceOverrides).toEqual({ showHeader: false });
      expect(command.visual.baseSettings).toEqual(widget.visual.baseSettings);
    }
  });

  it("does not render a duplicate top-level design selector", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    render(<AppearanceSection widget={widget} session="general" dispatch={vi.fn()} />);

    expect(screen.queryByTestId("studio-inspector-design-selector")).toBeNull();
    expect(screen.getByTestId("studio-inspector-section-appearance")).toBeTruthy();
  });
});