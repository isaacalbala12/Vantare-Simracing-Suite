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

  it("clamps advanced Hz values to 1..240 range on blur", () => {
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

    // Typing intermediate values should NOT dispatch
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.change(input, { target: { value: "999" } });
    expect(dispatch).not.toHaveBeenCalled();

    // Blurring with in-range value should dispatch
    fireEvent.change(input, { target: { value: "24" } });
    fireEvent.blur(input);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "widget/behavior",
      session: "general",
      widgetIds: ["delta-main"],
      patch: { updateHz: 24 },
    });
    expect(input.value).toBe("24"); // Input value is clamped but stays as typed

    dispatch.mockClear();

    // Blurring with value below minimum (0) should clamp to 1 and dispatch
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "widget/behavior",
      session: "general",
      widgetIds: ["delta-main"],
      patch: { updateHz: 1 },
    });
    expect(input.value).toBe("1"); // Clamped and shows the clamped value

    dispatch.mockClear();

    // Blurring with value above maximum (500) should clamp to 240 and dispatch
    fireEvent.change(input, { target: { value: "500" } });
    fireEvent.blur(input);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "widget/behavior",
      session: "general",
      widgetIds: ["delta-main"],
      patch: { updateHz: 240 },
    });
    expect(input.value).toBe("240"); // Clamped to max

    dispatch.mockClear();

    // Blurring with non-numeric input should revert to current widget.updateHz and not dispatch
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);
    expect(dispatch).not.toHaveBeenCalled();
    expect(input.value).toBe("30"); // Reverted to original widget updateHz (not dispatched yet)

    dispatch.mockClear();

    // Blurring with empty input should revert and not dispatch
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(dispatch).not.toHaveBeenCalled();
    expect(input.value).toBe("30");
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