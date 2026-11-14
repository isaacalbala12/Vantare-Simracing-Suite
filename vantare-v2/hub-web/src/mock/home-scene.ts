// Shared scene projection for Electron and Rune. Only fixtures are passed in.
import type { HomeView, HomeWidgetKind } from "../contract/generated/home";
import type { LauncherView } from "../contract/generated/launcher";

interface HomeFixture {
  profiles: Array<{
    id: string;
    name: string;
    apps: string[];
    favorite: boolean;
    lastLaunchedAt: string;
  }>;
}
export function homeScene(
  sceneName: string,
  launcher: Pick<LauncherView, "profiles" | "revision">,
  homeFixture: HomeFixture,
  naturalSizes: Record<HomeWidgetKind, { w: number; h: number }>,
): HomeView {
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
  if (sceneName === "inicio-error")
    value.layout.widgets = [
      { kind: "standings", x: 20, y: 20, w: 640, h: 210, opacity: 100 },
      { kind: "pedals", x: 850, y: 20, w: 120, h: 210, opacity: 100 },
    ];
  if (sceneName === "inicio-base") {
    value.profiles = homeFixture.profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      steps: profile.apps.length,
      favorite: profile.favorite,
      lastLaunchedAt: profile.lastLaunchedAt,
    }));
    value.favorite =
      value.profiles.find((profile) => profile.favorite)?.id ?? null;
    const order = ["standings", "delta", "relative", "pedals"];
    value.layout.widgets.sort(
      (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind),
    );
  }
  value.layout.widgets = value.layout.widgets.map((widget) => ({
    ...widget,
    ...naturalSizes[widget.kind],
  }));
  if (sceneName === "inicio-vacio") {
    value.profiles = [];
    value.favorite = null;
    value.layout = { state: "missing", width: 1920, height: 1080, widgets: [] };
  }
  if (sceneName === "inicio-sin-diseno")
    value.layout = { state: "missing", width: 1920, height: 1080, widgets: [] };
  return value;
}
