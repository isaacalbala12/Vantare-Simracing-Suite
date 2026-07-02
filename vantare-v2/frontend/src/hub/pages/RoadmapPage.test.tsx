import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RoadmapPage } from "./RoadmapPage";

afterEach(() => cleanup());

describe("RoadmapPage", () => {
  it("renders heading Roadmap", () => {
    render(<RoadmapPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Roadmap publico" })).toBeTruthy();
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

  it("renders milestones", () => {
    render(<RoadmapPage />);
    expect(screen.getByText("v0.1.0.2 publicado")).toBeTruthy();
    expect(screen.getByText("Hub v5.2 en migracion")).toBeTruthy();
    expect(screen.getByText("Launcher LMU disponible")).toBeTruthy();
    expect(screen.getByText("Roadmap publico planificado")).toBeTruthy();
  });

  it("feedback buttons are disabled", () => {
    render(<RoadmapPage />);
    const suggestBtn = screen.getByText("Sugerir feature").closest("button");
    const voteBtn = screen.getByText("Votar prioridades").closest("button");
    expect(suggestBtn?.hasAttribute("disabled")).toBe(true);
    expect(voteBtn?.hasAttribute("disabled")).toBe(true);
  });

  it("shows honest feedback message", () => {
    render(<RoadmapPage />);
    expect(screen.getByText(/voting publico se conectara mas adelante/i)).toBeTruthy();
    expect(screen.getByText(/por ahora el feedback va por Discord/i)).toBeTruthy();
  });

  it("does not render prohibited fake strings", () => {
    render(<RoadmapPage />);
    expect(screen.queryByText(/4\.99€/)).toBeNull();
    expect(screen.queryByText(/Q4 2026/)).toBeNull();
    expect(screen.queryByText(/v0\.1\.0\.3 publicado/)).toBeNull();
    expect(screen.queryByText(/\+30 widgets/)).toBeNull();
    expect(screen.queryByText(/telemetria completa/)).toBeNull();
  });
});
