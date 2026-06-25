import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, afterEach } from "vitest";
import { PedalsWidget } from "./PedalsWidget";

describe("PedalsWidget", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders exactly three pedal bars (clt, brk, thr)", () => {
    render(<PedalsWidget editMode={true} updateHz={30} />);
    expect(screen.getByTestId("pedal-bar-clt")).toBeTruthy();
    expect(screen.getByTestId("pedal-bar-brk")).toBeTruthy();
    expect(screen.getByTestId("pedal-bar-thr")).toBeTruthy();
    expect(screen.queryByTestId("pedals-gear")).toBeNull();
  });

  it("does not render gear block, steering svg or history canvas", () => {
    const { container } = render(<PedalsWidget editMode={true} updateHz={30} />);
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[data-testid='pedals-gear']")).toBeNull();
  });

  it("renders transparent background by default", () => {
    render(<PedalsWidget editMode={true} updateHz={30} />);
    const root = screen.getByTestId("pedals-widget");
    expect(root.style.background).toBe("transparent");
  });

  it("applies explicit backgroundColor when set", () => {
    render(
      <PedalsWidget
        editMode={true}
        updateHz={30}
        props={{ appearance: { backgroundColor: "#1a0104" } }}
      />,
    );
    const root = screen.getByTestId("pedals-widget");
    expect(root.style.background).toBe("#1a0104");
  });

  it("applies custom pedal colors to fills", () => {
    render(
      <PedalsWidget
        editMode={true}
        updateHz={30}
        props={{
          appearance: {
            pedalThrottleColor: "#00ff00",
            pedalBrakeColor: "#0000ff",
            pedalClutchColor: "#ff0000",
          },
        }}
      />,
    );
    const thrFill = screen.getByTestId("pedal-bar-thr").firstChild as HTMLElement;
    const brkFill = screen.getByTestId("pedal-bar-brk").firstChild as HTMLElement;
    const cltFill = screen.getByTestId("pedal-bar-clt").firstChild as HTMLElement;
    expect(thrFill.style.background).toBe("#00ff00");
    expect(brkFill.style.background).toBe("#0000ff");
    expect(cltFill.style.background).toBe("#ff0000");
  });

  it("uses dark track background for empty bars", () => {
    render(<PedalsWidget editMode={true} updateHz={30} />);
    expect(screen.getByTestId("pedal-bar-thr").style.background).toBe("#0a0a0a");
  });

  it("never exceeds 100% or goes negative with mock telemetry", () => {
    render(<PedalsWidget editMode={true} updateHz={30} />);
    const thrFill = screen.getByTestId("pedal-bar-thr").firstChild as HTMLElement;
    const pct = parseInt(thrFill.style.height || "0", 10);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });
});
