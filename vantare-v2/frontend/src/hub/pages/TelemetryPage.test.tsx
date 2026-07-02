import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TelemetryPage } from "./TelemetryPage";

afterEach(() => cleanup());

describe("TelemetryPage", () => {
  it("renders an honest telemetry placeholder", () => {
    render(<TelemetryPage />);

    expect(screen.getByRole("heading", { name: "Telemetría" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Próximamente" })).toBeTruthy();
    expect(screen.getByText(/en desarrollo/i)).toBeTruthy();
    expect(screen.getByText(/velocidad, rpm, throttle, freno/i)).toBeTruthy();
    expect(screen.getByText(/LMU live\/session data/i)).toBeTruthy();
  });

  it("does not promise fake dates, charts, or live data", () => {
    render(<TelemetryPage />);

    expect(screen.queryByText(/Q1 2027/i)).toBeNull();
    expect(screen.queryByText(/datos reales conectados/i)).toBeNull();
    expect(screen.queryByText(/iRating/i)).toBeNull();
    expect(screen.queryByText(/Safety/i)).toBeNull();
    expect(screen.queryByText(/charts? falsos/i)).toBeNull();
  });

  it("does not use full-height hero (min-h-[calc(100vh-180px)])", () => {
    const { container } = render(<TelemetryPage />);
    expect(container.innerHTML).not.toContain('calc(100vh-180px)');
    expect(container.innerHTML).not.toContain('min-h-[calc');
  });
});
