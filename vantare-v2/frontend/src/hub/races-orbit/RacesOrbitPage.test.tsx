import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
const listeners = new Map<string, Set<(event: unknown) => void>>();
function backend(name: string, data: unknown) {
  act(() => { for (const listener of listeners.get(name) ?? []) listener({ data }); });
}
vi.mock("@wailsio/runtime", () => ({
  Events: {
    Emit: (...args: unknown[]) => mockEmit(...args),
    On: (name: string, listener: (event: unknown) => void) => {
      const group = listeners.get(name) ?? new Set();
      group.add(listener); listeners.set(name, group);
      return () => { group.delete(listener); };
    },
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
  listeners.clear();
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
  schedule: { validFrom: "2026-07-01T00:00:00Z", validUntil: "2026-08-01T00:00:00Z", updated: "2026-07-01T00:00:00Z", source: "bundled" },
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

function page(props: Partial<Parameters<typeof RacesOrbitPage>[0]> = {}) {
  return <I18nProvider><ToastProvider><RacesOrbitPage calendar={CALENDAR} now={NOW} {...props} /></ToastProvider></I18nProvider>;
}
function setup(props: Partial<Parameters<typeof RacesOrbitPage>[0]> = {}) {
  mountSlots();
  const view = render(page(props));
  return { ...view, rerenderPage: (next: Partial<Parameters<typeof RacesOrbitPage>[0]>) => view.rerender(page(next)) };
}
function pickFirstDayStart() {
  fireEvent.click(screen.getByRole("button", { name: "Día" }));
  fireEvent.click(screen.getAllByTestId("orbit-races-ev-chip").find((chip) => chip.textContent?.includes("LMGT3 Fixed"))!);
  expect(within(screen.getByTestId("orbit-races-detail")).getByText("Salida elegida")).toBeTruthy();
}

const VIEWS = [
  { label: "Próximas", testId: "orbit-races-next" },
  { label: "Día", testId: "orbit-races-day" },
  { label: "Semana", testId: "orbit-races-week" },
  { label: "Mes", testId: "orbit-races-month" },
  { label: "Timeline", testId: "orbit-races-timeline" },
] as const;

describe("RacesOrbitPage", () => {
  it("el filtro no arrastra una hora elegida de otra serie", () => {
    setup(); pickFirstDayStart();
    fireEvent.click(screen.getByTestId("orbit-races-filter-advanced"));
    const detail = within(screen.getByTestId("orbit-races-detail"));
    expect(detail.getByText("Hypercar Open")).toBeTruthy();
    expect(detail.queryByText("Salida elegida")).toBeNull();
    expect(detail.getByText("Próxima salida")).toBeTruthy();
  });
  it("un nuevo destino de Inicio sustituye la selección manual anterior", () => {
    const view = setup({ target: "bronze-1" }); pickFirstDayStart();
    view.rerenderPage({ target: "gold-1" });
    const detail = within(screen.getByTestId("orbit-races-detail"));
    expect(detail.getByText("Hypercar Open")).toBeTruthy();
    expect(detail.queryByText("Salida elegida")).toBeNull();
  });
  it("un nuevo horario descarta una hora que ya no es una salida publicada", () => {
    const view = setup(); pickFirstDayStart();
    const calendar = { ...CALENDAR, series: CALENDAR.series.map((item) => ({ ...item, startOffsetMinute: 30, recurrence: { kind: "interval", intervalMinutes: 60 } })) };
    view.rerenderPage({ calendar });
    const detail = within(screen.getByTestId("orbit-races-detail"));
    expect(detail.queryByText("Salida elegida")).toBeNull();
    expect(detail.getByText("Próxima salida")).toBeTruthy();
  });
  it("el destino nuevo de Inicio prevalece sobre el filtro anterior", () => {
    const view = setup();
    fireEvent.click(screen.getByTestId("orbit-races-filter-advanced"));
    view.rerenderPage({ target: "bronze-1" });
    expect(within(screen.getByTestId("orbit-races-detail")).getByText("LMGT3 Fixed")).toBeTruthy();
  });
  it("volver a un destino anterior no recupera una selección manual retirada", () => {
    const view = setup(); pickFirstDayStart();
    view.rerenderPage({ target: "gold-1" });
    view.rerenderPage({});
    expect(within(screen.getByTestId("orbit-races-detail")).queryByText("Salida elegida")).toBeNull();
  });
  it("actualizar el seguimiento conserva una hora histórica todavía publicada", () => {
    const view = setup(); pickFirstDayStart();
    view.rerenderPage({ calendar: { ...CALENDAR, followedSeriesIds: ["bronze-1"] } });
    expect(within(screen.getByTestId("orbit-races-detail")).getByText("Salida elegida")).toBeTruthy();
  });
  it.each([false, true])("señala las sesiones estimadas sin convertir las confirmadas (estimada: %s)", (estimated) => {
    setup({ calendar: { ...CALENDAR, series: [series({ id: "s", name: "Sesiones", sessions: [
      { name: "practice", durationMin: 3, estimated }, { name: "race", durationMin: 20, estimated: false },
    ] })] } });
    const detail = screen.getByTestId("orbit-races-detail");
    expect(detail.textContent).toContain(estimated ? "P ~3 · R 20" : "P 3 · R 20");
    expect(detail.textContent?.includes("~ duración estimada")).toBe(estimated);
  });

  it.each([
    ["especial", false], ["+N", false], ["especial", true], ["+N", true],
  ] as const)("Mes → Día conserva especiales al abrir %s (con series: %s)", (target, withSeries) => {
    const events: Calendar["events"] = Array.from({ length: 4 }, (_, index) => ({
      id: `imported-${index}`, title: `Especial importado ${index}`, sim: "LMU",
      track: "Sebring", series: "", sessionLabel: "Race", startTime: NOW.toISOString(),
      durationMin: 20, registrationUrl: "", source: "import", notes: "",
    }));
    setup({ calendar: { ...CALENDAR, series: withSeries ? CALENDAR.series : [], events } });
    fireEvent.click(screen.getByRole("button", { name: "Mes" }));
    fireEvent.click(target === "+N"
      ? screen.getByTestId("orbit-races-month-more")
      : screen.getByRole("button", { name: "Especial importado 0" }));
    const day = within(screen.getByTestId("orbit-races-day"));
    for (const event of events) expect(day.getByText(event.title)).toBeTruthy();
    if (!withSeries) expect(day.queryAllByTestId("orbit-races-ev-chip")).toHaveLength(0);
  });

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
    expect(mockEmit).toHaveBeenCalledWith("calendar:series:follow", expect.objectContaining({ seriesId: "bronze-1", requestId: expect.any(String) }));
  });

  it("dejar de seguir despacha el evento contrario", () => {
    setup({ calendar: { ...CALENDAR, followedSeriesIds: ["bronze-1"] } });
    fireEvent.click(screen.getByTestId("orbit-races-follow"));
    expect(mockEmit).toHaveBeenCalledWith("calendar:series:unfollow", expect.objectContaining({ seriesId: "bronze-1", requestId: expect.any(String) }));
  });

  it.each([false, true])("confirma el resultado guardado, no el clic (seguida: %s)", (following) => {
    const { unmount } = setup({ calendar: { ...CALENDAR, followedSeriesIds: following ? ["bronze-1"] : [] } });
    const button = screen.getByTestId("orbit-races-follow") as HTMLButtonElement;
    fireEvent.click(button);
    const success = following ? "Has dejado de seguir LMGT3 Fixed." : "Serie seguida";
    expect(screen.queryByText(success)).toBeNull();
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const request = mockEmit.mock.calls[0][1];
    backend("calendar:series:follow:result", { ...request, requestId: "another", followed: !following, ok: true });
    expect(button.disabled).toBe(true);
    backend("calendar:series:follow:result", { ...request, followed: !following, ok: true });
    expect(screen.getByText(success)).toBeTruthy();
    unmount();
    expect(listeners.get("calendar:series:follow:result")?.size).toBe(0);
  });

  it("un fallo permite reintentar e ignora una respuesta tardía anterior", () => {
    setup();
    const button = screen.getByTestId("orbit-races-follow") as HTMLButtonElement;
    fireEvent.click(button);
    const first = mockEmit.mock.calls[0][1];
    backend("calendar:series:follow:result", { ...first, followed: true, ok: false });
    expect(screen.queryByText("Serie seguida")).toBeNull();
    expect(screen.getByText("No se pudo guardar el seguimiento")).toBeTruthy();
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    const second = mockEmit.mock.calls[1][1];
    expect(second.requestId).not.toBe(first.requestId);
    backend("calendar:series:follow:result", { ...first, followed: true, ok: true });
    expect(button.disabled).toBe(true);
    backend("calendar:series:follow:result", { ...second, followed: true, ok: true });
    expect(screen.getByText("Serie seguida")).toBeTruthy();
  });

  it("un fallo del transporte libera el botón sin éxito", async () => {
    mockEmit.mockRejectedValueOnce(new Error("transport unavailable"));
    setup();
    await act(async () => { fireEvent.click(screen.getByTestId("orbit-races-follow")); });
    expect((screen.getByTestId("orbit-races-follow") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("Serie seguida")).toBeNull();
    expect(screen.getByText("No se pudo guardar el seguimiento")).toBeTruthy();
  });

  it("mantiene la correlación al elegir otra serie e ignora resultados inválidos", () => {
    setup();
    fireEvent.click(screen.getByTestId("orbit-races-follow"));
    const request = mockEmit.mock.calls[0][1];
    fireEvent.click(within(screen.getByTestId("orbit-races-next")).getAllByRole("option")
      .find((row) => row.textContent?.includes("Hypercar Open"))!);
    backend("calendar:series:follow:result", { ...request, followed: true, ok: "true" });
    backend("calendar:series:follow:result", { ...request, seriesId: "gold-1", followed: true, ok: true });
    expect((screen.getByTestId("orbit-races-follow") as HTMLButtonElement).disabled).toBe(true);
    backend("calendar:series:follow:result", { ...request, followed: true, ok: true });
    expect(screen.getByTestId("orbit-toasts").textContent).toContain("LMGT3 Fixed");
    expect(screen.getByTestId("orbit-toasts").textContent).not.toContain("Hypercar Open");
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

  it("el bloque marcado del Timeline rotula y queda por delante", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    const blocks = screen.getAllByTestId("orbit-timeline-block");
    // Todos llevan el nombre completo en el tip aunque no lo rotulen.
    expect(blocks.every((block) => block.getAttribute("data-tip"))).toBe(true);
    // Tinta oscura sobre los colores claros de categoría (AA).
    expect(blocks.every((block) => block.getAttribute("data-ink") === "dark")).toBe(true);

    fireEvent.click(blocks[0]);
    const marked = screen
      .getAllByTestId("orbit-timeline-block")
      .find((block) => block.getAttribute("aria-pressed") === "true")!;
    expect(marked).toBeTruthy();
    // El seleccionado rotula siempre, le quepa o no: el CSS lo sube de capa.
    expect(marked.getAttribute("data-label")).toBe("true");
    expect(within(marked).getByTestId("orbit-timeline-block-label").textContent).toBeTruthy();
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
