import { bench, describe } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { createStudioHistory, isStudioHistoryDirty } from "./studio-history";
import { resetStudioDerivedSelectorCaches, selectStudioDirty } from "./studio-derived-selectors";

function buildDocument(widgets: number): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Selector benchmark",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: Array.from({ length: widgets }, (_, index) => deltaDefinition.createDefault(`delta-${index}`)),
      },
    },
  };
}

for (const widgets of [10, 50, 100]) {
  const document = buildDocument(widgets);
  const history = createStudioHistory(document);
  describe(`derived selectors ${widgets} widgets`, () => {
    bench("base repeated dirty", () => {
      isStudioHistoryDirty(history);
      isStudioHistoryDirty(history);
    }, { time: 500 });

    bench("candidate identity-reused dirty", () => {
      resetStudioDerivedSelectorCaches();
      selectStudioDirty(history);
      selectStudioDirty(history);
    }, { time: 500 });
  });
}
