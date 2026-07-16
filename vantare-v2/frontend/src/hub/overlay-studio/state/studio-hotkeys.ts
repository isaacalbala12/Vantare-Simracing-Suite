export type StudioHotkey =
  | "save"
  | "undo"
  | "redo"
  | "delete"
  | "duplicate"
  | "move-up"
  | "move-down"
  | "move-left"
  | "move-right"
  | "escape";

type HotkeyTarget = EventTarget | null | undefined;

function isEditableTarget(target: HotkeyTarget): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function hasPrimaryModifier(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey">): boolean {
  return event.ctrlKey || event.metaKey;
}

export function getStudioHotkey(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "target">,
): StudioHotkey | null {
  if (isEditableTarget(event.target)) {
    return null;
  }

  const key = event.key.toLowerCase();
  const primary = hasPrimaryModifier(event);

  if (primary && key === "s") {
    return "save";
  }
  if (primary && key === "z" && event.shiftKey) {
    return "redo";
  }
  if (primary && key === "z") {
    return "undo";
  }
  if (primary && key === "d") {
    return "duplicate";
  }
  if (!primary && key === "delete") {
    return "delete";
  }
  if (key === "escape") {
    return "escape";
  }
  if (event.shiftKey && key === "arrowup") {
    return "move-up";
  }
  if (event.shiftKey && key === "arrowdown") {
    return "move-down";
  }
  if (event.shiftKey && key === "arrowleft") {
    return "move-left";
  }
  if (event.shiftKey && key === "arrowright") {
    return "move-right";
  }
  if (!event.shiftKey && key === "arrowup") {
    return "move-up";
  }
  if (!event.shiftKey && key === "arrowdown") {
    return "move-down";
  }
  if (!event.shiftKey && key === "arrowleft") {
    return "move-left";
  }
  if (!event.shiftKey && key === "arrowright") {
    return "move-right";
  }

  return null;
}

export function getStudioHotkeyMoveStep(hotkey: StudioHotkey, shiftKey: boolean): number | null {
  switch (hotkey) {
    case "move-up":
    case "move-down":
    case "move-left":
    case "move-right":
      return shiftKey ? 8 : 1;
    default:
      return null;
  }
}