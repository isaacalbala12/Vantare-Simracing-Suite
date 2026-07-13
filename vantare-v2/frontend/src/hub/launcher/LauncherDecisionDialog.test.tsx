import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LauncherDecisionDialog } from "./LauncherDecisionDialog";

describe("LauncherDecisionDialog", () => {
  it("offers one-time and remembered choices", () => {
    const onResolve = vi.fn();
    render(<LauncherDecisionDialog open appName="OBS Studio" onResolve={onResolve} />);
    fireEvent.click(screen.getByTestId("launcher-decision-reuse"));
    expect(onResolve).toHaveBeenCalledWith("reuse", false);
    fireEvent.click(screen.getByTestId("launcher-decision-remember-restart"));
    expect(onResolve).toHaveBeenCalledWith("restart", true);
  });
});
