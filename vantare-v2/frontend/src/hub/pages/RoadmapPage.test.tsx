import { vi } from "vitest";

const mockUseAccess = vi.fn(() => ({
  planLabel: "free",
  planStatus: "free",
  roles: [] as string[],
  isBlocked: false,
  isUnconfigured: false,
}));

vi.mock("../../lib/access", () => ({
  useAccess: () => mockUseAccess(),
}));

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RoadmapPage } from "./RoadmapPage";

beforeEach(() => {
  mockUseAccess.mockReturnValue({
    planLabel: "free",
    planStatus: "free",
    roles: [],
    isBlocked: false,
    isUnconfigured: false,
  });
  // El roadmap se trae por fetch en runtime; en tests usamos el fallback
  // empaquetado para no tocar la red.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("no network in tests")),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RoadmapPage", () => {
  it("renders heading from i18n", () => {
    render(<RoadmapPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Desarrollo Vantare" })).toBeTruthy();
  });

  it("renders dataset toggle", () => {
    render(<RoadmapPage />);
    expect(screen.getByText("Roadmap actual")).toBeTruthy();
    expect(screen.getByText("Desarrollo por features")).toBeTruthy();
  });

  it("switches dataset when toggle clicked", () => {
    render(<RoadmapPage />);
    fireEvent.click(screen.getByText("Desarrollo por features"));
    expect(screen.getByText("Features por área")).toBeTruthy();
  });

  it("hero buttons are external links (not disabled)", () => {
    render(<RoadmapPage />);
    const suggest = screen.getByText("Sugerir feature").closest("a");
    const changelog = screen.getByText("Ver changelog").closest("a");
    expect(suggest?.hasAttribute("disabled")).toBe(false);
    expect(changelog?.hasAttribute("disabled")).toBe(false);
    expect(suggest?.getAttribute("href")).toContain("github.com");
    expect(changelog?.getAttribute("href")).toContain("docs/changelog.md");
  });

  it("renders current phase from getCurrentPhase", () => {
    render(<RoadmapPage />);
    expect(screen.getAllByText(/Pulido beta/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders all current phases", () => {
    render(<RoadmapPage />);
    expect(screen.getByText("Beta pública")).toBeTruthy();
    expect(screen.getByText("Ingeniero Vantare")).toBeTruthy();
    expect(screen.getByText("Ecosistema")).toBeTruthy();
  });

  it("renders area progress bars", () => {
    render(<RoadmapPage />);
    expect(screen.getByText("Overlays Studio")).toBeTruthy();
    expect(screen.getByText("Launcher LMU")).toBeTruthy();
    expect(screen.getByText("Calendario local")).toBeTruthy();
    expect(screen.getByText("Ingeniero")).toBeTruthy();
    expect(screen.getByText("Telemetría")).toBeTruthy();
    expect(screen.getByText("UI v5.2")).toBeTruthy();
  });

  it("renders overall progress percentage on the scale", () => {
    render(<RoadmapPage />);
    // current areas: 75+75+25+25+10+75 = 285 / 6 = 47.5 -> nearestOnScale -> 50
    expect(screen.getAllByText("50%").length).toBeGreaterThanOrEqual(1);
  });

  it("renders milestones", () => {
    render(<RoadmapPage />);
    expect(screen.getAllByText("v0.1.0.2 publicado").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Hub v5.2 en migración").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Launcher LMU disponible").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Roadmap público planificado").length).toBeGreaterThanOrEqual(1);
  });

  it("renders recent changelog section", () => {
    render(<RoadmapPage />);
    expect(screen.getByText("Cambios recientes")).toBeTruthy();
    expect(screen.getAllByText("v0.1.0.2 publicado").length).toBeGreaterThanOrEqual(1);
    const allLink = screen.getByText("Changelog completo →").closest("a");
    expect(allLink?.getAttribute("href")).toContain("docs/changelog.md");
  });

  it("Changelog completo link is not disabled", () => {
    render(<RoadmapPage />);
    const allLink = screen.getByText("Changelog completo →").closest("a");
    expect(allLink?.hasAttribute("disabled")).toBe(false);
  });

  it("shows locked state for feedback on free user", () => {
    render(<RoadmapPage />);
    expect(screen.getByTestId("roadmap-feedback-locked")).toBeTruthy();
    expect(screen.getByText(/testers y planes de pago/i)).toBeTruthy();
    expect(screen.queryByText("Enviar a GitHub")).toBeNull();
  });

  it("renders Estado actual for in-progress phase", () => {
    render(<RoadmapPage />);
    const estadoActual = screen.getAllByText("Estado actual");
    expect(estadoActual.length).toBeGreaterThanOrEqual(1);
  });

  it("renders feedback title", () => {
    render(<RoadmapPage />);
    expect(screen.getByText("El roadmap vive con feedback")).toBeTruthy();
  });
});

describe("RoadmapPage access gating", () => {
  it("shows feedback panel for paid overlays user", () => {
    mockUseAccess.mockReturnValue({
      planLabel: "paid_overlays",
      planStatus: "active",
      roles: [],
      isBlocked: false,
      isUnconfigured: false,
    });
    render(<RoadmapPage />);
    expect(screen.queryByTestId("roadmap-feedback-locked")).toBeNull();
    expect(screen.getByText("Enviar a GitHub")).toBeTruthy();
    expect(screen.getByText(/Se abrirá tu cliente externo/i)).toBeTruthy();
  });

  it("shows feedback panel for tester user on free plan", () => {
    mockUseAccess.mockReturnValue({
      planLabel: "free",
      planStatus: "free",
      roles: ["tester"],
      isBlocked: false,
      isUnconfigured: false,
    });
    render(<RoadmapPage />);
    expect(screen.queryByTestId("roadmap-feedback-locked")).toBeNull();
    expect(screen.getByText("Enviar a GitHub")).toBeTruthy();
  });

  it("shows locked state for blocked user on premium feature", () => {
    mockUseAccess.mockReturnValue({
      planLabel: "suite",
      planStatus: "blocked",
      roles: [],
      isBlocked: true,
      isUnconfigured: false,
    });
    render(<RoadmapPage />);
    expect(screen.getByTestId("roadmap-feedback-locked")).toBeTruthy();
  });

  it("opens GitHub issue URL with title/body on send", () => {
    mockUseAccess.mockReturnValue({
      planLabel: "paid_overlays",
      planStatus: "active",
      roles: [],
      isBlocked: false,
      isUnconfigured: false,
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<RoadmapPage />);
    const textarea = screen.getByDisplayValue("");
    fireEvent.change(textarea, { target: { value: "El overlay parpadea" } });
    fireEvent.click(screen.getByText("Enviar a GitHub"));
    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = String(openSpy.mock.calls[0][0]);
    expect(url).toContain("github.com/isaacalbala12");
    expect(url).toContain("title=");
    expect(url).toContain("body=");
    expect(url).toContain(encodeURIComponent("El overlay parpadea"));
  });
});
