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

  it("sin calendario no inventa salidas", () => {
    setup({ calendar: null });
    expect(screen.queryByTestId("orbit-races-detail")).toBeNull();
    expect(screen.getByTestId("orbit-races").textContent).toContain("cadencia publicada");
  });
});
