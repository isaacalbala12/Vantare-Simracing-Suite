import { describe, expect, it } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import {
  commitStudioCommand,
  createStudioHistory,
  discardStudioHistory,
  isStudioHistoryDirty,
  markStudioHistorySaved,
  redoStudioHistory,
  undoStudioHistory,
} from "./studio-history";

function buildDocument(x = 64): ProfileDocumentV3 {
  const widget = deltaDefinition.createDefault("delta-1");
  widget.layout.x = x;
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test Profile",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [widget],
      },
    },
  };
}

describe("createStudioHistory", () => {
  it("starts clean and cannot undo or redo", () => {
    const history = createStudioHistory(buildDocument());
    expect(isStudioHistoryDirty(history)).toBe(false);
    expect(undoStudioHistory(history)).toBe(history);
    expect(redoStudioHistory(history)).toBe(history);
  });

  it("clones documents at load boundaries", () => {
    const document = buildDocument();
    const history = createStudioHistory(document);
    document.layouts.general.widgets[0].layout.x = 999;
    expect(history.present.layouts.general.widgets[0].layout.x).toBe(64);
    expect(history.saved.layouts.general.widgets[0].layout.x).toBe(64);
  });
});

describe("commitStudioCommand", () => {
  it("records one history entry per committed command", () => {
    const history = createStudioHistory(buildDocument());
    const next = commitStudioCommand(history, {
      type: "widget/layout",
      session: "general",
      widgetIds: ["delta-1"],
      patch: { x: 120 },
    });
    expect(next.past).toHaveLength(1);
    expect(next.present.layouts.general.widgets[0].layout.x).toBe(120);
    expect(isStudioHistoryDirty(next)).toBe(true);
  });

  it("ignores pointer-preview-only work because only committed commands reach history", () => {
    const history = createStudioHistory(buildDocument());
    const previewOnly = structuredClone(history.present);
    previewOnly.layouts.general.widgets[0].layout.x = 500;

    expect(history.present).not.toEqual(previewOnly);
    expect(history.past).toHaveLength(0);
    expect(isStudioHistoryDirty(history)).toBe(false);
  });

  it("clears future entries when a new branch is committed after undo", () => {
    const history = createStudioHistory(buildDocument());
    const edited = commitStudioCommand(history, {
      type: "widget/layout",
      session: "general",
      widgetIds: ["delta-1"],
      patch: { x: 120 },
    });
    const undone = undoStudioHistory(edited);
    const branched = commitStudioCommand(undone, {
      type: "widget/layout",
      session: "general",
      widgetIds: ["delta-1"],
      patch: { x: 180 },
    });

    expect(branched.future).toHaveLength(0);
    expect(branched.present.layouts.general.widgets[0].layout.x).toBe(180);
    expect(redoStudioHistory(branched)).toBe(branched);
  });

  it("retains at most 100 past snapshots", () => {
    let history = createStudioHistory(buildDocument());
    for (let step = 1; step <= 101; step += 1) {
      history = commitStudioCommand(history, {
        type: "widget/layout",
        session: "general",
        widgetIds: ["delta-1"],
        patch: { x: step },
      });
    }
    expect(history.past).toHaveLength(100);
    expect(history.present.layouts.general.widgets[0].layout.x).toBe(101);
    expect(history.past[0].layouts.general.widgets[0].layout.x).toBe(1);
  });
});

describe("undoStudioHistory", () => {
  it("returns to the saved snapshot as a clean state", () => {
    const history = createStudioHistory(buildDocument());
    const edited = commitStudioCommand(history, {
      type: "widget/layout",
      session: "general",
      widgetIds: ["delta-1"],
      patch: { x: 120 },
    });
    const undone = undoStudioHistory(edited);
    expect(undone.present.layouts.general.widgets[0].layout.x).toBe(64);
    expect(isStudioHistoryDirty(undone)).toBe(false);
    expect(undone.future).toHaveLength(1);
  });
});

describe("redoStudioHistory", () => {
  it("restores a dirty committed state", () => {
    const history = createStudioHistory(buildDocument());
    const edited = commitStudioCommand(history, {
      type: "widget/layout",
      session: "general",
      widgetIds: ["delta-1"],
      patch: { x: 120 },
    });
    const redone = redoStudioHistory(undoStudioHistory(edited));
    expect(redone.present.layouts.general.widgets[0].layout.x).toBe(120);
    expect(isStudioHistoryDirty(redone)).toBe(true);
  });
});

describe("markStudioHistorySaved", () => {
  it("updates the saved snapshot without clearing history stacks", () => {
    const history = createStudioHistory(buildDocument());
    const edited = commitStudioCommand(history, {
      type: "widget/layout",
      session: "general",
      widgetIds: ["delta-1"],
      patch: { x: 120 },
    });
    const saved = markStudioHistorySaved(edited, edited.present);
    expect(saved.saved.layouts.general.widgets[0].layout.x).toBe(120);
    expect(saved.past).toHaveLength(1);
    expect(saved.future).toHaveLength(0);
    expect(isStudioHistoryDirty(saved)).toBe(false);
  });
});

describe("discardStudioHistory", () => {
  it("restores the saved snapshot and clears undo/redo stacks", () => {
    const history = createStudioHistory(buildDocument());
    const edited = commitStudioCommand(history, {
      type: "widget/layout",
      session: "general",
      widgetIds: ["delta-1"],
      patch: { x: 120 },
    });
    const undone = undoStudioHistory(edited);
    const discarded = discardStudioHistory(undone);
    expect(discarded.present.layouts.general.widgets[0].layout.x).toBe(64);
    expect(discarded.past).toHaveLength(0);
    expect(discarded.future).toHaveLength(0);
    expect(undoStudioHistory(discarded)).toBe(discarded);
    expect(redoStudioHistory(discarded)).toBe(discarded);
  });
});