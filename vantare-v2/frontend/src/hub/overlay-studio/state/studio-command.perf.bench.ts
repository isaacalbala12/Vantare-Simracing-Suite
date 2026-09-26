import { bench, describe } from "vitest";
import { trackWeatherDefinition } from "../../../overlay/widget-types/track-weather/track-weather-definition";
import type { ProfileDocumentV3, SessionLayoutType } from "../../../overlay/core/profile-document";
import { commitStudioCommand, createStudioHistory } from "./studio-history";
import type { StudioCommand } from "./studio-command";

// perf/round2 campaign (F01): measures REAL commits — position, content,
// visual, session copy — not only the no-op path. Cost includes the document
// structuredClone, updaters, documentsEqual and the history snapshot clone.
// assertValidResult (parseProfileDocumentV3) runs because vitest sets
// MODE=test; the production build skips it.

function buildDocument(widgets: number, sessions: SessionLayoutType[] = ["general"]): ProfileDocumentV3 {
  const makeWidgets = (offset: number) =>
    Array.from({ length: widgets }, (_, i) => {
      const widget = trackWeatherDefinition.createDefault(`track-${offset + i}`);
      widget.layout.x = 64 + i;
      widget.layout.zIndex = i;
      return widget;
    });
  const layouts: ProfileDocumentV3["layouts"] = {
    general: { type: "general", widgets: makeWidgets(0) },
  };
  sessions.forEach((session, index) => {
    if (session === "general") return;
    layouts[session] = { type: session, widgets: makeWidgets(1000 * (index + 1)) };
  });
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Bench Profile",
    displayMode: "edit",
    monitorIndex: 0,
    layouts,
  };
}

const layoutCommand = (id: string, session: SessionLayoutType = "general"): StudioCommand => ({
  type: "widget/layout",
  session,
  widgetIds: [id],
  patch: { x: 512, y: 128 },
});

for (const widgets of [1, 25, 50, 100]) {
  describe(`commitStudioCommand widget/layout ${widgets} widgets`, () => {
    const history = createStudioHistory(buildDocument(widgets));
    bench(
      `position commit ${widgets}w`,
      () => {
        commitStudioCommand(history, layoutCommand("track-0"));
      },
      { time: 500 },
    );
  });
}

describe("commitStudioCommand mixed 50 widgets", () => {
  const history = createStudioHistory(buildDocument(50, ["general", "race"]));
  bench(
    "widget/content 50w+2sessions",
    () => {
      commitStudioCommand(history, {
        type: "widget/content",
        session: "general",
        widgetIds: ["track-3"],
        content: { note: "abc", rows: 12 },
      });
    },
    { time: 500 },
  );
  bench(
    "widget/visual 50w+2sessions",
    () => {
      commitStudioCommand(history, {
        type: "widget/visual",
        session: "general",
        widgetIds: ["track-3"],
        visual: {
          systemId: "vantare-crystal",
          systemVersion: 1,
          configVersion: 2,
          baseSettings: { opacity: 0.9 },
          appearanceOverrides: { accent: "#fff" },
        },
      });
    },
    { time: 500 },
  );
  bench(
    "widget/order 50w+2sessions",
    () => {
      commitStudioCommand(history, {
        type: "widget/order",
        session: "general",
        widgetIds: ["track-10"],
        direction: "front",
      });
    },
    { time: 500 },
  );
  bench(
    "session/copy race->qualifying 50w+2sessions",
    () => {
      commitStudioCommand(history, {
        type: "session/copy",
        source: "race",
        target: "qualifying",
      });
    },
    { time: 500 },
  );
  bench(
    "widget/layout materialize endurance 50w",
    () => {
      commitStudioCommand(history, layoutCommand("track-5", "endurance"));
    },
    { time: 500 },
  );
});
