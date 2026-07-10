import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { TelemetrySnapshot } from "../../../overlay/core/telemetry-snapshot";
import type { StudioCommand } from "../state/studio-command";
import { BehaviorSection } from "./BehaviorSection";

const readySnapshot: TelemetrySnapshot = {
  status: "ready",
  capturedAt: 0,
  session: { type: "practice" },
  player: { inPit: false },
  scoring: [],
};

describe("BehaviorSection", () => {
  afterEach(() => cleanup());

  it("dispatches behavior-only patches for Hz presets", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    const dispatch = vi.fn<(command: StudioCommand) => void>();

    render(
      <BehaviorSection
        widget={widget}
        session="general"
        snapshot={readySnapshot}
        dispatch={dispatch}
      />,
    );

    fireEvent.click(screen.getByTestId("studio-behavior-hz-15"));

    expect(dispatch).toHaveBeenCalledWith({
      type: "widget/behavior",
      session: "general",
      widgetIds: ["delta-main"],
      patch: { updateHz: 15 },
    });
  });

  it("rejects advanced Hz values outside 1..240", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    const dispatch = vi.fn<(command: StudioCommand) => void>();

    render(
      <BehaviorSection
        widget={widget}
        session="general"
        snapshot={readySnapshot}
        dispatch={dispatch}
      />,
    );

    const input = screen.getByTestId("studio-behavior-hz-advanced") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.change(input, { target: { value: "999" } });
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "24" } });
    expect(dispatch).toHaveBeenCalledWith({
      type: "widget/behavior",
      session: "general",
      widgetIds: ["delta-main"],
      patch: { updateHz: 24 },
    });
  });

  it("dispatches conditional visibility rules", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    const dispatch = vi.fn<(command: StudioCommand) => void>();

    render(
      <BehaviorSection
        widget={widget}
        session="general"
        snapshot={readySnapshot}
        dispatch={dispatch}
      />,
    );

    fireEvent.change(screen.getByTestId("studio-behavior-in-pit"), { target: { value: "in-pit" } });
    expect(dispatch).toHaveBeenCalledWith({
      type: "widget/behavior",
      session: "general",
      widgetIds: ["delta-main"],
      patch: { visibleWhen: { inPit: true } },
    });

    fireEvent.click(screen.getByTestId("studio-behavior-session-race"));
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "widget/behavior",
      session: "general",
      widgetIds: ["delta-main"],
      patch: { visibleWhen: { sessionTypes: ["race"] } },
    });
  });

  it("exposes runtime visibility from the telemetry snapshot", () => {
    const widget = deltaDefinition.createDefault("delta-main");
    widget.behavior.visibleWhen = { inPit: true };

    const { rerender } = render(
      <BehaviorSection
        widget={widget}
        session="general"
        snapshot={readySnapshot}
        dispatch={vi.fn()}
      />,
    );
    expect(screen.getByTestId("studio-inspector-section-behavior").getAttribute("data-runtime-visible")).toBe(
      "false",
    );

    rerender(
      <BehaviorSection
        widget={widget}
        session="general"
        snapshot={{ ...readySnapshot, player: { inPit: true } }}
        dispatch={vi.fn()}
      />,
    );
    expect(screen.getByTestId("studio-inspector-section-behavior").getAttribute("data-runtime-visible")).toBe(
      "true",
    );
  });
});