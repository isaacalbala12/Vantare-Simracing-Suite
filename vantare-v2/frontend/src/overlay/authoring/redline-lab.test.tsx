import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverlayWorkshopDevRoute } from "./OverlayWorkshopDevRoute";
import { parseOverlayWorkshopQuery, serializeOverlayWorkshopQuery } from "./overlay-workshop-query";
import { parseStandingsEnduranceSettings } from "../design-systems/vantare-endurance/standings/standings-endurance-settings";
import { WidgetVisualHost } from "../core/WidgetVisualHost";
import { buildWorkshopFrameV2, createScenarioWidget } from "./fixtures/authoring-v2-workshop-frame";
import { REDLINE_TOWER_REFERENCE } from "./fixtures/redline-tower-reference";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
const selection = "widget=standings&system=vantare-endurance&design=standings-endurance-redline";

describe("Redline visual laboratory", () => {
  it("inherits approved Tower choices from its catalog entry without reference data", () => {
    const query = parseOverlayWorkshopQuery("widget=standings&system=vantare-endurance&design=standings-endurance-redline-tower");
    expect(query).toMatchObject({ redlineTheme: "tower", redlineHeader: "current", redlineSelection: "glow", redlineOpacity: .95 });
    expect(query).not.toHaveProperty("redlineData");
  });
  it("roundtrips all visual choices without changing old URL defaults", () => {
    const query = parseOverlayWorkshopQuery(`${selection}&redlineTheme=tower&redlineSelection=glow&redlineHeader=signature&redlineOpacity=0.95&redlineData=reference`);
    if ("error" in query) throw new Error(query.error);
    expect(parseOverlayWorkshopQuery(serializeOverlayWorkshopQuery(query))).toEqual(query);
    expect(parseOverlayWorkshopQuery(selection)).not.toHaveProperty("redlineTheme");
  });
  it.each(["redlineTheme=bad", "redlineSelection=white", "redlineHeader=bad", "redlineOpacity=NaN", "redlineOpacity=1.01", "redlineOpacity=", "redlineData=bad"])("rejects invalid %s", (invalid) => {
    expect(parseOverlayWorkshopQuery(`${selection}&${invalid}`)).toHaveProperty("error");
  });
  it("keeps historic profile defaults and validates stored appearance", () => {
    expect(parseStandingsEnduranceSettings({})).toMatchObject({ redlineTheme: "classic", redlineHeader: "current", redlineSelection: "legacy", redlineSurfaceOpacity: 1 });
    expect(parseStandingsEnduranceSettings({ redlineTheme: "bad", redlineSurfaceOpacity: Infinity })).toMatchObject({ redlineTheme: "classic", redlineSurfaceOpacity: 1 });
  });
  it("passes the choices through the productive renderer on both surfaces", async () => {
    const { container } = render(<OverlayWorkshopDevRoute search={`${selection}&surface=desktop&compare=obs`} />);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar estudio azul · luz roja" }));
    await waitFor(() => expect(container.querySelectorAll('[data-widget-renderer="standings"][data-redline-selection="glow"]').length).toBe(2));
    const renderers = [...container.querySelectorAll('[data-widget-renderer="standings"]')];
    // React useId must differ across simultaneous widgets, but each clip reference
    // must resolve locally. Normalise only that instance token for visual parity.
    const clips = [...container.querySelectorAll("clipPath[id]")];
    expect(new Set(clips.map((clip) => clip.id)).size).toBe(4);
    for (const renderer of renderers) {
      for (const element of renderer.querySelectorAll<HTMLElement>('[style*="clip-path"]')) {
        const id = /url\(#([^)]*)\)/.exec(element.style.clipPath)?.[1];
        expect([...renderer.querySelectorAll("clipPath")].some(clip => clip.id === id)).toBe(true);
      }
    }
    const canonical = (html: string | undefined) => html?.replace(/_r_\w+_(?=-(?:brand|header))/g, "INSTANCE");
    expect(canonical(renderers[0]?.outerHTML)).toBe(canonical(renderers[1]?.outerHTML));
    expect(renderers[0]?.querySelectorAll('[data-standings-row]')).toHaveLength(12);
    expect(renderers[0]?.querySelector('[data-player="true"]')?.textContent).toBe("77KOBAYASHI+6.8");
    expect(renderers[0]?.querySelector('.ven-tower-footer')?.textContent).toBe("SPA-FRANCORCHAMPS12 / 24");
    expect(renderers[0]?.getAttribute("style")).toContain("--ven-red-surface-alpha: 0.95");
    expect(renderers[0]?.getAttribute("data-redline-header")).toBe("current");
    fireEvent.change(screen.getByLabelText("Fila del jugador"), { target: { value: "legacy" } });
    await waitFor(() => expect(container.querySelectorAll('[data-redline-selection="legacy"]').length).toBe(2));
  });
  it("never applies reference driver identities to a V2 scenario", async () => {
    const { container } = render(<OverlayWorkshopDevRoute search={`${selection}&redlineTheme=tower&redlineData=telemetry&width=482&height=1087`} />);
    await waitFor(() => expect(container.querySelector('.ven-tower-row')).toBeTruthy());
    expect(container.querySelectorAll('[data-manufacturer]')).toHaveLength(0);
    expect(container.querySelector('.ven-tower')?.textContent).not.toContain("KOBAYASHI");
  });
  it("rejects the authoring fixture in a production host", () => {
    vi.stubEnv("DEV", false);
    const widget = createScenarioWidget({ widget: "standings", system: "vantare-endurance", variant: "default", designId: "standings-endurance-redline" });
    widget.visual.appearanceOverrides = { ...widget.visual.appearanceOverrides, redlineTheme: "tower" };
    widget.layout = { ...widget.layout, w: 482, h: 1087 };
    const runtime = buildWorkshopFrameV2({ widget: "standings", system: "vantare-endurance", variant: "default", session: "race", location: "track", state: "ready" });
    const { container } = render(<WidgetVisualHost widget={widget} renderMode="desktop" runtime={runtime} authoringModel={REDLINE_TOWER_REFERENCE} />);
    expect(container.querySelectorAll('[data-standings-row]').length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain("KOBAYASHI");
    expect(container.querySelectorAll('[data-manufacturer]')).toHaveLength(0);
  });
  it("fits only complete reference rows when the viewport is shortened", async () => {
    const { container } = render(<OverlayWorkshopDevRoute search={`${selection}&redlineTheme=tower&redlineData=reference&width=482&height=1011`} />);
    await waitFor(() => expect(container.querySelector('.ven-tower-row')).toBeTruthy());
    expect(container.querySelectorAll('[data-standings-row]')).toHaveLength(11);
    expect(container.querySelector('.ven-tower-pagination')?.textContent).toBe("11 / 24");
  });
});
