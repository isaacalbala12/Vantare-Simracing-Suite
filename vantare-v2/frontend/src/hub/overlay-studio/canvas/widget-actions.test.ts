import { describe, expect, it } from "vitest";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import {
  buildWidgetAction,
  buildWidgetMoveCommand,
  findWidgetsAtPoint,
  mapHotkeyToWidgetAction,
  widgetActionRequiresConfirmation,
} from "./widget-actions";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./canvas-geometry";

function buildDocument(widgets: WidgetInstanceV3[]): ProfileDocumentV3 {
  return {
    schemaVersion: 3,
    id: "profile-1",
    name: "Test",
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets,
      },
    },
  };
}

describe("buildWidgetAction", () => {
  const widget = deltaDefinition.createDefault("delta-main");
  widget.layout = { x: 100, y: 80, w: 280, h: 96, zIndex: 0, aspectLocked: true };
  const saved = buildDocument([widget]);

  it("builds identical duplicate commands for every entry point", () => {
    const input = {
      actionId: "duplicate" as const,
      session: "general" as const,
      widgetIds: ["delta-main"],
      widgets: [widget],
      savedDocument: saved,
    };
    const fromMenu = buildWidgetAction(input);
    const fromBar = buildWidgetAction(input);
    const fromHotkey = buildWidgetAction({ ...input, actionId: mapHotkeyToWidgetAction("duplicate")! });

    expect(fromMenu.command).toEqual(fromBar.command);
    expect(fromBar.command).toEqual(fromHotkey.command);
    expect(fromMenu.command).toEqual({
      type: "widget/duplicate",
      session: "general",
      widgetIds: ["delta-main"],
      newIds: ["delta-main-copy"],
    });
    expect(fromMenu.selectWidgetId).toBe("delta-main-copy");
  });

  it("requires confirmation before delete", () => {
    expect(widgetActionRequiresConfirmation("delete")).toBe(true);
    const built = buildWidgetAction({
      actionId: "delete",
      session: "general",
      widgetIds: ["delta-main"],
      widgets: [widget],
      savedDocument: saved,
    });
    expect(built.requiresConfirmation).toBe(true);
    expect(built.command).toEqual({
      type: "widget/delete",
      session: "general",
      widgetIds: ["delta-main"],
    });
  });

  it("centers without changing size", () => {
    const built = buildWidgetAction({
      actionId: "center",
      session: "general",
      widgetIds: ["delta-main"],
      widgets: [widget],
      savedDocument: saved,
    });
    expect(built.command).toEqual({
      type: "widget/layout",
      session: "general",
      widgetIds: ["delta-main"],
      patch: {
        x: Math.round((CANVAS_WIDTH - widget.layout.w) / 2),
        y: Math.round((CANVAS_HEIGHT - widget.layout.h) / 2),
      },
    });
  });

  it("resets layout from the saved snapshot", () => {
    const moved = structuredClone(widget);
    moved.layout.x = 400;
    const built = buildWidgetAction({
      actionId: "reset-layout",
      session: "general",
      widgetIds: ["delta-main"],
      widgets: [moved],
      savedDocument: saved,
    });
    expect(built.command).toEqual({
      type: "widget/reset-section",
      session: "general",
      widgetIds: ["delta-main"],
      section: "layout",
      saved,
    });
  });

  it("maps z-order actions to widget/order commands", () => {
    const built = buildWidgetAction({
      actionId: "front",
      session: "general",
      widgetIds: ["delta-main"],
      widgets: [widget],
      savedDocument: saved,
    });
    expect(built.command).toEqual({
      type: "widget/order",
      session: "general",
      widgetIds: ["delta-main"],
      direction: "front",
    });
  });
});

describe("buildWidgetMoveCommand", () => {
  const widget = deltaDefinition.createDefault("delta-main");
  widget.layout = { x: 100, y: 80, w: 280, h: 96, zIndex: 0, aspectLocked: true };

  it("moves one logical pixel by default and eight with shift", () => {
    expect(
      buildWidgetMoveCommand({
        session: "general",
        widgetIds: ["delta-main"],
        hotkey: "move-right",
        shiftKey: false,
        widgets: [widget],
      }),
    ).toEqual({
      type: "widget/layout",
      session: "general",
      widgetIds: ["delta-main"],
      patch: { x: 101 },
    });

    expect(
      buildWidgetMoveCommand({
        session: "general",
        widgetIds: ["delta-main"],
        hotkey: "move-right",
        shiftKey: true,
        widgets: [widget],
      })?.patch,
    ).toEqual({ x: 108 });
  });
});

describe("findWidgetsAtPoint", () => {
  it("returns overlapping widgets in descending z-index order", () => {
    const back = deltaDefinition.createDefault("delta-back");
    back.layout = { x: 0, y: 0, w: 200, h: 100, zIndex: 0, aspectLocked: true };
    const front = deltaDefinition.createDefault("delta-front");
    front.layout = { x: 50, y: 50, w: 200, h: 100, zIndex: 2, aspectLocked: true };

    const hits = findWidgetsAtPoint([back, front], { x: 100, y: 80 });
    expect(hits.map((widget) => widget.id)).toEqual(["delta-front", "delta-back"]);
  });
});