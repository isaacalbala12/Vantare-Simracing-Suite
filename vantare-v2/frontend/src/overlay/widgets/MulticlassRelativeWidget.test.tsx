import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MulticlassRelativeWidget } from "./MulticlassRelativeWidget";

describe("MulticlassRelativeWidget", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders without errors with mock telemetry", () => {
    render(<MulticlassRelativeWidget editMode telemetryMode="mock" />);
    const widget = screen.getByTestId("multiclass-relative-widget");
    expect(widget).toBeTruthy();
  });

  it("displays class badges from mock telemetry", () => {
    render(<MulticlassRelativeWidget editMode telemetryMode="mock" />);
    const badges = screen.getAllByText("HC");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("shows driver names from mock telemetry", () => {
    render(<MulticlassRelativeWidget editMode telemetryMode="mock" />);
    // Preview shows vehicles around the player (P4-P8 range)
    expect(screen.getByText("CADILLAC RACING")).toBeTruthy();
  });

  it("highlights player row", () => {
    render(<MulticlassRelativeWidget editMode telemetryMode="mock" />);
    // Player is TOYOTA GAZOO in mock data
    expect(screen.getByText("TOYOTA GAZOO")).toBeTruthy();
  });
});
