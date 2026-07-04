import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BroadcastTowerWidget } from "./BroadcastTowerWidget";

describe("BroadcastTowerWidget", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders without errors with mock telemetry", () => {
    render(<BroadcastTowerWidget editMode telemetryMode="mock" />);
    const widget = screen.getByTestId("broadcast-tower-widget");
    expect(widget).toBeTruthy();
  });

  it("displays position labels for top 4 drivers", () => {
    render(<BroadcastTowerWidget editMode telemetryMode="mock" />);
    expect(screen.getByText("1st")).toBeTruthy();
    expect(screen.getByText("2nd")).toBeTruthy();
    expect(screen.getByText("3rd")).toBeTruthy();
    expect(screen.getByText("4th")).toBeTruthy();
  });

  it("shows driver names from mock telemetry", () => {
    render(<BroadcastTowerWidget editMode telemetryMode="mock" />);
    expect(screen.getByText("ALPINE")).toBeTruthy();
    expect(screen.getByText("PORSCHE PENSKE")).toBeTruthy();
    expect(screen.getByText("FERRARI AF")).toBeTruthy();
    expect(screen.getByText("CADILLAC RACING")).toBeTruthy();
  });
});
