import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RoadmapPage } from "./RoadmapPage";

afterEach(() => cleanup());

describe("RoadmapPage", () => {
  it("renders heading Roadmap", () => {
    render(<RoadmapPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Desarrollo Vantare" })).toBeTruthy();
  });

  it("renders hero badges", () => {
    render(<RoadmapPage />);
    expect(screen.getByText("v0.1 · pública")).toBeTruthy();
    expect(screen.getByText("Actualizado desde datos locales")).toBeTruthy();
  });

  it("hero buttons are disabled", () => {
    render(<RoadmapPage />);
    const suggestBtn = screen.getAllByText("Sugerir feature")[0].closest("button");
    const changelogBtn = screen.getByText("Ver changelog").closest("button");
    expect(suggestBtn?.hasAttribute("disabled")).toBe(true);
    expect(changelogBtn?.hasAttribute("disabled")).toBe(true);
  });

  it("does not render prohibited hero strings", () => {
    render(<RoadmapPage />);
    expect(screen.queryByText("Desarrollo 2026")).toBeNull();
    expect(screen.queryByText("v0.1.0.3")).toBeNull();
    expect(screen.queryByText("Q4 2026")).toBeNull();
    expect(screen.queryByText("+30 widgets")).toBeNull();
    expect(screen.queryByText("telemetria completa")).toBeNull();
    expect(screen.queryByText("4.99")).toBeNull();
    expect(screen.queryByText("9.99")).toBeNull();
    expect(screen.queryByText("24 votos")).toBeNull();
    expect(screen.queryByText("72%")).toBeNull();
  });

  it("renders current phase from getCurrentPhase", () => {
    render(<RoadmapPage />);
    const matches = screen.getAllByText(/Pulido beta/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders all ROADMAP_PHASES", () => {
    render(<RoadmapPage />);
    expect(screen.getByText("Beta publica")).toBeTruthy();
    const pulido = screen.getAllByText("Pulido beta v0.1.x");
    expect(pulido.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Ingeniero Vantare")).toBeTruthy();
    expect(screen.getByText("Ecosistema")).toBeTruthy();
  });

  it("renders area progress bars", () => {
    render(<RoadmapPage />);
    expect(screen.getByText("Overlays Studio")).toBeTruthy();
    expect(screen.getByText("Launcher LMU")).toBeTruthy();
    expect(screen.getByText("Calendario local")).toBeTruthy();
    expect(screen.getByText("Ingeniero")).toBeTruthy();
    expect(screen.getByText("Telemetria")).toBeTruthy();
    expect(screen.getByText("UI v5.2")).toBeTruthy();
  });

  it("renders Progreso global eyebrow", () => {
    render(<RoadmapPage />);
    expect(screen.getByText("Progreso global")).toBeTruthy();
  });

  it("renders overall progress percentage", () => {
    render(<RoadmapPage />);
    // overallProgress is computed from ROADMAP_AREAS: (55+60+15+12+5+70)/6 = 217/6 ≈ 36
    expect(screen.getByText("36%")).toBeTruthy();
  });

  it("renders milestones", () => {
    render(<RoadmapPage />);
    expect(screen.getByText("v0.1.0.2 publicado")).toBeTruthy();
    expect(screen.getByText("Hub v5.2 en migracion")).toBeTruthy();
    expect(screen.getByText("Launcher LMU disponible")).toBeTruthy();
    expect(screen.getByText("Roadmap publico planificado")).toBeTruthy();
  });

  it("renders Ultimos hitos eyebrow", () => {
    render(<RoadmapPage />);
    expect(screen.getByText("Últimos hitos")).toBeTruthy();
  });

  it("Changelog completo button is disabled", () => {
    render(<RoadmapPage />);
    const changelogBtn = screen.getByText("Changelog completo →").closest("button");
    expect(changelogBtn?.hasAttribute("disabled")).toBe(true);
  });

  it("feedback buttons are disabled", () => {
    render(<RoadmapPage />);
    const suggestBtn = screen.getAllByText("Sugerir feature")[1].closest("button");
    const voteBtn = screen.getByText("Votar prioridades").closest("button");
    expect(suggestBtn?.hasAttribute("disabled")).toBe(true);
    expect(voteBtn?.hasAttribute("disabled")).toBe(true);
  });

  it("shows honest feedback message", () => {
    render(<RoadmapPage />);
    expect(screen.getByText(/voting p[uú]blico se conectar[áa] m[aá]s adelante/i)).toBeTruthy();
    expect(screen.getByText(/por ahora el feedback va por Discord/i)).toBeTruthy();
  });

  it("does not render prohibited fake strings", () => {
    render(<RoadmapPage />);
    expect(screen.queryByText(/4\.99€/)).toBeNull();
    expect(screen.queryByText(/Q4 2026/)).toBeNull();
    expect(screen.queryByText(/v0\.1\.0\.3/)).toBeNull();
    expect(screen.queryByText(/\+30 widgets/)).toBeNull();
    expect(screen.queryByText(/telemetria completa/)).toBeNull();
    expect(screen.queryByText(/hace 2 días/)).toBeNull();
    expect(screen.queryByText(/Roadmap público \+ feedback/)).toBeNull();
    expect(screen.queryByText(/Calendario LMU rediseñado/)).toBeNull();
  });

  it("renders Roadmap beta eyebrow", () => {
    render(<RoadmapPage />);
    expect(screen.getByText("Roadmap beta")).toBeTruthy();
  });

  it("renders version range v0.1.x → futuro", () => {
    render(<RoadmapPage />);
    expect(screen.getByText("v0.1.x → futuro")).toBeTruthy();
  });

  it("renders Estado actual for in-progress phase", () => {
    render(<RoadmapPage />);
    const estadoActual = screen.getAllByText("Estado actual");
    expect(estadoActual.length).toBeGreaterThanOrEqual(1);
  });

  it("renders phase highlights from data", () => {
    render(<RoadmapPage />);
    // Roadmap editable desde datos locales is a highlight of phase 2 (in-progress)
    expect(screen.getByText("Roadmap editable desde datos locales")).toBeTruthy();
    // Calendario LMU y recordatorios locales is another highlight
    expect(screen.getByText("Calendario LMU y recordatorios locales")).toBeTruthy();
  });

  it("does not render prohibited fake strings in phases", () => {
    render(<RoadmapPage />);
    expect(screen.queryByText("Q2 → Q4 2026")).toBeNull();
    expect(screen.queryByText("3 de julio")).toBeNull();
    expect(screen.queryByText("Julio 2026")).toBeNull();
    expect(screen.queryByText("Agosto 2026")).toBeNull();
    expect(screen.queryByText("Q4 2026")).toBeNull();
    expect(screen.queryByText("+30 widgets")).toBeNull();
    expect(screen.queryByText("telemetria completa")).toBeNull();
    expect(screen.queryByText("v0.1.0.3")).toBeNull();
  });

  it("renders feedback title 'El roadmap vive con feedback'", () => {
    render(<RoadmapPage />);
    expect(screen.getByText("El roadmap vive con feedback")).toBeTruthy();
  });

  it("Votar prioridades button is disabled", () => {
    render(<RoadmapPage />);
    const voteBtn = screen.getByText("Votar prioridades").closest("button");
    expect(voteBtn?.hasAttribute("disabled")).toBe(true);
  });

  it("does not render prohibited fake strings in feedback", () => {
    render(<RoadmapPage />);
    expect(screen.queryByText("24 votos")).toBeNull();
    expect(screen.queryByText("72%")).toBeNull();
    expect(screen.queryByText("+23")).toBeNull();
    expect(screen.queryByText("+18")).toBeNull();
  });
});
