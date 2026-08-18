import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { RoadmapOrbitPage, type RoadmapChannel } from "./RoadmapOrbitPage";
import { ROADMAP_FALLBACK } from "../roadmap/roadmap-data";
import { countAreas, milestoneState, visualState } from "./roadmap-orbit-model";

function mount(options: { locale?: string; channel?: RoadmapChannel } = {}) {
  if (options.locale) window.localStorage.setItem("vantare.locale", options.locale);
  return render(
    <I18nProvider>
      <RoadmapOrbitPage
        channel={options.channel}
        dataset={ROADMAP_FALLBACK}
        sourceState="remote"
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("RoadmapOrbitPage", () => {
  it("pinta fases, áreas e hitos tal y como los declara la fuente", () => {
    mount();
    const phases = screen.getByTestId("orbit-roadmap-phases");
    expect(within(phases).getAllByRole("article", { hidden: true }).length).toBe(
      ROADMAP_FALLBACK.phases.length,
    );
    for (const phase of ROADMAP_FALLBACK.phases) {
      const node = screen.getByTestId(`orbit-roadmap-phase-${phase.id}`);
      expect(node.dataset.state).toBe(visualState(phase.status));
      expect(within(node).getByRole("heading", { level: 3 }).textContent).toBe(phase.title.es);
      expect(within(node).getAllByRole("listitem")).toHaveLength(phase.highlights.length);
    }
    expect(screen.getByTestId("orbit-roadmap-areas").children).toHaveLength(
      ROADMAP_FALLBACK.areas.length,
    );
    expect(screen.getByTestId("orbit-roadmap-milestones").children).toHaveLength(
      ROADMAP_FALLBACK.milestones.length,
    );
    // Ningún texto de contenido lo escribe la pantalla.
    expect(screen.getByText(ROADMAP_FALLBACK.milestones[0].body.es)).toBeTruthy();
  });

  it("resume la fase actual, las áreas, los hitos y el canal", () => {
    mount({ channel: "nightly" });
    expect(screen.getAllByText("Pulido beta v0.1.x").length).toBeGreaterThan(0);
    const counts = countAreas(ROADMAP_FALLBACK.areas);
    expect(
      screen.getByText(`${counts.active} en curso · ${counts.planned} planificadas`),
    ).toBeTruthy();
    expect(screen.getByTestId("orbit-roadmap-channel").textContent).toBe("Nightly");
    expect(screen.getByTestId("orbit-roadmap-status").textContent).toBe(
      "Fuente disponible · v0.1.x",
    );
  });

  it("cambia de idioma con el hub y usa la traducción del propio JSON", () => {
    mount({ locale: "en" });
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Roadmap");
    expect(screen.getByText("Public beta")).toBeTruthy();
    expect(screen.getAllByText("Beta polish v0.1.x").length).toBeGreaterThan(0);
    expect(screen.getByTestId("orbit-roadmap-status").textContent).toBe(
      "Source available · v0.1.x",
    );
  });

  it("no usa el atributo `title` nativo en ninguna parte de la vista", () => {
    mount();
    expect(screen.getByTestId("orbit-roadmap").querySelectorAll("[title]")).toHaveLength(0);
  });

  it("deriva el estado del hito de su tipo, que es el único dato declarado", () => {
    expect(milestoneState({ ...ROADMAP_FALLBACK.milestones[0], type: "release" })).toBe("done");
    expect(milestoneState({ ...ROADMAP_FALLBACK.milestones[0], type: "feature" })).toBe("active");
    expect(milestoneState({ ...ROADMAP_FALLBACK.milestones[0], type: "plan" })).toBe("planned");
  });
});

describe("RoadmapOrbitPage · columna contextual", () => {
  function mountWithSlot() {
    const slot = document.createElement("div");
    slot.id = "orbit-roadmap-context-slot";
    document.body.appendChild(slot);
    const view = mount();
    return { slot, view };
  }

  afterEach(() => {
    document.getElementById("orbit-roadmap-context-slot")?.remove();
  });

  it("lista las fases con su porcentaje y enfoca la fase al pulsarla", async () => {
    mountWithSlot();
    const list = await screen.findByTestId("orbit-roadmap-context");
    const rows = list.querySelectorAll(".orbit-row");
    expect(rows).toHaveLength(ROADMAP_FALLBACK.phases.length);
    expect(list.textContent).toContain("75 %");

    const target = ROADMAP_FALLBACK.phases[2];
    expect(screen.getByTestId(`orbit-roadmap-phase-${target.id}`).dataset.focus).toBeUndefined();
    fireEvent.click(rows[2]);
    expect(screen.getByTestId(`orbit-roadmap-phase-${target.id}`).dataset.focus).toBe("true");
    // Solo una fase queda resaltada.
    expect(document.querySelectorAll('.orbit-rm-phase[data-focus="true"]')).toHaveLength(1);
  });
});
