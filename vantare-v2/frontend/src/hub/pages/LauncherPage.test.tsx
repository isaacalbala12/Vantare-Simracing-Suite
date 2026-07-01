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

  it("renders a disabled 'Crear perfil personalizado' button", () => {
    render(<LauncherPage />);
    const btn = screen.getByRole("button", { name: /crear perfil personalizado/i });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not render fake detected apps count", () => {
    render(<LauncherPage />);
    expect(screen.queryByText(/8 \/ 8/i)).toBeNull();
    expect(screen.queryByText(/CrewChief/i)).toBeNull();
    expect(screen.queryByText(/Spotify/i)).toBeNull();
  });

  it("does not render fake detected app versions or fake launch profiles", () => {
    render(<LauncherPage />);

    expect(screen.queryByText(/8 \/ 8/i)).toBeNull();
    expect(screen.queryByText(/CrewChief/i)).toBeNull();
    expect(screen.queryByText(/Spotify/i)).toBeNull();
    expect(screen.queryByText(/v30\.2/i)).toBeNull();
    expect(screen.queryByText(/Último uso/i)).toBeNull();
    expect(screen.queryByText(/Endurance/i)).toBeNull();
  });
});
