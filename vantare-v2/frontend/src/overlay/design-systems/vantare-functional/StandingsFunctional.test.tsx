import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WidgetVisualHost } from "../../core/WidgetVisualHost";
import { buildWorkshopFrameV2, createScenarioWidget } from "../../authoring/fixtures/authoring-v2-workshop-frame";
import { parseOverlayWorkshopQuery } from "../../authoring/overlay-workshop-query";
import { type StandingsViewModel } from "../../widget-types/standings/standings-view-model";
import { StandingsFunctional } from "./StandingsFunctional";

afterEach(cleanup);

const model: StandingsViewModel = {
  type: "standings", status: "ready", sessionLabel: "RACE", activeClass: "GT3", remainingText: "18:42",
  columns: [
    { id: "position", metricId: "position", enabled: true, widthPreset: "sm" },
    { id: "name", metricId: "driverName", enabled: true, widthPreset: "auto" },
    { id: "gap", metricId: "gap", enabled: true, widthPreset: "lg" },
    { id: "lap", metricId: "lastLap", enabled: true, widthPreset: "lg" },
    { id: "pit", metricId: "pit", enabled: true, widthPreset: "sm" },
  ],
  rows: [{ id: "player", position: 3, driverNumber: "", driverName: "María Costa", vehicleClass: "GT3", teamCode: "", teamBrandColor: "",
    gapText: "+2.106s", intervalText: "—", currentLapText: "12", lastLapText: "1:42.318", bestLapText: "1:41.512", pitText: "PIT", tireCompound: "", isPlayer: true, isLeader: false }],
};

describe("Functional Standings", () => {
  it("keeps pit, gap and last lap in separate configured cells and marks the player only by its row", () => {
    const { container } = render(<StandingsFunctional model={model} settings={{}} renderMode="harness" />);
    expect(container.querySelector('td[data-metric="lastLap"]')?.textContent).toBe("1:42.318");
    expect(container.querySelector('td[data-metric="gap"]')?.textContent).toBe("+2.106s");
    expect(container.querySelector('td[data-metric="pit"]')?.textContent).toBe("PIT");
    expect(container.querySelector('.vf-driver small')).toBeNull();
    expect(container.querySelector('tr[data-player="true"]')).not.toBeNull();
  });

  it("drops the integrated brand when the injected decision hides it (ISA-1105)", () => {
    const { container } = render(<StandingsFunctional model={model} settings={{ brandVisible: false }} renderMode="harness" />);
    expect(container.querySelector(".vf-brand")).toBeNull();
    expect(container.querySelector(".vf-brand-band")).toBeNull();
    expect(container.querySelector(".vf-session")).not.toBeNull();
  });

  it("keeps the brand as a standalone band when the header is off but the decision keeps it", () => {
    const { container } = render(<StandingsFunctional model={model} settings={{ showSessionHeader: false, brandVisible: true }} renderMode="harness" />);
    expect(container.querySelector(".vf-brand-band .vf-brand")).not.toBeNull();
    expect(container.querySelector(".vf-session .vf-brand")).toBeNull();
  });

  it("renders the ambient footer band only when the model carries those fields", () => {
    const bare = render(<StandingsFunctional model={model} settings={{}} renderMode="harness" />);
    expect(bare.container.querySelector(".vf-footer")).toBeNull();
    bare.unmount();
    const withWeather = { ...model, trackTempText: "28°", ambientTempText: "21°", windText: "18 km/h" };
    const { container } = render(<StandingsFunctional model={withWeather} settings={{}} renderMode="harness" />);
    const footer = container.querySelector(".vf-footer");
    expect(footer?.textContent).toContain("28°");
    expect(footer?.textContent).toContain("18 km/h");
  });

  it("renders up to five data slots under the rows and they replace the ambient footer", () => {
    const withWeather = { ...model, trackTempText: "28°", windText: "18 km/h" };
    const { container } = render(<StandingsFunctional model={withWeather} settings={{ footerSlots: ["time", "position", "gap", "track", "wind", "lap"] }} renderMode="harness" />);
    const slotEls = container.querySelectorAll(".vf-slot");
    expect(slotEls).toHaveLength(5);
    expect(container.querySelector('[data-slot="gap"] .vf-slot-value')?.textContent).toBe("+2.106s");
    expect(container.querySelector('[data-slot="track"] .vf-slot-value')?.textContent).toBe("28°");
    expect(container.querySelector(".vf-footer")).toBeNull();
  });

  it("preserves disabled columns, custom order and configured name without inventing identifiers", () => {
    const custom = { ...model, columns: [model.columns[3]!, model.columns[1]!], rows: [{ ...model.rows[0]!, configuredDriverName: "M. Costa" }] };
    const { container } = render(<StandingsFunctional model={custom} settings={{}} renderMode="harness" />);
    expect([...container.querySelectorAll('thead th')].map((cell) => cell.getAttribute('data-metric'))).toEqual(["lastLap", "driverName"]);
    expect(container.querySelector('.vf-driver')?.textContent).toContain("M. Costa");
    expect(container.querySelector('[data-metric="driverNumber"]')).toBeNull();
  });

  it.each(["disconnected", "missing", "error"] as const)("labels %s and suppresses even accidentally retained rows", (status) => {
    const { container, getByRole } = render(<StandingsFunctional model={{ ...model, status }} settings={{}} renderMode="harness" />);
    expect(getByRole("status").textContent).toBeTruthy();
    expect(container.querySelector('tbody')).toBeNull();
  });

  it("labels stale data while preserving the last known rows", () => {
    const { container, getByRole } = render(<StandingsFunctional model={{ ...model, status: "stale" }} settings={{}} renderMode="harness" />);
    expect(getByRole("status").textContent).toBeTruthy();
    expect(container.querySelectorAll('[data-standings-row]')).toHaveLength(1);
  });

  it("keeps stale data identifiable when the session header is hidden", () => {
    const { getByRole, container } = render(<StandingsFunctional model={{ ...model, status: "stale" }} settings={{ showSessionHeader: false }} renderMode="harness" />);
    expect(getByRole("status").textContent).toBeTruthy();
    expect(getByRole("status").closest("thead")).toBeTruthy();
    expect(container.querySelectorAll('[data-standings-row]')).toHaveLength(1);
  });

  it.each([
    ["position", "gap", "driverName", "lastLap"],
    ["driverName", "gap"],
  ])("keeps Signature session information outside narrow identity prefixes (%j)", (...metrics) => {
    const ordered = metrics.flatMap((metric) => model.columns.filter((column) => column.metricId === metric)).map((column) => ({ ...column, widthPreset: "sm" as const }));
    const { container, getByRole } = render(<StandingsFunctional model={{ ...model, columns: ordered, status: "stale", activeClass: "HYPERCAR" }} settings={{ templateId: "signature" }} renderMode="harness" />);
    const header = container.querySelector(".vf-session");
    expect(header?.parentElement).toBe(container.querySelector(".vf-standings"));
    expect(getByRole("status").textContent).toBeTruthy();
    expect(container.querySelectorAll("tbody td")).toHaveLength(ordered.length);
  });

  it("distinguishes best-lap gap from race gap without relabelling the last lap", () => {
    const race = render(<StandingsFunctional model={model} settings={{}} renderMode="harness" />);
    const raceLabel = race.container.querySelector('th[data-metric="gap"]')?.textContent;
    race.unmount();
    const practice = render(<StandingsFunctional model={{ ...model, sessionLabel: "PRACTICE" }} settings={{}} renderMode="harness" />);
    expect(practice.container.querySelector('th[data-metric="gap"]')?.textContent).not.toBe(raceLabel);
    expect(practice.container.querySelector('td[data-metric="lastLap"]')?.textContent).toBe("1:42.318");
  });

  it.each(["studio", "desktop", "obs", "harness"] as const)("uses both appearances through the shared host with V2 Workshop data on %s", (surface) => {
    const scenario = { widget: "standings", system: "vantare-functional", variant: "default", state: "ready", session: "race", location: "track" } as const;
    for (const [designId, template] of [["standings-functional-compact", "signature"], ["standings-functional-broadcast", "broadcast"]]) {
      const widget = createScenarioWidget({ ...scenario, designId });
      const { container, unmount } = render(<WidgetVisualHost widget={widget} runtime={buildWorkshopFrameV2(scenario)} renderMode={surface} />);
      expect(container.querySelector(`[data-widget-system="vantare-functional"][data-status="ready"][data-template="${template}"]`)).not.toBeNull();
      expect(container.querySelectorAll('[data-standings-row]').length).toBeGreaterThan(0);
      expect(container.querySelector('[data-testid="widget-host-diagnostic"]')).toBeNull();
      unmount();
    }
  });

  it("accepts the implemented Workshop pairs and rejects unsupported widgets", () => {
    expect(parseOverlayWorkshopQuery("?widget=standings&system=vantare-functional&design=standings-functional-compact")).not.toHaveProperty("error");
    for (const widget of ["relative", "delta", "pedals"] as const) {
      expect(parseOverlayWorkshopQuery(`?widget=${widget}&system=vantare-functional`)).not.toHaveProperty("error");
    }
    expect(parseOverlayWorkshopQuery("?widget=track-map&system=vantare-functional")).toHaveProperty("error");
  });
});
