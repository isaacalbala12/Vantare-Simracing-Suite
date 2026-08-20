import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { RoadmapOrbitPage, type RoadmapChannel } from "./RoadmapOrbitPage";
import { ROADMAP_FALLBACK } from "../roadmap/roadmap-data";
import { buildNarrative, milestoneState, visualState } from "./roadmap-orbit-model";

const NARRATIVE = buildNarrative(ROADMAP_FALLBACK);

function mount(
  options: { locale?: string; channel?: RoadmapChannel; doneOpen?: boolean } = {},
) {
  if (options.locale) window.localStorage.setItem("vantare.locale", options.locale);
  return render(
    <I18nProvider>
      <RoadmapOrbitPage
        channel={options.channel}
        dataset={ROADMAP_FALLBACK}
        doneOpen={options.doneOpen}
        sourceState="remote"
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("RoadmapOrbitPage · columna «Qué viene»", () => {
  it("pinta las tres secciones desde la fuente, y solo lo que la fuente declara", () => {
    mount();
    const now = screen.getByTestId("orbit-roadmap-now");
    const next = screen.getByTestId("orbit-roadmap-next");
    const done = screen.getByTestId("orbit-roadmap-done");

    // AHORA: la fase en curso, su versión y su checklist completa.
    const current = NARRATIVE.now!;
    expect(within(now).getByText(current.title.es)).toBeTruthy();
    expect(within(now).getByText(current.target.es)).toBeTruthy();
    expect(within(now).getByText(current.summary.es)).toBeTruthy();
    expect(
      within(screen.getByTestId("orbit-roadmap-highlights")).getAllByRole("listitem"),
    ).toHaveLength(current.highlights.length);

    // PRÓXIMO: las fases por planear y futuras, ninguna más.
    for (const phase of NARRATIVE.next) {
      const node = within(next).getByTestId(`orbit-roadmap-phase-${phase.id}`);
      expect(node.dataset.state).toBe(visualState(phase.status));
      expect(within(node).getByText(phase.title.es)).toBeTruthy();
    }
    expect(within(next).queryByTestId(`orbit-roadmap-phase-${current.id}`)).toBeNull();

    // HECHO: las fases completadas y los hitos publicados.
    for (const phase of NARRATIVE.done) {
      expect(within(done).getByTestId(`orbit-roadmap-phase-${phase.id}`)).toBeTruthy();
    }
    for (const milestone of NARRATIVE.doneMilestones) {
      expect(within(done).getByTestId(`orbit-roadmap-milestone-${milestone.id}`)).toBeTruthy();
    }

    // Ningún texto de contenido lo escribe la pantalla.
    expect(screen.getByText(ROADMAP_FALLBACK.milestones[0].body.es)).toBeTruthy();
  });

  it("no pinta ningún porcentaje ni barra de progreso", () => {
    mount({ doneOpen: true });
    const root = screen.getByTestId("orbit-roadmap");
    // El bloque de entregas cita asuntos de commit literales, y uno puede
    // llevar un porcentaje suyo («28% mas rapido»). Lo que esta prueba
    // defiende es que la pantalla no publique los porcentajes de progreso del
    // roadmap, así que se mide sobre todo lo demás.
    const withoutDelivered = root.cloneNode(true) as HTMLElement;
    withoutDelivered.querySelector("[data-testid='orbit-roadmap-delivered']")?.remove();
    expect(withoutDelivered.textContent).not.toMatch(/\d+\s?%/);
    expect(root.querySelectorAll(".orbit-rm-phase__bar")).toHaveLength(0);
  });

  it("lista lo entregado recientemente agrupado por día y marcado como derivado", () => {
    mount({ doneOpen: true });
    const delivered = screen.getByTestId("orbit-roadmap-delivered");
    const days = ROADMAP_FALLBACK.delivered;
    expect(days.length).toBeGreaterThan(0);
    for (const day of days) {
      expect(within(delivered).getByTestId(`orbit-roadmap-delivered-${day.date}`)).toBeTruthy();
    }
    // El asunto del commit se publica tal cual: la pantalla no lo reescribe.
    expect(within(delivered).getAllByText(days[0].entries[0].text).length).toBeGreaterThan(0);
    // Sale de los commits, no del plan: la pantalla lo dice.
    expect(within(delivered).getByTestId("orbit-roadmap-derived")).toBeTruthy();
  });

  it("declara la posición de la fase en curso sin inventar una fecha", () => {
    mount();
    const index = ROADMAP_FALLBACK.phases.findIndex((p) => p.status === "in-progress") + 1;
    expect(screen.getByTestId("orbit-roadmap-position").textContent).toBe(
      `Fase ${index} de ${ROADMAP_FALLBACK.phases.length}`,
    );
  });

  it("marca como derivado el reparto de hitos, que la fuente no declara", () => {
    mount({ doneOpen: true });
    const marks = screen.getAllByTestId("orbit-roadmap-derived");
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) expect(mark.textContent).toBe("derivado");
    expect(
      screen.getByText(
        "La fuente no dice a qué fase pertenece cada hito: el reparto sale de su tipo.",
      ),
    ).toBeTruthy();
  });

  it("mantiene HECHO plegado por defecto y lo abre al pulsarlo", () => {
    mount();
    const details = screen
      .getByTestId("orbit-roadmap-done")
      .querySelector<HTMLDetailsElement>("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(details.querySelector("summary")!);
    expect(details.open).toBe(true);
  });

  it("dice el canal y el estado honesto de la fuente", () => {
    mount({ channel: "nightly" });
    expect(screen.getByTestId("orbit-roadmap-channel").textContent).toBe("Nightly");
    expect(screen.getByTestId("orbit-roadmap-status").textContent).toBe(
      "Fuente disponible · v0.1.x",
    );
  });

  it("cambia de idioma con el hub y usa la traducción del propio JSON", () => {
    mount({ locale: "en", doneOpen: true });
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Roadmap");
    expect(screen.getByText("Public beta")).toBeTruthy();
    expect(screen.getByText("Beta polish v0.1.x")).toBeTruthy();
    expect(screen.getByTestId("orbit-roadmap-status").textContent).toBe(
      "Source available · v0.1.x",
    );
  });

  it("no usa el atributo `title` nativo en ninguna parte de la vista", () => {
    mount({ doneOpen: true });
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
    return mount();
  }

  afterEach(() => {
    document.getElementById("orbit-roadmap-context-slot")?.remove();
  });

  it("lista las tres secciones y enfoca la sección al pulsarla", async () => {
    mountWithSlot();
    const list = await screen.findByTestId("orbit-roadmap-context");
    const rows = list.querySelectorAll(".orbit-row");
    expect(rows).toHaveLength(3);
    expect(list.textContent).toContain("Ahora");
    expect(list.textContent).toContain("Próximo");
    expect(list.textContent).toContain("Hecho");

    expect(screen.getByTestId("orbit-roadmap-next").dataset.focus).toBeUndefined();
    fireEvent.click(rows[1]);
    expect(screen.getByTestId("orbit-roadmap-next").dataset.focus).toBe("true");
    // Solo una sección queda resaltada.
    expect(document.querySelectorAll('.orbit-rm__section[data-focus="true"]')).toHaveLength(1);
  });

  it("no usa el atributo `title` nativo en la columna", () => {
    mountWithSlot();
    expect(
      document.querySelector(".orbit-rm__context")!.querySelectorAll("[title]"),
    ).toHaveLength(0);
  });
});
