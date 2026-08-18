import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../../i18n/I18nProvider";
import { ROADMAP_FALLBACK, pickText } from "../../roadmap/roadmap-data";
import { RoadmapOrbitPage } from "../RoadmapOrbitPage";
import { RoadmapDirectionA } from "./RoadmapDirectionA";
import { RoadmapDirectionB } from "./RoadmapDirectionB";
import {
  currentPhase,
  deriveNextStep,
  milestoneAnchor,
  nextPhase,
  readRoadmapDirection,
  stationOffset,
} from "./roadmap-direction-model";

const es = (value: Parameters<typeof pickText>[0]) => pickText(value, "es");

function mount(
  Direction: typeof RoadmapDirectionA | typeof RoadmapDirectionB,
  options: { slot?: boolean } = {},
) {
  let slot: HTMLElement | null = null;
  if (options.slot) {
    slot = document.createElement("div");
    document.body.appendChild(slot);
  }
  render(
    <I18nProvider>
      <Direction
        channel="nightly"
        contextSlot={slot}
        data={ROADMAP_FALLBACK}
        projects={null}
        sourceState="remote"
      />
    </I18nProvider>,
  );
  return slot;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  window.localStorage.clear();
});

describe("modelo de las direcciones de rework", () => {
  it("lee `?roadmapDir` y solo acepta `a` y `b`", () => {
    expect(readRoadmapDirection("?roadmapDir=a")).toBe("a");
    expect(readRoadmapDirection("?view=roadmap&roadmapDir=B")).toBe("b");
    expect(readRoadmapDirection("?roadmapDir=c")).toBeNull();
    expect(readRoadmapDirection("")).toBeNull();
  });

  it("ancla cada hito a la primera fase con su mismo estado derivado", () => {
    const release = ROADMAP_FALLBACK.milestones.find((m) => m.type === "release")!;
    const plan = ROADMAP_FALLBACK.milestones.find((m) => m.type === "plan")!;
    const feature = ROADMAP_FALLBACK.milestones.find((m) => m.type === "feature")!;
    expect(milestoneAnchor(release, ROADMAP_FALLBACK.phases)?.status).toBe("done");
    expect(milestoneAnchor(plan, ROADMAP_FALLBACK.phases)?.status).toBe("planned");
    expect(milestoneAnchor(feature, ROADMAP_FALLBACK.phases)?.status).toBe("in-progress");
    expect(milestoneAnchor(release, [])).toBeNull();
  });

  it("reparte las estaciones por el centro de su columna", () => {
    expect(stationOffset(0, 4)).toBeCloseTo(12.5);
    expect(stationOffset(3, 4)).toBeCloseTo(87.5);
    expect(stationOffset(0, 0)).toBe(50);
  });

  it("deriva el próximo paso del primer highlight que menciona el área", () => {
    const telemetry = ROADMAP_FALLBACK.areas.find((area) => area.id === "telemetry")!;
    const step = deriveNextStep(telemetry, ROADMAP_FALLBACK.phases, es);
    expect(step).not.toBeNull();
    expect(step!.phase.status).not.toBe("done");
    expect(step!.text.toLowerCase()).toContain("telemetr");
    // El texto siempre sale de la fuente, nunca de la pantalla.
    expect(
      ROADMAP_FALLBACK.phases.some((phase) =>
        phase.highlights.some((highlight) => es(highlight) === step!.text),
      ),
    ).toBe(true);
  });

  it("no inventa un paso cuando ningún highlight menciona el área", () => {
    const calendar = ROADMAP_FALLBACK.areas.find((area) => area.id === "calendar-local")!;
    expect(deriveNextStep(calendar, ROADMAP_FALLBACK.phases, es)).toBeNull();
  });
});

describe("RoadmapDirectionA · Trayecto", () => {
  it("pinta una estación por fase y una parada por hito, con los datos de la fuente", () => {
    mount(RoadmapDirectionA);
    const rail = screen.getByTestId("orbit-rmd-a-rail");
    for (const phase of ROADMAP_FALLBACK.phases) {
      const station = within(rail).getByTestId(`orbit-rmd-a-station-${phase.id}`);
      expect(station.textContent).toContain(es(phase.title));
      expect(station.textContent).toContain(String(phase.progress));
    }
    for (const milestone of ROADMAP_FALLBACK.milestones) {
      expect(within(rail).getByTestId(`orbit-rmd-a-stop-${milestone.id}`)).toBeTruthy();
    }
    expect(screen.getByTestId("orbit-rmd-a-areas").children).toHaveLength(
      ROADMAP_FALLBACK.areas.length,
    );
  });

  it("resume la fase en curso en «Ahora» y la siguiente en «Siguiente»", () => {
    mount(RoadmapDirectionA);
    const now = screen.getByTestId("orbit-rmd-a-now");
    const active = currentPhase(ROADMAP_FALLBACK.phases)!;
    expect(now.textContent).toContain(es(active.title));
    expect(now.querySelectorAll(".orbit-rmd-check li")).toHaveLength(active.highlights.length);
    // Y los hitos anclados a esa fase, con la misma regla que la vía.
    const anchored = ROADMAP_FALLBACK.milestones.filter(
      (milestone) => milestoneAnchor(milestone, ROADMAP_FALLBACK.phases)?.id === active.id,
    );
    expect(now.querySelectorAll(".orbit-rmd-focus__stops li")).toHaveLength(anchored.length);

    const next = screen.getByTestId("orbit-rmd-a-next");
    expect(next.textContent).toContain(es(nextPhase(ROADMAP_FALLBACK.phases)!.title));
  });

  it("enfoca la estación desde la columna, y solo una a la vez", () => {
    const slot = mount(RoadmapDirectionA, { slot: true })!;
    const rows = within(slot).getByTestId("orbit-rmd-a-context-phases").querySelectorAll(".orbit-row");
    expect(rows).toHaveLength(ROADMAP_FALLBACK.phases.length);

    const target = ROADMAP_FALLBACK.phases[2];
    fireEvent.click(rows[2]);
    expect(screen.getByTestId(`orbit-rmd-a-station-${target.id}`).dataset.focus).toBe("true");
    expect(document.querySelectorAll('.orbit-rmd-station[data-focus="true"]')).toHaveLength(1);

    // Un hito enfoca la fase donde está anclado.
    const stops = within(slot).getByTestId("orbit-rmd-a-context-stops").querySelectorAll(".orbit-row");
    expect(stops).toHaveLength(ROADMAP_FALLBACK.milestones.length);
    fireEvent.click(stops[0]);
    const anchor = milestoneAnchor(ROADMAP_FALLBACK.milestones[0], ROADMAP_FALLBACK.phases)!;
    expect(screen.getByTestId(`orbit-rmd-a-station-${anchor.id}`).dataset.focus).toBe("true");
  });

  it("dice de dónde viene la fuente y no usa `title` nativo", () => {
    const slot = mount(RoadmapDirectionA, { slot: true })!;
    expect(screen.getByTestId("orbit-roadmap-status").textContent).toBe(
      "Fuente disponible · v0.1.x",
    );
    expect(screen.getByTestId("orbit-roadmap-direction-a").querySelectorAll("[title]")).toHaveLength(0);
    expect(slot.querySelectorAll("[title]")).toHaveLength(0);
  });
});

describe("RoadmapDirectionB · Tablero", () => {
  it("destaca la fase en curso con su dial, sus frentes y sus highlights", () => {
    mount(RoadmapDirectionB);
    const active = currentPhase(ROADMAP_FALLBACK.phases)!;
    const featured = screen.getByTestId("orbit-rmd-b-featured");
    expect(featured.textContent).toContain(es(active.title));
    expect(featured.textContent).toContain(es(active.target));
    expect(featured.textContent).toContain(`${active.progress} %`);
    expect(within(featured).getAllByRole("listitem")).toHaveLength(active.highlights.length);
    expect(screen.getByTestId("orbit-rmd-b-fronts").textContent).toContain(
      `${active.highlights.length} frentes abiertos`,
    );
  });

  it("pinta un hito por cada uno declarado y una tarjeta por área", () => {
    mount(RoadmapDirectionB);
    expect(screen.getByTestId("orbit-rmd-b-milestones").children).toHaveLength(
      ROADMAP_FALLBACK.milestones.length,
    );
    expect(screen.getByTestId("orbit-rmd-b-areas").children).toHaveLength(
      ROADMAP_FALLBACK.areas.length,
    );
  });

  it("marca como derivado el próximo paso y lo omite cuando no hay ninguno", () => {
    mount(RoadmapDirectionB);
    const telemetry = screen.getByTestId("orbit-rmd-b-area-telemetry");
    expect(telemetry.textContent).toContain("Próximo paso");
    expect(telemetry.textContent).toContain("derivado");

    const calendar = screen.getByTestId("orbit-rmd-b-area-calendar-local");
    expect(calendar.textContent).toContain("La fuente no declara ningún paso para esta área.");
  });

  it("el segmentado reordena las áreas por avance sin cambiar cuántas hay", () => {
    mount(RoadmapDirectionB);
    const first = () =>
      screen.getByTestId("orbit-rmd-b-areas").firstElementChild!.getAttribute("data-testid");
    const declared = first();

    fireEvent.click(screen.getByRole("button", { name: "Por área" }));
    const board = screen.getByTestId("orbit-rmd-b-areas");
    expect(board.children).toHaveLength(ROADMAP_FALLBACK.areas.length);
    const values = [...board.children].map((node) =>
      Number(node.querySelector(".orbit-rmd-b-area__pct")!.textContent!.replace(/\D/g, "")),
    );
    expect([...values].sort((a, b) => b - a)).toEqual(values);

    fireEvent.click(screen.getByRole("button", { name: "Por fase" }));
    expect(first()).toBe(declared);
  });

  it("cambia de idioma con el hub y no usa `title` nativo", () => {
    window.localStorage.setItem("vantare.locale", "en");
    const slot = mount(RoadmapDirectionB, { slot: true })!;
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Roadmap");
    expect(screen.getByTestId("orbit-rmd-b-featured").textContent).toContain("Beta polish v0.1.x");
    expect(screen.getByTestId("orbit-roadmap-direction-b").querySelectorAll("[title]")).toHaveLength(0);
    expect(slot.querySelectorAll("[title]")).toHaveLength(0);
  });
});

describe("RoadmapOrbitPage · selección de dirección", () => {
  it("sin dirección sigue pintando la vista actual", () => {
    render(
      <I18nProvider>
        <RoadmapOrbitPage dataset={ROADMAP_FALLBACK} sourceState="remote" />
      </I18nProvider>,
    );
    expect(screen.getByTestId("orbit-roadmap")).toBeTruthy();
    expect(screen.queryByTestId("orbit-roadmap-direction-a")).toBeNull();
    expect(screen.queryByTestId("orbit-roadmap-direction-b")).toBeNull();
  });

  it("pinta la dirección pedida en vez de la vista actual", () => {
    const { rerender } = render(
      <I18nProvider>
        <RoadmapOrbitPage dataset={ROADMAP_FALLBACK} direction="a" sourceState="remote" />
      </I18nProvider>,
    );
    expect(screen.getByTestId("orbit-roadmap-direction-a")).toBeTruthy();
    expect(screen.queryByTestId("orbit-roadmap")).toBeNull();

    rerender(
      <I18nProvider>
        <RoadmapOrbitPage dataset={ROADMAP_FALLBACK} direction="b" sourceState="remote" />
      </I18nProvider>,
    );
    expect(screen.getByTestId("orbit-roadmap-direction-b")).toBeTruthy();
  });
});
