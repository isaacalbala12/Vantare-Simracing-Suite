import type {
  ProfileDocumentV3,
  SessionLayoutType,
  WidgetInstanceV3,
  WidgetLayoutV3,
} from "../../../overlay/core/profile-document";
import type { StudioCommand } from "../state/studio-command";
import type { StudioHotkey } from "../state/studio-hotkeys";
import { getStudioHotkeyMoveStep } from "../state/studio-hotkeys";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type Point } from "./canvas-geometry";

export type WidgetActionId =
  | "duplicate"
  | "delete"
  | "reset-layout"
  | "center"
  | "front"
  | "forward"
  | "backward"
  | "back";

export type WidgetActionBuildInput = {
  actionId: WidgetActionId;
  session: SessionLayoutType;
  widgetIds: readonly string[];
  widgets: readonly WidgetInstanceV3[];
  savedDocument: ProfileDocumentV3;
};

export type WidgetActionBuildResult = {
  command: StudioCommand | null;
  selectWidgetId?: string | null;
  requiresConfirmation: boolean;
};

export type WidgetOrderDirection = "front" | "forward" | "backward" | "back";

const ORDER_DIRECTIONS: Record<Extract<WidgetActionId, WidgetOrderDirection>, WidgetOrderDirection> = {
  front: "front",
  forward: "forward",
  backward: "backward",
  back: "back",
};

function createDuplicateIds(
  widgetIds: readonly string[],
  existingIds: ReadonlySet<string>,
): string[] {
  const reserved = new Set(existingIds);
  return widgetIds.map((widgetId) => {
    let candidate = `${widgetId}-copy`;
    let suffix = 2;
    while (reserved.has(candidate)) {
      candidate = `${widgetId}-copy-${suffix}`;
      suffix += 1;
    }
    reserved.add(candidate);
    return candidate;
  });
}

function centerPatch(layout: WidgetLayoutV3): Partial<WidgetLayoutV3> {
  return {
    x: Math.round((CANVAS_WIDTH - layout.w) / 2),
    y: Math.round((CANVAS_HEIGHT - layout.h) / 2),
  };
}

export function widgetActionRequiresConfirmation(actionId: WidgetActionId): boolean {
  return actionId === "delete";
}

export function buildWidgetAction(input: WidgetActionBuildInput): WidgetActionBuildResult {
  const { actionId, session, widgetIds } = input;
  if (widgetIds.length === 0) {
    return { command: null, requiresConfirmation: false };
  }

  if (actionId === "delete") {
    return {
      command: {
        type: "widget/delete",
        session,
        widgetIds,
      },
      selectWidgetId: null,
      requiresConfirmation: true,
    };
  }

  if (actionId === "duplicate") {
    const newIds = createDuplicateIds(
      widgetIds,
      new Set(input.widgets.map((widget) => widget.id)),
    );
    return {
      command: {
        type: "widget/duplicate",
        session,
        widgetIds,
        newIds,
      },
      selectWidgetId: newIds[newIds.length - 1] ?? null,
      requiresConfirmation: false,
    };
  }

  if (actionId === "reset-layout") {
    return {
      command: {
        type: "widget/reset-section",
        session,
        widgetIds,
        section: "layout",
        saved: input.savedDocument,
      },
      requiresConfirmation: false,
    };
  }

  if (actionId === "center") {
    const target = input.widgets.find((widget) => widget.id === widgetIds[0]);
    if (!target) {
      return { command: null, requiresConfirmation: false };
    }
    return {
      command: {
        type: "widget/layout",
        session,
        widgetIds,
        patch: centerPatch(target.layout),
      },
      requiresConfirmation: false,
    };
  }

  const direction = ORDER_DIRECTIONS[actionId as keyof typeof ORDER_DIRECTIONS];
  if (direction) {
    return {
      command: {
        type: "widget/order",
        session,
        widgetIds,
        direction,
      },
      requiresConfirmation: false,
    };
  }

  return { command: null, requiresConfirmation: false };
}

export function buildWidgetMoveCommand(input: {
  session: SessionLayoutType;
  widgetIds: readonly string[];
  hotkey: Extract<StudioHotkey, "move-up" | "move-down" | "move-left" | "move-right">;
  shiftKey: boolean;
  widgets: readonly WidgetInstanceV3[];
}): StudioCommand | null {
  const step = getStudioHotkeyMoveStep(input.hotkey, input.shiftKey);
  if (step === null || input.widgetIds.length === 0) {
    return null;
  }

  const target = input.widgets.find((widget) => widget.id === input.widgetIds[0]);
  if (!target) {
    return null;
  }

  const patch: Partial<WidgetLayoutV3> = {};
  switch (input.hotkey) {
    case "move-up":
      patch.y = target.layout.y - step;
      break;
    case "move-down":
      patch.y = target.layout.y + step;
      break;
    case "move-left":
      patch.x = target.layout.x - step;
      break;
    case "move-right":
      patch.x = target.layout.x + step;
      break;
  }

  return {
    type: "widget/layout",
    session: input.session,
    widgetIds: input.widgetIds,
    patch,
  };
}

export function mapHotkeyToWidgetAction(
  hotkey: StudioHotkey,
): WidgetActionId | "keyboard-move" | null {
  switch (hotkey) {
    case "delete":
      return "delete";
    case "duplicate":
      return "duplicate";
    case "move-up":
    case "move-down":
    case "move-left":
    case "move-right":
      return "keyboard-move";
    default:
      return null;
  }
}

export function findWidgetsAtPoint(
  widgets: readonly WidgetInstanceV3[],
  point: Point,
): WidgetInstanceV3[] {
  return [...widgets]
    .filter((widget) => {
      const { x, y, w, h } = widget.layout;
      return point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h;
    })
    .sort((left, right) => right.layout.zIndex - left.layout.zIndex);
}

export function executeWidgetAction(input: {
  actionId: WidgetActionId;
  session: SessionLayoutType;
  widgetIds: readonly string[];
  widgets: readonly WidgetInstanceV3[];
  savedDocument: ProfileDocumentV3;
  dispatch(command: StudioCommand): void;
  selectWidget(widgetId: string | null): void;
  confirmDelete?(message: string): boolean;
}): boolean {
  const built = buildWidgetAction({
    actionId: input.actionId,
    session: input.session,
    widgetIds: input.widgetIds,
    widgets: input.widgets,
    savedDocument: input.savedDocument,
  });

  if (!built.command) {
    return false;
  }

  if (built.requiresConfirmation) {
    const confirmed = input.confirmDelete?.("¿Eliminar el widget seleccionado?") ?? false;
    if (!confirmed) {
      return false;
    }
  }

  input.dispatch(built.command);
  if (built.selectWidgetId !== undefined) {
    input.selectWidget(built.selectWidgetId);
  }
  return true;
}