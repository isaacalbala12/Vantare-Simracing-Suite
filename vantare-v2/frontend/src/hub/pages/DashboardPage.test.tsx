import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const calendarCallOrder = vi.hoisted(() => [] as string[]);

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((name: string) => {
      if (name === "calendar:loaded") calendarCallOrder.push("subscribe");
      return vi.fn();
    }),
    Emit: vi.fn((name: string) => {
      if (name === "calendar:get") calendarCallOrder.push("request");
    }),
  },
}));
vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({
    locale: "es",
    t: (key: string) => key,
  }),
}));

vi.mock("../roadmap/projects-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../roadmap/projects-data")>();
  return {
    ...actual,
    fetchRoadmapProjectsDataset: vi.fn().mockResolvedValue({
      status: "remote-fresh",
      state: "remote-fresh",
      provenance: "remote",
      reason: null,
      dataset: {
        schemaVersion: 1,
        channel: "nightly",
        generatedAt: "2026-08-14T12:00:00Z",
        staleAfterSeconds: 86400,
        tabs: [{
          id: "product",
          label: { es: "Producto", en: "Product", pt: "Produto", it: "Prodotto" },
          projects: [{
            id: "connected-roadmap",
            title: { es: "Roadmap conectado", en: "Connected roadmap", pt: "Roadmap conectado", it: "Roadmap connessa" },
            progress: { done: 1, total: 2, percent: 50 },
            tasks: [
              { id: "done", title: "Terminado", status: "done", updatedAt: "2026-08-14T10:00:00Z" },
              { id: "active", title: "En curso", status: "in-progress", updatedAt: "2026-08-14T11:00:00Z" },
            ],
          }],
        }],
      },
    }),
  };
});

afterEach(() => {
  cleanup();
  calendarCallOrder.length = 0;
});

import { DashboardPage } from "./DashboardPage";

describe("DashboardPage — beta honest hub", () => {
  it("renders the hero banner with Vantare Beta title", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("dashboard-hero-banner")).toBeTruthy();
    expect(screen.getByText(/Vantare Beta/i)).toBeTruthy();
  });

  it("renders the runtime version and channel instead of a hardcoded release", () => {
    render(<DashboardPage version="v0.1.0.7-nightly.8" buildChannel="nightly" />);

    expect(screen.getByText("v0.1.0.7-nightly.8")).toBeTruthy();
    expect(screen.getByText("NIGHTLY")).toBeTruthy();
    expect(screen.queryByText("v0.1.0.2")).toBeNull();
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

  it("subscribes before requesting the calendar so an immediate response is not lost", () => {
    render(<DashboardPage />);

    expect(calendarCallOrder.slice(0, 2)).toEqual(["subscribe", "request"]);
  });



  it("renders Novedades Vantare section", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("dashboard-novedades")).toBeTruthy();
    expect(screen.getByText(/Novedades Vantare/i)).toBeTruthy();
  });

  it("renders news from the latest canonical release manifests", () => {
    render(<DashboardPage />);

    expect(screen.getByText("v0.1.0.7-nightly.8 · nightly")).toBeTruthy();
    expect(screen.getByText(/Broadcast Tower y perfiles Endurance más fiables/i)).toBeTruthy();
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

  it("renders current public roadmap data with its provenance", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Roadmap conectado")).toBeTruthy();
      expect(screen.getByTestId("dashboard-roadmap-provenance").textContent).toContain("Fuente remota actual");
    });
  });
});
