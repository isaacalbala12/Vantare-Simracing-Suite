import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LauncherPage } from "./LauncherPage";

vi.mock("../components/LauncherCard", () => ({
  LauncherCard: () => <div data-testid="launcher-card">LauncherCard</div>,
}));

afterEach(() => cleanup());

describe("LauncherPage", () => {
  it("renders the launcher heading and real launcher card", () => {
    render(<LauncherPage />);
    expect(screen.getByRole("heading", { name: "Launcher" })).toBeTruthy();
    expect(screen.getByTestId("launcher-card")).toBeTruthy();
  });

  it("renders honest placeholders for advanced launcher profiles", () => {
    render(<LauncherPage />);
    expect(screen.getByText("Perfiles de lanzamiento avanzados")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Apps asociadas" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /próximamente/i }).length).toBeGreaterThan(0);
  });

  it("does not render fake detected apps count", () => {
    render(<LauncherPage />);
    expect(screen.queryByText(/8 \/ 8/i)).toBeNull();
    expect(screen.queryByText(/CrewChief/i)).toBeNull();
    expect(screen.queryByText(/Spotify/i)).toBeNull();
  });
});
