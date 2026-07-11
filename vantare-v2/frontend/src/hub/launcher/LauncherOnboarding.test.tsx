import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LauncherOnboarding } from "./LauncherOnboarding";

describe("LauncherOnboarding", () => {
  it("explains detected readiness without adding apps and can be skipped", () => {
    const onComplete = vi.fn();
    render(<LauncherOnboarding apps={[{ id: "lmu", displayName: "LMU", abbreviation: "LMU", category: "simulator", launchMethod: "steam-uri", availability: { catalogued: true, found: true, installed: true, launchable: true }, gradientFrom: "#111", gradientTo: "#222" }]} onComplete={onComplete} />);
    expect(screen.getByText(/1 aplicaciones listas/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("launcher-onboarding-skip"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
