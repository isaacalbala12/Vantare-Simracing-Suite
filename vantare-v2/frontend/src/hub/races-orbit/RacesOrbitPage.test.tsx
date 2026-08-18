import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { Calendar, RaceSeries } from "../../calendar/calendar-types";
import { ToastProvider } from "../../ui/orbit/Toast";
import {
  RacesOrbitPage,
  RACES_CONTEXT_SLOT_ID,
  RACES_TOPBAR_SLOT_ID,
} from "./RacesOrbitPage";

const mockEmit = vi.fn();
vi.mock("@wailsio/runtime", () => ({
  Events: {
    Emit: (...args: unknown[]) => mockEmit(...args),
    On: () => () => undefined,
  },
}));

let plan: "free" | "paid" = "paid";
vi.mock("../../lib/access", () => ({
  useAccess: () => ({
    planLabel: plan === "free" ? "free" : "paid_overlays",
    planStatus: "active",
    roles: [],
    capabilities: [],
    isBlocked: false,
    isUnconfigured: false,
  }),
}));

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  mockEmit.mockReset();
  plan = "paid";
});

const NOW = new Date("2026-07-07T18:07:30Z");

function series(patch: Partial<RaceSeries> & { id: string; name: string }): RaceSeries {
  return {
    tier: "beginner",
    licenseLabel: "Bronze SR",
    track: "Sebring",
    vehicleClass: "LMGT3",
    setup: "Fixed",
    durationMin: 20,
    raceDurationMin: 20,
    startOffsetMinute: 15,
    splits: 20,
    assists: "",
    tyreWarmers: true,
    tyres: 8,
    recurrence: { kind: "interval", intervalMinutes: 15 },
    ...patch,
  } as RaceSeries;
}

const CALENDAR: Calendar = {
  version: 1,
  timezone: "UTC",
  reminderMinutes: [30, 15, 10, 5, 2],
  events: [],
  series: [
    series({ id: "bronze-1", name: "LMGT3 Fixed" }),
    series({
      id: "gold-1",
      name: "Hypercar Open",
      tier: "advanced",
      licenseLabel: "Gold SR",
      recurrence: { kind: "interval", intervalMinutes: 30 },
    }),
  ],
  followedSeriesIds: [],
  seriesPreviews: [],
  updated: "",
};

/** La shell reserva los huecos de topbar y columna: el test los monta igual. */
function mountSlots() {
  for (const id of [RACES_TOPBAR_SLOT_ID, RACES_CONTEXT_SLOT_ID]) {
    const node = document.createElement("div");
    node.id = id;
    document.body.append(node);
  }
}

function setup(props: Partial<Parameters<typeof RacesOrbitPage>[0]> = {}) {
  mountSlots();
  return render(
    <I18nProvider>
      <ToastProvider>
        <RacesOrbitPage calendar={CALENDAR} now={NOW} {...props} />
      </ToastProvider>
    </I18nProvider>,
  );
}

const VIEWS = [
  { label: "Próximas", testId: "orbit-races-next" },
  { label: "Día", testId: "orbit-races-day" },
  { label: "Semana", testId: "orbit-races-week" },
  { label: "Mes", testId: "orbit-races-month" },
  { label: "Timeline", testId: "orbit-races-timeline" },
] as const;

describe("RacesOrbitPage", () => {
  it("monta las cinco vistas sin ningún `title` nativo", () => {
    setup();
    for (const view of VIEWS) {
      fireEvent.click(screen.getByRole("button", { name: view.label }));
      expect(screen.getByTestId(view.testId)).toBeTruthy();
      expect(document.body.querySelectorAll("[title]")).toHaveLength(0);
    }
  });

  it("el filtro de categoría afecta a la vista y al detalle", () => {
    setup();
    expect(within(screen.getByTestId("orbit-races-next")).getAllByRole("option").length)
      .toBeGreaterThan(2);
    expect(screen.getByTestId("orbit-races-detail").textContent).toContain("LMGT3 Fixed");

    fireEvent.click(screen.getByTestId("orbit-races-filter-advanced"));

    const rows = within(screen.getByTestId("orbit-races-next")).getAllByRole("option");
    expect(rows.every((row) => row.textContent?.includes("Hypercar Open"))).toBe(true);
    expect(screen.getByTestId("orbit-races-detail").textContent).toContain("Hypercar Open");
  });

  it("los contadores del filtro salen de las series reales", () => {
    setup();
    expect(screen.getByTestId("orbit-races-filter-all").textContent).toContain("2");
    expect(screen.getByTestId("orbit-races-filter-weekly").textContent).toContain("0");
  });

  it("`target` preselecciona la serie de la navegación", () => {
    setup({ target: "gold-1" });
    expect(screen.getByTestId("orbit-races-detail").textContent).toContain("Hypercar Open");
  });

  it("seleccionar una fila cambia el detalle", () => {
    setup();
    const row = within(screen.getByTestId("orbit-races-next"))
      .getAllByRole("option")
      .find((node) => node.textContent?.includes("Hypercar Open"));
    fireEvent.click(row!);
    expect(screen.getByTestId("orbit-races-detail").textContent).toContain("Hypercar Open");
  });

  it("seguir una serie despacha el evento real del calendario", () => {
    setup();
    fireEvent.click(screen.getByTestId("orbit-races-follow"));
    expect(mockEmit).toHaveBeenCalledWith("calendar:series:follow", { seriesId: "bronze-1" });
  });

  it("dejar de seguir despacha el evento contrario", () => {
    setup({ calendar: { ...CALENDAR, followedSeriesIds: ["bronze-1"] } });
    fireEvent.click(screen.getByTestId("orbit-races-follow"));
    expect(mockEmit).toHaveBeenCalledWith("calendar:series:unfollow", { seriesId: "bronze-1" });
  });

  it("en Free el botón de seguir queda bloqueado con motivo", () => {
    plan = "free";
    setup();
    const follow = screen.getByTestId("orbit-races-follow") as HTMLButtonElement;
    expect(follow.disabled).toBe(true);
    expect(document.body.textContent).toContain("Free");
    fireEvent.click(follow);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("actualizar horario pide el calendario publicado", () => {
    setup();
    fireEvent.click(screen.getByTestId("orbit-races-refresh"));
    expect(mockEmit).toHaveBeenCalledWith("calendar:schedule:refresh");
  });

  it("las filas de Próximas se agrupan por hora y la seleccionada marca la barra", () => {
    setup();
    const next = screen.getByTestId("orbit-races-next");
    const heads = next.querySelectorAll(".orbit-races__group-head");
    expect(heads.length).toBeGreaterThan(0);
    // La hora ya no se repite en cada fila: vive en la cabecera del grupo.
    expect(heads.length).toBeLessThan(within(next).getAllByRole("option").length);

    const row = within(next)
      .getAllByRole("option")
      .find((node) => node.textContent?.includes("Hypercar Open"))!;
    fireEvent.click(row);
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("orbit-races-detail").textContent).toContain("Hypercar Open");
  });

  it("un chip de Semana selecciona serie y hora en el detalle", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    const slot = screen.getAllByTestId("orbit-races-week-slot")[0];
    const hour = slot.textContent!;
    fireEvent.click(slot);
    expect(screen.getByTestId("orbit-races-detail-at").textContent).toContain(hour);
  });

  it("la cabecera de un día de Semana abre Día en esa fecha", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    const days = screen.getAllByTestId("orbit-races-week-day");
    fireEvent.click(days[days.length - 1]);
    expect(screen.getByTestId("orbit-races-day")).toBeTruthy();
  });

  it("un día de Mes abre Día y una serie diaria también", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Mes" }));
    fireEvent.click(screen.getAllByTestId("orbit-races-month-daily")[0]);
    expect(screen.getByTestId("orbit-races-day")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Mes" }));
    fireEvent.click(screen.getAllByTestId("orbit-races-month-day")[10]);
    expect(screen.getByTestId("orbit-races-day")).toBeTruthy();
  });

  it("un ev-chip de Día lleva esa hora al detalle", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Día" }));
    fireEvent.click(screen.getAllByTestId("orbit-races-ev-chip")[0]);
    expect(screen.getByTestId("orbit-races-detail-at").textContent).toBeTruthy();
  });

  it("el Timeline cambia de rango y de zoom dentro de sus límites", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    const axis = () =>
      Number(
        screen
          .getByTestId("orbit-timeline")
          .querySelector(".orbit-tl__inner")!
          .getAttribute("data-px-per-hour"),
      );

    const base = axis();
    fireEvent.click(
      within(screen.getByTestId("orbit-races-tl-controls")).getByRole("button", { name: "12 h" }),
    );
    const wide = axis();
    expect(wide).toBeGreaterThan(base);

    fireEvent.click(screen.getByTestId("orbit-races-zoom-in"));
    expect(axis()).toBeGreaterThan(wide);
    fireEvent.click(screen.getByTestId("orbit-races-zoom-fit"));
    expect(axis()).toBe(wide);
    fireEvent.click(screen.getByTestId("orbit-races-zoom-out"));
    expect(axis()).toBeLessThan(wide);

    // El zoom nunca baja de "24 h caben" ni sube de 4×.
    for (let i = 0; i < 12; i += 1) fireEvent.click(screen.getByTestId("orbit-races-zoom-out"));
    expect(axis()).toBe(base);
    for (let i = 0; i < 20; i += 1) fireEvent.click(screen.getByTestId("orbit-races-zoom-in"));
    // 4× exacto salvo el redondeo a píxel entero de `data-px-per-hour`.
    expect(Math.abs(axis() - base * 4)).toBeLessThanOrEqual(2);
  });

  it("el detalle salta al Timeline y al Día", () => {
    setup();
    fireEvent.click(screen.getByTestId("orbit-races-see-timeline"));
    expect(screen.getByTestId("orbit-races-timeline")).toBeTruthy();
    fireEvent.click(screen.getByTestId("orbit-races-see-day"));
    expect(screen.getByTestId("orbit-races-day")).toBeTruthy();
  });

  it("sin calendario no inventa salidas", () => {
    setup({ calendar: null });
    expect(screen.queryByTestId("orbit-races-detail")).toBeNull();
    expect(screen.getByTestId("orbit-races").textContent).toContain("cadencia publicada");
  });
});
