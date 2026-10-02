import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WidgetVisualHost } from "../../core/WidgetVisualHost";
import { I18nProvider } from "../../../i18n/I18nProvider";
import { buildWorkshopFrameV2, createScenarioWidget } from "../../authoring/fixtures/authoring-v2-workshop-frame";
import type { RelativeViewModel } from "../../widget-types/relative/relative-view-model";
import { RelativeFunctional } from "./RelativeFunctional";

afterEach(cleanup);
afterEach(() => localStorage.clear());

const model: RelativeViewModel = {
  type: "relative", status: "ready", rowHeightMode: "auto",
  columns: [
    { id: "pos", metricId: "position", enabled: true, widthPreset: "sm" },
    { id: "num", metricId: "carNumber", enabled: true, widthPreset: "sm" },
    { id: "name", metricId: "driverName", enabled: true, widthPreset: "auto" },
    { id: "gap", metricId: "gap", enabled: true, widthPreset: "lg" },
    { id: "best", metricId: "bestLap", enabled: true, widthPreset: "lg" },
  ],
  rows: [
    { id: "ahead", position: 2, vehicleClass: "GT3", driverNumber: "12", driverName: "María Costa", gapText: "+4.5", bestLapText: "1:41.512", lastLapText: "1:42.318", isPlayer: false, side: "ahead", tone: "ahead", gapSeconds: 4.5 },
    { id: "player", position: 3, vehicleClass: "GT3", driverNumber: "7", driverName: "Ana Ruiz", gapText: "—", bestLapText: "1:41.902", lastLapText: "1:42.540", isPlayer: true, side: "player", tone: "player", gapSeconds: 0 },
    { id: "behind", position: 4, vehicleClass: "LMGT3", driverNumber: "88", driverName: "Leo Senn", gapText: "-2.1", bestLapText: "1:42.044", lastLapText: "1:43.105", isPlayer: false, side: "behind", tone: "behind", gapSeconds: -2.1 },
  ],
};

describe("Functional Relative", () => {
  it("renders a neutral lap badge only for non-player integer differences in race", () => {
    const race: RelativeViewModel = {
      ...model,
      sessionLabel: "RACE",
      rows: model.rows.map((row) => ({
        ...row,
        lapDelta: row.id === "ahead" ? -1 : row.id === "behind" ? 2 : 0,
      })),
    };
    const { container, getByLabelText } = render(<RelativeFunctional model={race} settings={{}} renderMode="harness" />);

    expect(getByLabelText("1 vuelta menos que tú").textContent).toBe("−1 V");
    expect(getByLabelText("2 vueltas más que tú").textContent).toBe("+2 V");
    expect(container.querySelector('tr[data-player="true"] .vf-relative-lap-delta')).toBeNull();
    expect(container.querySelectorAll(".vf-relative-lap-delta")).toHaveLength(2);
  });

  it.each([
    ["PRÁCTICA", "ready", -1],
    ["QUALIFYING", "ready", -1],
    ["RACE", "stale", -1],
    ["RACE", "ready", 0],
    ["RACE", "ready", null],
  ] as const)("does not render a lap badge for session=%s status=%s delta=%s", (sessionLabel, status, lapDelta) => {
    const noBadge: RelativeViewModel = {
      ...model,
      sessionLabel,
      status,
      rows: model.rows.map((row) => ({ ...row, lapDelta })),
    };
    const { container } = render(<RelativeFunctional model={noBadge} settings={{}} renderMode="harness" />);
    expect(container.querySelector(".vf-relative-lap-delta")).toBeNull();
  });

  it.each([
    ["es", "1 vuelta menos que tú", "−1 V"],
    ["en", "1 lap fewer than you", "−1 L"],
    ["pt", "1 volta a menos que você", "−1 V"],
    ["it", "1 giro in meno di te", "−1 G"],
  ] as const)("localizes lap badge title and accessible name in %s", async (locale, title, value) => {
    localStorage.setItem("vantare.locale", locale);
    const race: RelativeViewModel = {
      ...model,
      sessionLabel: "RACE",
      rows: model.rows.map((row) => ({ ...row, lapDelta: row.id === "ahead" ? -1 : null })),
    };
    const { findByLabelText } = render(
      <I18nProvider><RelativeFunctional model={race} settings={{}} renderMode="harness" /></I18nProvider>,
    );
    expect((await findByLabelText(title)).textContent).toBe(value);
  });

  it("renders rows only — no brand header, no column-label row — with the player band", () => {
    const { container } = render(<RelativeFunctional model={model} settings={{}} renderMode="harness" />);
    expect(container.querySelector(".vf-session")).toBeNull();
    expect(container.querySelector("thead")).toBeNull();
    expect([...container.querySelectorAll("tbody tr:first-child td")].map((cell) => cell.getAttribute("data-metric")))
      .toEqual(["position", "carNumber", "driverName", "gap", "bestLap"]);
    const playerRow = container.querySelector('tr[data-player="true"]');
    expect(playerRow?.getAttribute("data-side")).toBe("player");
    expect(playerRow?.querySelector('td[data-metric="gap"]')?.textContent).toBe("—");
    expect(container.querySelector('tr[data-side="ahead"] td[data-metric="gap"]')?.textContent).toBe("+4.5");
    expect(container.querySelector('td[data-metric="carNumber"]')?.textContent).toBe("12");
  });

  it("keeps configured column order and omits disabled columns", () => {
    const custom: RelativeViewModel = { ...model, columns: [model.columns[3]!, model.columns[2]!] };
    const { container } = render(<RelativeFunctional model={custom} settings={{}} renderMode="harness" />);
    expect([...container.querySelectorAll("tbody tr:first-child td")].map((cell) => cell.getAttribute("data-metric")))
      .toEqual(["gap", "driverName"]);
    expect(container.querySelector('td[data-metric="position"]')).toBeNull();
  });

  it("associates the class marker with the position instead of the driver name", () => {
    const withClass: RelativeViewModel = {
      ...model,
      columns: [
        model.columns[0]!,
        { id: "class", metricId: "class", enabled: true, widthPreset: "auto", style: { align: "center" } },
        model.columns[2]!,
      ],
    };
    const { container } = render(<RelativeFunctional model={withClass} settings={{}} renderMode="harness" />);

    expect(container.querySelector('td[data-metric="position"] .vf-position-identity--with-class')).not.toBeNull();
    expect(container.querySelector('td[data-metric="position"] .vf-position-identity .vf-class-tick')).not.toBeNull();
    expect(container.querySelector('td[data-metric="class"] .vf-class-tick')).toBeNull();
    expect(container.querySelector('td[data-metric="driverName"] .vf-class-tick')).toBeNull();
  });

  it.each(["disconnected", "missing", "error"] as const)("labels %s and suppresses retained rows", (status) => {
    const { container, getByRole } = render(<RelativeFunctional model={{ ...model, status }} settings={{}} renderMode="harness" />);
    expect(getByRole("status").textContent).toBeTruthy();
    expect(container.querySelector("tbody")).toBeNull();
  });

  it("labels stale data while preserving the last known rows", () => {
    const { container, getByRole } = render(<RelativeFunctional model={{ ...model, status: "stale" }} settings={{}} renderMode="harness" />);
    expect(getByRole("status").textContent).toBeTruthy();
    expect(container.querySelectorAll("[data-relative-row]")).toHaveLength(3);
  });

  it.each(["studio", "desktop", "obs", "harness"] as const)("renders through the shared host with V2 Workshop data on %s", (surface) => {
    const scenario = { widget: "relative", system: "vantare-functional", variant: "default", state: "ready", session: "race", location: "track" } as const;
    const widget = createScenarioWidget({ ...scenario, designId: "relative-functional-signature" });
    const { container } = render(<WidgetVisualHost widget={widget} runtime={buildWorkshopFrameV2(scenario)} renderMode={surface} />);
    expect(container.querySelector('[data-widget-system="vantare-functional"][data-widget-renderer="relative"][data-status="ready"]')).not.toBeNull();
    expect(container.querySelector('tr[data-player="true"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="widget-host-diagnostic"]')).toBeNull();
  });
});

it("marks only the stale lap cell while preserving fresh gap and lap badge", () => {
  const { container } = render(<RelativeFunctional model={{ ...model, sessionLabel: "RACE", rows: model.rows.map((row) => ({
    ...row, fieldQuality: { gap: "fresh", bestLap: "stale" }, lapDelta: row.isPlayer ? null : -1,
  })) }} settings={{}} renderMode="harness" />);
  const best = container.querySelector<HTMLElement>('[data-relative-row="ahead"] [data-metric="bestLap"]')!;
  const gap = container.querySelector<HTMLElement>('[data-relative-row="ahead"] [data-metric="gap"]')!;
  expect(best.dataset.quality).toBe("stale");
  expect(best.style.opacity).toBe("0.6");
  expect(gap.dataset.quality).toBe("fresh");
  expect(gap.style.opacity).toBe("");
  expect(container.querySelector('[data-relative-row="ahead"] .vf-relative-lap-delta')).not.toBeNull();
});
