import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn(() => vi.fn()),
    Emit: vi.fn(),
  },
}));
vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({
    locale: "es",
    t: (key: string) => key,
  }),
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


  it("renders upcoming calendar panel with Próximas carreras heading", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("calendar-hero-upcoming-panel-empty")).toBeTruthy();
    expect(screen.getByText(/Próximas carreras/i)).toBeTruthy();
  });



  it("renders Novedades Vantare section", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("dashboard-novedades")).toBeTruthy();
    expect(screen.getByText(/Novedades Vantare/i)).toBeTruthy();
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



  it("renders Ver roadmap CTA in feature carousel", () => {
    const onNavigate = vi.fn();
    render(<DashboardPage onNavigate={onNavigate} />);
    expect(screen.getByTestId("dashboard-feature-carousel")).toBeTruthy();
    const cta = screen.getByText(/Ver roadmap/i);
    expect(cta).toBeTruthy();
    fireEvent.click(cta);
    expect(onNavigate).toHaveBeenCalledWith("roadmap");
  });
});
