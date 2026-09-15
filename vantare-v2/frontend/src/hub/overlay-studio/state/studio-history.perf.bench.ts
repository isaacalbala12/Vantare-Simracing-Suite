import { bench, describe } from "vitest";
import { createStudioHistory, isStudioHistoryDirty } from "./studio-history";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";

function buildDocument(widgets: number): ProfileDocumentV3 {
  const ws = Array.from({ length: widgets }, (_, i) => {
    const widget = deltaDefinition.createDefault(`delta-${i}`);
    widget.layout.x = 64 + i;
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
