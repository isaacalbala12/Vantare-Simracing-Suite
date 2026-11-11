import launcher from "../../../fixtures/launcher-base.json";
import type { HomeView, UiToHost } from "../../contract/generated/contract";
import { homeNaturalSizes } from "../../contract/generated/home";
import type { MockContext, MockHandler } from "../context";
export function create({ sceneName, core }: MockContext): MockHandler {
  if (sceneName.startsWith("inicio-")) {
    core.access.verified = true;
    core.access.blocked = false;
    core.access.tester = true;
    core.rights = "connected";
  }
  const value: HomeView = {
    sim: { connected: false, track: null },
    profiles: launcher.profiles.map((p) => ({
      id: p.id,
      name: p.name,
      steps: p.apps.length,
      favorite: p.favorite,
      lastLaunchedAt: null,
    })),
    favorite: launcher.profiles.find((p) => p.favorite)?.id ?? null,
    revision: launcher.revision,
    protected: false,
    launch:
      sceneName === "inicio-lanzando"
        ? { kind: "running", text: "" }
        : { kind: "idle" },
    layout: {
      state: "ready",
      width: 1920,
      height: 1080,
      widgets: [
        { kind: "standings", x: 20, y: 20, w: 640, h: 210, opacity: 100 },
        { kind: "relative", x: 1420, y: 20, w: 410, h: 210, opacity: 100 },
        { kind: "delta", x: 840, y: 900, w: 130, h: 40, opacity: 100 },
        { kind: "pedals", x: 1020, y: 790, w: 90, h: 150, opacity: 100 },
      ],
    },
    version: "0.0.0",
  };
  if (sceneName === "inicio-base" || sceneName === "inicio-error")
    value.layout.widgets = [
      { kind: "standings", x: 20, y: 20, w: 640, h: 210, opacity: 100 },
      { kind: "pedals", x: 850, y: 20, w: 120, h: 210, opacity: 100 },
    ];
  value.layout.widgets = value.layout.widgets.map((widget) => ({
    ...widget,
    ...homeNaturalSizes[widget.kind],
  }));
  if (sceneName === "inicio-vacio") {
    value.profiles = [];
    value.favorite = null;
    value.layout = { state: "missing", width: 1920, height: 1080, widgets: [] };
  }
  if (sceneName === "inicio-sin-diseno")
    value.layout = { state: "missing", width: 1920, height: 1080, widgets: [] };
  return (m: UiToHost) => {
    if (m.kind === "subscribe" && m.topic === "home")
      return sceneName === "inicio-cargando"
        ? null
        : {
            kind: "event",
            event: { topic: "home", value: structuredClone(value) },
          };
    if (m.kind === "unsubscribe" && m.topic === "home") return null;
    if (m.kind === "request" && m.request.method === "home.get") {
      if (sceneName === "inicio-error")
        return {
          kind: "failure",
          id: m.id,
          error: { kind: "coreUnavailable" },
        };
      return sceneName === "inicio-cargando"
        ? null
        : {
            kind: "response",
            id: m.id,
            result: { method: "home.get", value: structuredClone(value) },
          };
    }
    return undefined;
  };
}
