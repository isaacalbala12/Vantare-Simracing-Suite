import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn(() => vi.fn()),
    Emit: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
});

import { DashboardPage } from "./DashboardPage";

describe("DashboardPage — beta honest hub", () => {
  it("renders Plan Free card", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/Plan Free/i)).toBeTruthy();
  });

  it("renders Acciones rapidas", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/Acciones r/i)).toBeTruthy();
  });

  it("renders empty activity placeholder", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/sin carreras registradas/i)).toBeTruthy();
  });

  it("renders empty next race placeholder", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/calendario LMU no cargado todavía/i)).toBeTruthy();
  });

  it("renders empty launcher card", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("launcher-card")).toBeTruthy();
    expect(screen.getByText(/Launcher LMU por configurar/i)).toBeTruthy();
  });

  it("does not render any fake data strings", () => {
    render(<DashboardPage />);
    expect(screen.queryByText(/Porsche/i)).toBeNull();
    expect(screen.queryByText(/iRating/i)).toBeNull();
    expect(screen.queryByText(/Vantare Pro/i)).toBeNull();
    expect(screen.queryByText(/Ecosistema/i)).toBeNull();
    expect(screen.queryByText(/CARRERAS RECIENTES/i)).toBeNull();
    expect(screen.queryByText(/Ops/i)).toBeNull();
  });

  it("renders the ActiveOverlayCard placeholder (loading) by default", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("active-overlay-card")).toBeTruthy();
    expect(screen.getByText(/Cargando estado/i)).toBeTruthy();
    expect(screen.queryByTestId("active-overlay-open")).toBeNull();
  });

  it("renders RecommendedQuickStart primary CTA when no active profile", () => {
    const onUseRecommended = vi.fn();
    render(
      <DashboardPage
        onNavigate={vi.fn()}
        onUseRecommended={onUseRecommended}
      />,
    );
    const cta = screen.getByTestId("recommended-quickstart-cta");
    fireEvent.click(cta);
    expect(onUseRecommended).toHaveBeenCalledTimes(1);
  });
});
