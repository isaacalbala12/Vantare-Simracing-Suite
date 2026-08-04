import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROADMAP_PROJECTS_FALLBACK } from "./projects-data";
import { RoadmapProjectTabs } from "./RoadmapProjectTabs";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RoadmapProjectTabs", () => {
  it("renders accessible tabs, projects and task status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<RoadmapProjectTabs />);
    expect(screen.getByText("Cargando proyectos…")).toBeTruthy();
    expect(await screen.findByTestId("roadmap-project-tabs")).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { selected: true }).textContent).toContain("Overlays y telemetría");
    expect(screen.getByTestId("roadmap-project-overlay-studio-v3")).toBeTruthy();
    expect(screen.getAllByText("Completado").length).toBeGreaterThan(0);
    expect(screen.getByText("Fuente remota no disponible · mostrando respaldo")).toBeTruthy();
  });

  it("supports roving keyboard navigation and long task lists", async () => {
    const payload = JSON.parse(JSON.stringify(ROADMAP_PROJECTS_FALLBACK));
    payload.tabs[0].projects[0].tasks = Array.from({ length: 9 }, (_, index) => ({
      id: `long-${index}`,
      title: `Task ${index}`,
      status: "planned",
      updatedAt: "2026-08-03T00:00:00Z",
    }));
    payload.tabs[0].projects[0].progress = { done: 0, total: 9, percent: 0 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    render(<RoadmapProjectTabs />);
    const tabs = await screen.findAllByRole("tab");
    tabs[0].focus();
    expect(document.activeElement).toBe(tabs[0]);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[1]);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[2]);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[0]);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs[2]);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(tabs[0]);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(tabs[2]);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    await waitFor(() => expect(screen.getByRole("tab", { selected: true }).textContent).toContain("Overlays y telemetría"));
    const projectCard = screen.getByTestId("roadmap-project-overlay-studio-v3");
    const showAll = within(projectCard).getByText("Ver todas");
    expect(showAll).toBeTruthy();
    expect(showAll.closest("li")).toBeNull();
    fireEvent.click(showAll);
    expect(screen.getByText("Task 8")).toBeTruthy();
    fireEvent.click(within(projectCard).getByText("Mostrar menos"));
    expect(screen.queryByText("Task 8")).toBeNull();
  });

  it("exposes determinate and taskless progress accessibly", async () => {
    const payload = JSON.parse(JSON.stringify(ROADMAP_PROJECTS_FALLBACK));
    payload.tabs[0].projects[0].tasks = [];
    payload.tabs[0].projects[0].progress = { done: 0, total: 0, percent: null };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    render(<RoadmapProjectTabs />);

    const emptyProject = await screen.findByTestId(`roadmap-project-${payload.tabs[0].projects[0].id}`);
    const emptyProgress = within(emptyProject).getByRole("progressbar");
    expect(emptyProgress.getAttribute("aria-valuemin")).toBe("0");
    expect(emptyProgress.getAttribute("aria-valuemax")).toBe("100");
    expect(emptyProgress.hasAttribute("aria-valuenow")).toBe(false);
    expect(emptyProgress.getAttribute("aria-valuetext")).toBe("Sin tareas");

    const determinateProject = screen.getByTestId(`roadmap-project-${payload.tabs[0].projects[1].id}`);
    const determinateProgress = within(determinateProject).getByRole("progressbar");
    expect(determinateProgress.getAttribute("aria-valuemin")).toBe("0");
    expect(determinateProgress.getAttribute("aria-valuemax")).toBe("100");
    expect(determinateProgress.getAttribute("aria-valuenow")).toBe(String(payload.tabs[0].projects[1].progress.percent));
  });

  it("shows invalid remote provenance while keeping the safe fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    render(<RoadmapProjectTabs />);
    expect(await screen.findByText("Fuente remota inválida · mostrando respaldo")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Plataforma" }));
    expect(screen.getByTestId("roadmap-project-billing")).toBeTruthy();
  });
});
