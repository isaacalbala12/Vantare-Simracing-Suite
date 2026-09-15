import { bench, describe } from "vitest";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { documentsEqual } from "./studio-history";

function buildDocument(widgets: number): ProfileDocumentV3 {
  const entries = Array.from({ length: widgets }, (_, index) => {
    const widget = deltaDefinition.createDefault(`widget-${index}`);
    widget.layout.x = index;
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
        widgets: entries,
      },
    },
  };
}

for (const widgets of [10, 50, 100]) {
  const left = buildDocument(widgets);
  const right = structuredClone(left);
  describe(`SWR seed comparison ${widgets} widgets`, () => {
    bench("candidate documentsEqual", () => {
      documentsEqual(left, right);
    }, { time: 500 });
    bench("base JSON.stringify", () => {
      JSON.stringify(left) === JSON.stringify(right);
    }, { time: 500 });
  });
}
