import { bench, describe } from "vitest";
import { commitStudioCommand, createStudioHistory } from "./studio-history";
import { buildStudioHistoryBenchDocument } from "./studio-history.perf-fixtures";
import { trackWeatherDefinition } from "../../../overlay/widget-types/track-weather/track-weather-definition";

function buildDocument(widgets: number) {
  return buildStudioHistoryBenchDocument(widgets, (i) => {
    const widget = trackWeatherDefinition.createDefault(`track-${i}`);
    widget.layout.x = 64 + i;
    widget.layout.zIndex = i;
    return widget;
  });
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
