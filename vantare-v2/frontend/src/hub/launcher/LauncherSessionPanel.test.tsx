import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LauncherSessionPanel } from "./LauncherSessionPanel";

const dispatchLauncherCommand = vi.fn();
vi.mock("./launcher-store", () => ({
  useLauncherSnapshot: () => ({
    activeChains: [{ profileId: "creator", status: "running", steps: [{ appId: "lmu", status: "ready" }] }],
  }),
  useLauncherStore: () => ({ dispatchLauncherCommand }),
}));

describe("LauncherSessionPanel", () => {
  it("renders accessible step state and close/restart controls", () => {
    render(<LauncherSessionPanel />);
    expect(screen.getByTestId("launcher-session-step-creator-0")).toBeTruthy();
    fireEvent.click(screen.getByTestId("launcher-session-close-creator"));
    expect(dispatchLauncherCommand).toHaveBeenCalledWith("launcher:app:close", { id: "creator", pid: 0 });
    fireEvent.click(screen.getByTestId("launcher-session-restart-creator"));
    expect(dispatchLauncherCommand).toHaveBeenCalledWith("launcher:app:restart", { id: "creator", pid: 0 });
  });
});
