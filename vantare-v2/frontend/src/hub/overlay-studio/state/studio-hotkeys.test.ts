import { describe, expect, it } from "vitest";
import { getStudioHotkey, getStudioHotkeyMoveStep } from "./studio-hotkeys";

function keyboardEvent(
  init: Partial<KeyboardEvent> & { key: string },
  target?: EventTarget,
): KeyboardEvent {
  return {
    key: init.key,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
    target: target ?? document.body,
  } as KeyboardEvent;
}

describe("getStudioHotkey", () => {
  it("maps the studio keyboard policy", () => {
    expect(getStudioHotkey(keyboardEvent({ key: "s", ctrlKey: true }))).toBe("save");
    expect(getStudioHotkey(keyboardEvent({ key: "z", ctrlKey: true }))).toBe("undo");
    expect(getStudioHotkey(keyboardEvent({ key: "z", ctrlKey: true, shiftKey: true }))).toBe("redo");
    expect(getStudioHotkey(keyboardEvent({ key: "d", ctrlKey: true }))).toBe("duplicate");
    expect(getStudioHotkey(keyboardEvent({ key: "Delete" }))).toBe("delete");
    expect(getStudioHotkey(keyboardEvent({ key: "Escape" }))).toBe("escape");
    expect(getStudioHotkey(keyboardEvent({ key: "ArrowUp" }))).toBe("move-up");
    expect(getStudioHotkey(keyboardEvent({ key: "ArrowRight", shiftKey: true }))).toBe("move-right");
  });

  it("does not treat ctrl+y as redo", () => {
    expect(getStudioHotkey(keyboardEvent({ key: "y", ctrlKey: true }))).toBeNull();
  });

  it("ignores hotkeys while typing in editable fields", () => {
    const input = document.createElement("input");
    expect(getStudioHotkey(keyboardEvent({ key: "s", ctrlKey: true }, input))).toBeNull();
    expect(getStudioHotkey(keyboardEvent({ key: "Delete" }, input))).toBeNull();

    const textarea = document.createElement("textarea");
    expect(getStudioHotkey(keyboardEvent({ key: "z", ctrlKey: true }, textarea))).toBeNull();

    const select = document.createElement("select");
    expect(getStudioHotkey(keyboardEvent({ key: "d", ctrlKey: true }, select))).toBeNull();

    const editable = document.createElement("div");
    editable.contentEditable = "true";
    expect(getStudioHotkey(keyboardEvent({ key: "Escape" }, editable))).toBeNull();
  });
});

describe("getStudioHotkeyMoveStep", () => {
  it("uses 1px for arrows and 8px with shift", () => {
    expect(getStudioHotkeyMoveStep("move-left", false)).toBe(1);
    expect(getStudioHotkeyMoveStep("move-left", true)).toBe(8);
    expect(getStudioHotkeyMoveStep("save", false)).toBeNull();
  });
});