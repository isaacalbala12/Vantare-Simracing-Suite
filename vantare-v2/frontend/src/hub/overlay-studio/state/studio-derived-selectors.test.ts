import { afterEach, describe, expect, it } from "vitest";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import {
  createStudioHistory,
  markStudioHistorySaved,
  commitStudioCommand,
} from "./studio-history";
import {
  resetStudioDerivedSelectorCaches,
  selectStudioDirty,
} from "./studio-derived-selectors";
import { resolveSessionLayout } from "./session-layouts";

function buildDocument(): ProfileDocumentV3 {
  const widget = deltaDefinition.createDefault("delta-main");
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Selector profile",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: { general: { type: "general", widgets: [widget] } },
  };
}

afterEach(() => resetStudioDerivedSelectorCaches());

describe("Studio derived selectors", () => {
  it("keeps active-layout results independent between consumers", () => {
    const document = buildDocument();
    const firstConsumer = resolveSessionLayout(document, "general");
    const secondConsumer = resolveSessionLayout(document, "general");

    firstConsumer.widgets[0]!.layout.x = 999;

    expect(secondConsumer.widgets[0]!.layout.x).not.toBe(999);
    expect(document.layouts.general.widgets[0]!.layout.x).not.toBe(999);
  });

  it("reuses dirty comparison for repeated consumers and invalidates saved changes", () => {
    const history = createStudioHistory(buildDocument());
    expect(selectStudioDirty(history)).toBe(false);
    expect(selectStudioDirty(history)).toBe(false);
    const edited = commitStudioCommand(history, {
      type: "widget/layout",
      session: "general",
      widgetIds: ["delta-main"],
      patch: { x: 12 },
    });
    expect(selectStudioDirty(edited)).toBe(true);
    const saved = markStudioHistorySaved(edited, edited.present);
    expect(selectStudioDirty(saved)).toBe(false);
    expect(selectStudioDirty(saved)).toBe(false);
  });
});
