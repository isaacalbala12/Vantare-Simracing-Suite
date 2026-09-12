import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WidgetVisualHost } from "../../core/WidgetVisualHost";
import { buildWorkshopFrameV2, createScenarioWidget } from "../../authoring/fixtures/authoring-v2-workshop-frame";
import { parseOverlayWorkshopQuery } from "../../authoring/overlay-workshop-query";
import { type StandingsViewModel } from "../../widget-types/standings/standings-view-model";
import { StandingsFunctional } from "./StandingsFunctional";
import { vantareFunctionalManifest } from "./manifest";

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
  it.each(["signature", "broadcast"])("changes the flag and selected session data in %s without changing the table", (templateId) => {
    const settings = { templateId, headerFirst: "trackTemperature", headerSecond: "none", footerFirst: "totalLaps", footerSecond: "none" };
    const data = { ...model, flag: "yellow" as const, sessionInfo: {
      trackTemperature: { text: "32°C" }, airTemperature: { text: "21°C" }, totalLaps: { text: "42" },
      estimatedLaps: { text: "≈18" }, remaining: { text: "18:42" }, track: { text: "Spa" }, rain: { text: "0%" }, wetness: { text: "0%" },
    } };
    const { container, rerender } = render(<StandingsFunctional model={data} settings={settings} renderMode="harness" />);
    expect(container.querySelector('.vf-standings')?.getAttribute('data-flag')).toBe('yellow');
    expect(container.querySelector('.vf-header-info')?.textContent).toContain('32°C');
    expect(container.querySelector('.vf-session-footer')?.textContent).toContain('42');
    expect(container.querySelector('.vf-session-footer')?.textContent).not.toContain('≈18');
    rerender(<StandingsFunctional model={{ ...data, flag: "green" }} settings={{ ...settings, showSessionFooter: false }} renderMode="harness" />);
    expect(container.querySelector('.vf-standings')?.getAttribute('data-flag')).toBe('green');
    expect(container.querySelector('.vf-session-footer')).toBeNull();
    expect(container.querySelectorAll('tbody td')).toHaveLength(model.columns.length);
  });

  it("does not expose retained header/footer data or a retained flag when disconnected", () => {
    const { container } = render(<StandingsFunctional model={{ ...model, status: "disconnected", flag: "green" }} settings={{}} renderMode="harness" />);
    expect(container.querySelector('.vf-standings')?.getAttribute('data-flag')).toBe('unknown');
    expect(container.querySelector('.vf-session-footer')?.textContent).toContain('—');
  });

  it("preserves recognized saved information choices and safely defaults unknown ones", () => {
    const parse = vantareFunctionalManifest.widgets[0]!.parseSettings;
    expect(parse({ templateId: "broadcast", showSessionFooter: false, headerFirst: "totalLaps", headerSecond: "none", footerFirst: "rain", footerSecond: "wetness" })).toMatchObject({ templateId: "broadcast", showSessionFooter: false, headerFirst: "totalLaps", headerSecond: "none", footerFirst: "rain", footerSecond: "wetness" });
    expect(parse({ headerFirst: "arbitraryTelemetryPath" })).toHaveProperty("headerFirst", "trackTemperature");
  });

  it("keeps pit, gap and last lap in separate configured cells and identifies the player with text", () => {
    const { container } = render(<StandingsFunctional model={model} settings={{}} renderMode="harness" />);
    expect(container.querySelector('td[data-metric="lastLap"]')?.textContent).toBe("1:42.318");
    expect(container.querySelector('td[data-metric="gap"]')?.textContent).toBe("+2.106s");
    expect(container.querySelector('td[data-metric="pit"]')?.textContent).toBe("PIT");
    expect(container.querySelector('.vf-driver small')?.textContent).toBeTruthy();
    expect(container.querySelector('tr[data-player="true"]')).not.toBeNull();
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

  it("accepts the implemented Workshop pair and rejects unsupported widgets", () => {
    expect(parseOverlayWorkshopQuery("?widget=standings&system=vantare-functional&design=standings-functional-compact")).not.toHaveProperty("error");
    expect(parseOverlayWorkshopQuery("?widget=delta&system=vantare-functional")).toHaveProperty("error");
  });
});
