import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn(() => vi.fn()),
    Emit: vi.fn(),
  },
}));

vi.mock("../components/LastActivityCard", () => ({
  LastActivityCard: () => (
    <div data-testid="last-activity-card">
      <h2>Última actividad</h2>
      <p>Sin carreras registradas todavía.</p>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
});

import { DashboardPage } from "./DashboardPage";

describe("DashboardPage — beta honest hub", () => {
  it("renders the hero banner with Vantare Beta title", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("dashboard-hero-banner")).toBeTruthy();
    expect(screen.getByText(/Vantare Beta/i)).toBeTruthy();
  });

  it("renders Gestionar cuenta button in hero banner", () => {
    const onNavigate = vi.fn();
    render(<DashboardPage onNavigate={onNavigate} />);
    const btn = screen.getByText(/Gestionar cuenta/i);
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onNavigate).toHaveBeenCalledWith("setup");
  });

  it("renders Plan Free text in hero banner body", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/Plan Free/i)).toBeTruthy();
  });

  it("renders Acciones rapidas", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/Acciones r/i)).toBeTruthy();
  });

  it("renders v52 calendar strip with Próximas carreras heading", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("v52-calendar-strip")).toBeTruthy();
    expect(screen.getByText(/Próximas carreras/i)).toBeTruthy();
  });

  it("renders last activity card", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("last-activity-card")).toBeTruthy();
  });

  it("renders launcher card", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("launcher-card")).toBeTruthy();
  });

  it("renders the Ingeniero section", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("dashboard-engineer-section")).toBeTruthy();
    expect(screen.getByText(/Ingeniero Vantare/i)).toBeTruthy();
  });

  it("renders Novedades Vantare section", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("dashboard-novedades")).toBeTruthy();
    expect(screen.getByText(/Novedades Vantare/i)).toBeTruthy();
  });

  it("renders Simulador principal section", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("dashboard-main-sim")).toBeTruthy();
    expect(screen.getByText(/Simulador principal/i)).toBeTruthy();
  });

  it("does not render any fake data strings", () => {
    render(<DashboardPage />);
    expect(screen.queryByText(/Porsche/i)).toBeNull();
    expect(screen.queryByText(/iRating/i)).toBeNull();
    expect(screen.queryByText(/Vantare Pro/i)).toBeNull();
    expect(screen.queryByText(/4\.99/i)).toBeNull();
    expect(screen.queryByText(/9\.99/i)).toBeNull();
    expect(screen.queryByText(/Ecosistema/i)).toBeNull();
    expect(screen.queryByText(/CARRERAS RECIENTES/i)).toBeNull();
    expect(screen.queryByText(/Ops/i)).toBeNull();
    expect(screen.queryByText(/Sebring/i)).toBeNull();
    expect(screen.queryByText(/COTA/i)).toBeNull();
    expect(screen.queryByText(/Paul Ricard/i)).toBeNull();
    expect(screen.queryByText(/v0\.1\.0\.3 publicado/i)).toBeNull();
  });

  it("does not render prohibited fake strings from HTML v5.2", () => {
    render(<DashboardPage />);
    expect(screen.queryByText(/Sebring \(School\)/i)).toBeNull();
    expect(screen.queryByText(/COTA \(National\)/i)).toBeNull();
    expect(screen.queryByText(/Paul Ricard \(1A\)/i)).toBeNull();
    expect(screen.queryByText(/14h 22m/i)).toBeNull();
    expect(screen.queryByText(/Q4 2026/i)).toBeNull();
    expect(screen.queryByText(/iRacing y Assetto Corsa/i)).toBeNull();
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

  it("renders Ver roadmap CTA in Ingeniero section", () => {
    const onNavigate = vi.fn();
    render(<DashboardPage onNavigate={onNavigate} />);
    const cta = screen.getByText(/Ver roadmap/i);
    expect(cta).toBeTruthy();
    fireEvent.click(cta);
    expect(onNavigate).toHaveBeenCalledWith("roadmap");
  });
});
