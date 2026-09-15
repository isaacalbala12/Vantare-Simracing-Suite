import { bench, describe } from "vitest";
import { commitStudioCommand, createStudioHistory } from "./studio-history";
import { trackWeatherDefinition } from "../../../overlay/widget-types/track-weather/track-weather-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";

function buildDocument(widgets: number): ProfileDocumentV3 {
  const ws = Array.from({ length: widgets }, (_, i) => {
    const widget = trackWeatherDefinition.createDefault(`track-${i}`);
    widget.layout.x = 64 + i;
    widget.layout.zIndex = i;
    return widget;
  });
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Bench Profile",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: ws,
      },
    },
  };
}

describe("commitStudioCommand no-op baseline", () => {
  bench(
    "commitStudioCommand no-op with 50 widgets",
    () => {
      const history = createStudioHistory(buildDocument(50));
      commitStudioCommand(history, {
        type: "widget/layout",
        session: "general",
        widgetIds: ["track-0"],
        patch: { x: 64 },
      });
    },
    { time: 1000 },
  );
});
