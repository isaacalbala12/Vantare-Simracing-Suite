import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TelemetryPage } from "./TelemetryPage";

afterEach(() => cleanup());

describe("TelemetryPage", () => {
  it("renders an honest telemetry placeholder", () => {
    render(<TelemetryPage />);

    expect(screen.getByRole("heading", { name: "Telemetría" })).toBeTruthy();
    expect(screen.getByText(/en desarrollo/i)).toBeTruthy();
    expect(screen.getByText(/velocidad, rpm, throttle, freno/i)).toBeTruthy();
  });

  it("does not promise fake dates or live data", () => {
    render(<TelemetryPage />);

    expect(screen.queryByText(/Q1 2027/i)).toBeNull();
    expect(screen.queryByText(/datos reales conectados/i)).toBeNull();
    expect(screen.queryByText(/iRating/i)).toBeNull();
  });
});
