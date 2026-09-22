import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverlayWorkshopDevRoute } from "./OverlayWorkshopDevRoute";
import { buildWorkshopFrameV2, buildWorkshopWidget, type WorkshopV2Scenario } from "./fixtures/authoring-v2-workshop-frame";
import { getAnimationScene, listAnimationScenes } from "./fixtures/animation-scenes";
import { buildStandingsViewModelV2 } from "../widget-types/standings/standings-view-model-v2";
import { parseStandingsContent } from "../widget-types/standings/standings-content";
import { deriveFunctionalStandingsEvents } from "../design-systems/vantare-functional/standings-motion";

const scenario: WorkshopV2Scenario = {
  widget: "standings", system: "vantare-functional", variant: "default",
  state: "ready", session: "race", location: "track",
};
const query = "?widget=standings&system=vantare-functional&variant=default&session=race&state=ready&surface=studio&study=default&around=4";
const frame = (patch: Partial<WorkshopV2Scenario> = {}) => buildWorkshopFrameV2({ ...scenario, ...patch }).overlayV2Frame!;

const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (animateDescriptor) Object.defineProperty(HTMLElement.prototype, "animate", animateDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, "animate");
});

describe("Standings Eficiencia Workshop review", () => {
  it.each(["practice", "qualifying"] as const)("orders %s by best lap and keeps best <= last lap", (session) => {
    const rows = frame({ session }).standings;
    const bests = rows.map((row) => row.bestLap.v!);
    expect(bests).toEqual([...bests].sort((a, b) => a - b));
    expect(rows.map((row) => row.position)).toEqual(rows.map((_, index) => index + 1));
    expect(rows.every((row) => row.bestLap.v! <= row.lastLap.v!)).toBe(true);
  });

  it("gives each session its own laps, times and clock; race gaps follow position", () => {
    const frames = ["practice", "qualifying", "race"].map((session) => frame({ session: session as WorkshopV2Scenario["session"] }));
    expect(new Set(frames.map((value) => value.session.remaining.v)).size).toBe(3);
    expect(new Set(frames.map((value) => value.standings[0]!.bestLap.v)).size).toBe(3);
    expect(new Set(frames.map((value) => value.standings[0]!.laps)).size).toBe(3);
    const gaps = frames[2]!.standings.map((row) => row.gap.v!);
    expect(gaps[0]).toBe(0);
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b));
  });

  it.each(["practice", "qualifying", "race"] as const)("keeps a visible pit example and applies location to the selected player in %s", (session) => {
    const value = frame({ session, playerPosition: 9, location: "pits" });
    const player = value.standings.find((row) => row.id === value.player.id)!;
    expect(player.position).toBe(9);
    expect(player.pit).toBe("pit");
    expect(value.standings.slice(0, 3).some((row) => row.pit === "pit")).toBe(true);
  });

  it("filters unsupported effects and keeps the race position probe out of timed sessions", () => {
    expect(listAnimationScenes("standings", "vantare-functional", "race").map((scene) => scene.id)).toEqual([
      "standings-functional-battle", "standings-functional-window",
      "standings-functional-position", "standings-functional-pit", "standings-functional-personal-best",
      "standings-functional-session-best", "standings-functional-combined",
    ]);
    expect(getAnimationScene("standings-fastest-lap", "vantare-functional")).toBeUndefined();
    expect(getAnimationScene("standings-fastest-lap", "vantare-endurance")).toBeDefined();
    expect(getAnimationScene("standings-functional-position", "vantare-functional", "qualifying")).toBeUndefined();
  });

  it.each(["default", "standings-multiclass"])("drives a stable battle and actual window presence through V2 and renderer in %s", (variant) => {
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: vi.fn(() => ({ playState: "running", cancel: vi.fn() })) });
    const selected = query.replace("variant=default", `variant=${variant}`);
    const battle = render(<OverlayWorkshopDevRoute search={`${selected}&scene=standings-functional-battle`} />);
    expect(document.querySelector("[data-battle]")).toBeNull();
    fireEvent.click(screen.getByTestId("workshop-scene-next"));
    expect([...document.querySelectorAll("[data-battle]")].map((row) => row.getAttribute("data-standings-row")).sort()).toEqual(["vehicle-000", "vehicle-003"]);
    fireEvent.click(screen.getByTestId("workshop-scene-next"));
    expect(document.querySelectorAll("[data-battle]")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("workshop-scene-next"));
    expect(document.querySelector("[data-battle]")).toBeNull();
    battle.unmount();
    render(<OverlayWorkshopDevRoute search={`${selected}&scene=standings-functional-window&modules=pit,gap,bestLap`} />);
    const ids = () => [...document.querySelectorAll("[data-standings-row]")].map((row) => row.getAttribute("data-standings-row"));
    const initial = ids();
    fireEvent.click(screen.getByTestId("workshop-scene-next"));
    expect(ids()).not.toEqual(initial);
    expect(document.querySelector("[data-exiting-row]")).not.toBeNull();
    expect(document.querySelector("[data-standings-row][data-motion]")).toBeNull();
    fireEvent.click(screen.getByTestId("workshop-scene-next"));
    expect(document.querySelector("[data-standings-row][data-motion]")).toBeNull();
    fireEvent.click(screen.getByTestId("workshop-scene-next"));
    expect(ids()).toEqual(initial);
    expect(document.querySelector("[data-standings-row][data-motion]")).toBeNull();
  });

  it.each(["practice", "qualifying"] as const)("keeps the module switches aligned with the columns in %s", (session) => {
    render(<OverlayWorkshopDevRoute search={query.replace("session=race", `session=${session}`)} />);
    const modules = within(screen.getByRole("group", { name: "Módulos" }));
    expect((modules.getByRole("checkbox", { name: "Mejor vuelta" }) as HTMLInputElement).checked).toBe(true);
    expect((modules.getByRole("checkbox", { name: "Última vuelta" }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: "Estado en boxes" }));
    expect(document.querySelector('td[data-metric="bestLap"]')).not.toBeNull();
    expect(document.querySelector('td[data-metric="lastLap"]')).toBeNull();
  });

  it.each(["standings-functional-window", "standings-functional-combined"])("keeps every window step meaningful and the preview stationary in %s", (sceneId) => {
    const firstWindowFrame = sceneId === "standings-functional-combined" ? 8 : 0;
    render(<OverlayWorkshopDevRoute search={`${query}&scene=${sceneId}&frame=${firstWindowFrame}&modules=gap,lastLap,pit,bestLap`} />);
    const root = document.querySelector<HTMLElement>("[data-overlay-workshop-widget-root]")!;
    const height = root.style.height;
    const ids = () => [...document.querySelectorAll("[data-standings-row]")].map((row) => row.getAttribute("data-standings-row"));
    let previous = ids();
    for (let step = 0; step < 3; step += 1) {
      fireEvent.click(screen.getByTestId("workshop-scene-next"));
      expect.soft(document.querySelector('[data-standings-row][data-player="true"]'), `window transition ${step + 1}`).not.toBeNull();
      expect.soft(ids(), `window transition ${step + 1}`).not.toEqual(previous);
      expect.soft(root.style.height, "the external preview must not recenter between windows").toBe(height);
      previous = ids();
    }
  });

  it("keeps race gaps stable when the combined review leaves the battle for the window", () => {
    const before = frame({ sceneId: "standings-functional-combined", sceneFrame: 7 });
    const after = frame({ sceneId: "standings-functional-combined", sceneFrame: 8 });
    expect(after.standings.map((row) => [row.id, row.position, row.gap])).toEqual(before.standings.map((row) => [row.id, row.position, row.gap]));
  });

  it.each(["default", "standings-multiclass"])("includes battle and window motion in the combined harness review for %s", (variant) => {
    vi.useFakeTimers();
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: vi.fn(() => ({ playState: "running", cancel: vi.fn() })) });
    render(<OverlayWorkshopDevRoute search={`${query.replace("variant=default", `variant=${variant}`).replace("study=default", "study=v1")}&scene=standings-functional-combined&modules=pit,gap,bestLap`} />);
    const next = () => {
      act(() => vi.advanceTimersByTime(1600));
      fireEvent.click(screen.getByTestId("workshop-scene-next"));
    };
    for (let index = 0; index < 5; index += 1) next();
    expect([...document.querySelectorAll("[data-battle]")].map((row) => row.getAttribute("data-standings-row")).sort()).toEqual(["vehicle-000", "vehicle-003"]);
    next();
    expect(document.querySelectorAll("[data-battle]")).toHaveLength(2);
    next();
    expect(document.querySelector("[data-battle]")).toBeNull();
    next();
    const ids = () => [...document.querySelectorAll("[data-standings-row]")].map((row) => row.getAttribute("data-standings-row"));
    const initial = ids();
    next();
    expect(ids()).not.toEqual(initial);
    expect(document.querySelector("[data-exiting-row]")).not.toBeNull();
    expect(document.querySelector("[data-standings-row][data-motion]")).toBeNull();
    next();
    next();
    expect(ids()).toEqual(initial);
    expect(document.querySelector("[data-pit-indicator]")).not.toBeNull();
    expect(document.querySelector("[data-standings-row][data-motion]")).toBeNull();
    expect(document.querySelector("[data-study-style]")?.getAttribute("data-study-style")).toBe("v1");
    expect(document.querySelector(".vf-standings")?.getAttribute("data-classification-mode")).toBe(variant === "default" ? "normal" : "multiclass");
  });

  it.each(["practice", "qualifying", "race"] as const)("drives real personal and session lap notices in %s", (session) => {
    const config = { ...scenario, session, modules: ["bestLap", "pit", "gap"] };
    const content = parseStandingsContent(buildWorkshopWidget(config).content);
    const at = (sceneId: string, sceneFrame: number) => {
      const runtime = buildWorkshopFrameV2({ ...config, sceneId, sceneFrame });
      return buildStandingsViewModelV2(runtime.overlayV2Frame!, runtime.overlayV2Source!, content, { mode: "podium-around-player", around: 4 });
    };
    for (const [id, kind] of [["personal-best", "personal-best"], ["session-best", "session-best"]] as const) {
      const sceneId = `standings-functional-${id}`;
      expect(deriveFunctionalStandingsEvents(at(sceneId, 0), at(sceneId, 1))).toContainEqual({ rowId: "vehicle-003", kind });
    }
  });

  it("shows and hides PIT through the actual module checkbox", () => {
    render(<OverlayWorkshopDevRoute search={`${query}&modules=gap,lastLap`} />);
    expect(document.querySelector("[data-pit-indicator]")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Estado en boxes" }));
    expect(document.querySelector("[data-pit-indicator]")).not.toBeNull();
    expect(document.querySelector(".overlay-workshop-widget-root--pit-overflow")).not.toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Estado en boxes" }));
    expect(document.querySelector("[data-pit-indicator]")).toBeNull();
  });

  it.each(["default", "standings-multiclass"])("animates individual rows while preserving %s", (variant) => {
    render(<OverlayWorkshopDevRoute search={`${query.replace("variant=default", `variant=${variant}`)}&scene=standings-functional-position`} />);
    const mode = variant === "default" ? "normal" : "multiclass";
    expect(document.querySelector(".vf-standings")?.getAttribute("data-classification-mode")).toBe(mode);
    const before = [...document.querySelectorAll("[data-standings-row]")].map((row) => row.getAttribute("data-standings-row"));
    fireEvent.click(screen.getByTestId("workshop-scene-next"));
    const after = [...document.querySelectorAll("[data-standings-row]")].map((row) => row.getAttribute("data-standings-row"));
    expect(after).not.toEqual(before);
    expect(document.querySelector('[data-standings-row="vehicle-004"]')?.getAttribute("data-motion")).toBe("rise");
    expect(document.querySelector('[data-standings-row="vehicle-001"]')?.getAttribute("data-motion")).toBe("fall");
    expect(document.querySelector(".vf-standings")?.getAttribute("data-classification-mode")).toBe(mode);
  });

  it.each(["practice", "qualifying", "race"] as const)("shows the pit scene on a visible row in %s", (session) => {
    render(<OverlayWorkshopDevRoute search={`${query.replace("session=race", `session=${session}`)}&scene=standings-functional-pit&modules=pit,gap,bestLap`} />);
    const baseline = document.querySelectorAll("[data-pit-indicator]").length;
    fireEvent.click(screen.getByTestId("workshop-scene-next"));
    expect(document.querySelectorAll("[data-pit-indicator]")).toHaveLength(baseline + 1);
    fireEvent.click(screen.getByTestId("workshop-scene-next"));
    fireEvent.click(screen.getByTestId("workshop-scene-next"));
    expect(document.querySelectorAll("[data-pit-indicator]")).toHaveLength(baseline);
  });
});
