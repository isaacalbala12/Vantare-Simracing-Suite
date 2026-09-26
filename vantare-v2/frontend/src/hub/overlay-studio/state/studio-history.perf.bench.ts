import { bench, describe } from "vitest";
import { createStudioHistory, isStudioHistoryDirty } from "./studio-history";
import { buildStudioHistoryBenchDocument } from "./studio-history.perf-fixtures";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";

function buildDocument(widgets: number) {
  return buildStudioHistoryBenchDocument(widgets, (i) => {
    const widget = deltaDefinition.createDefault(`delta-${i}`);
    widget.layout.x = 64 + i;
    return widget;
  });
}

describe("documentsEqual baseline", () => {
  bench(
    "isStudioHistoryDirty with 50 widgets",
    () => {
      const history = createStudioHistory(buildDocument(50));
      isStudioHistoryDirty(history);
    },
    { time: 1000 },
  );
});
