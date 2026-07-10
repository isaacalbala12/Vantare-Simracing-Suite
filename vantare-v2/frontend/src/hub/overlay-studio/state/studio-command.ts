import {
  parseProfileDocumentV3,
  type ProfileDocumentV3,
  type SessionLayoutType,
  type WidgetBehaviorV3,
  type WidgetInstanceV3,
  type WidgetLayoutV3,
  type WidgetVisualV3,
} from "../../../overlay/core/profile-document";
import { applyWidgetDesign, type WidgetDesignV1 } from "../../../overlay/core/widget-design";
import { copySessionLayout, materializeSessionLayout, resolveSessionLayout } from "./session-layouts";
import { normalizeWidgetOrder, reorderWidgets } from "./widget-order";

export type StudioCommand =
  | { type: "widget/add"; session: SessionLayoutType; widget: WidgetInstanceV3 }
  | {
      type: "widget/duplicate";
      session: SessionLayoutType;
      widgetIds: readonly string[];
      newIds: readonly string[];
    }
  | { type: "widget/delete"; session: SessionLayoutType; widgetIds: readonly string[] }
  | {
      type: "widget/layout";
      session: SessionLayoutType;
      widgetIds: readonly string[];
      patch: Partial<WidgetLayoutV3>;
    }
  | {
      type: "widget/behavior";
      session: SessionLayoutType;
      widgetIds: readonly string[];
      patch: Partial<WidgetBehaviorV3>;
    }
  | {
      type: "widget/content";
      session: SessionLayoutType;
      widgetIds: readonly string[];
      content: Record<string, unknown>;
    }
  | {
      type: "widget/visual";
      session: SessionLayoutType;
      widgetIds: readonly string[];
      visual: WidgetVisualV3;
    }
  | {
      type: "widget/order";
      session: SessionLayoutType;
      widgetIds: readonly string[];
      direction: "front" | "forward" | "backward" | "back";
    }
  | {
      type: "widget/reset-section";
      session: SessionLayoutType;
      widgetIds: readonly string[];
      section: "design" | "appearance" | "content" | "behavior" | "layout";
      saved: ProfileDocumentV3;
    }
  | {
      type: "widget/restore-defaults";
      session: SessionLayoutType;
      widgetIds: readonly string[];
      defaults: readonly WidgetInstanceV3[];
    }
  | {
      type: "widget/apply-design";
      session: SessionLayoutType;
      widgetIds: readonly string[];
      design: WidgetDesignV1;
      appliedAt: string;
    }
  | { type: "session/copy"; source: SessionLayoutType; target: SessionLayoutType };

export class StudioCommandError extends Error {
  readonly commandType: StudioCommand["type"];

  constructor(commandType: StudioCommand["type"], message: string) {
    super(message);
    this.name = "StudioCommandError";
    this.commandType = commandType;
  }
}

const DUPLICATE_OFFSET = 16;

function assertValidResult(document: ProfileDocumentV3): void {
  if (import.meta.env.DEV || import.meta.env.MODE === "test") {
    parseProfileDocumentV3(document);
  }
}

function withSessionLayout(
  document: ProfileDocumentV3,
  session: SessionLayoutType,
  updater: (widgets: WidgetInstanceV3[]) => WidgetInstanceV3[],
): ProfileDocumentV3 {
  const next = materializeSessionLayout(structuredClone(document), session);
  const layout = next.layouts[session] ?? resolveSessionLayout(next, session);
  layout.widgets = updater(layout.widgets);
  next.layouts[session] = layout;
  return next;
}

function requireKnownWidgetIds(
  widgets: readonly WidgetInstanceV3[],
  widgetIds: readonly string[],
  commandType: StudioCommand["type"],
): void {
  const known = new Set(widgets.map((widget) => widget.id));
  for (const widgetId of widgetIds) {
    if (!known.has(widgetId)) {
      throw new StudioCommandError(commandType, `unknown widget id: ${widgetId}`);
    }
  }
}

function findSavedWidget(
  saved: ProfileDocumentV3,
  session: SessionLayoutType,
  widgetId: string,
): WidgetInstanceV3 | undefined {
  const layout = saved.layouts[session];
  return layout?.widgets.find((widget) => widget.id === widgetId);
}

function applyLayoutPatch(widget: WidgetInstanceV3, patch: Partial<WidgetLayoutV3>): WidgetInstanceV3 {
  return {
    ...widget,
    layout: {
      ...widget.layout,
      ...patch,
    },
  };
}

function applyBehaviorPatch(widget: WidgetInstanceV3, patch: Partial<WidgetBehaviorV3>): WidgetInstanceV3 {
  return {
    ...widget,
    behavior: {
      ...widget.behavior,
      ...patch,
      visibleWhen: patch.visibleWhen ?? widget.behavior.visibleWhen,
    },
  };
}

function applyResetSection(
  widget: WidgetInstanceV3,
  section: "design" | "appearance" | "content" | "behavior" | "layout",
  savedWidget: WidgetInstanceV3,
): WidgetInstanceV3 {
  switch (section) {
    case "design":
      return {
        ...widget,
        visual: {
          ...widget.visual,
          systemId: savedWidget.visual.systemId,
          systemVersion: savedWidget.visual.systemVersion,
          configVersion: savedWidget.visual.configVersion,
          baseSettings: structuredClone(savedWidget.visual.baseSettings),
          provenance: savedWidget.visual.provenance
            ? structuredClone(savedWidget.visual.provenance)
            : undefined,
        },
      };
    case "appearance":
      return {
        ...widget,
        visual: {
          ...widget.visual,
          appearanceOverrides: structuredClone(savedWidget.visual.appearanceOverrides),
        },
      };
    case "content":
      return {
        ...widget,
        content: structuredClone(savedWidget.content),
      };
    case "behavior":
      return {
        ...widget,
        behavior: structuredClone(savedWidget.behavior),
      };
    case "layout":
      return {
        ...widget,
        layout: structuredClone(savedWidget.layout),
      };
  }
}

function applyWidgetAdd(document: ProfileDocumentV3, command: Extract<StudioCommand, { type: "widget/add" }>) {
  return withSessionLayout(document, command.session, (widgets) => {
    if (widgets.some((widget) => widget.id === command.widget.id)) {
      throw new StudioCommandError(command.type, `duplicate widget id: ${command.widget.id}`);
    }
    return normalizeWidgetOrder([...widgets, structuredClone(command.widget)]);
  });
}

function applyWidgetDuplicate(
  document: ProfileDocumentV3,
  command: Extract<StudioCommand, { type: "widget/duplicate" }>,
) {
  if (command.widgetIds.length !== command.newIds.length) {
    throw new StudioCommandError(command.type, "widgetIds and newIds must have the same length");
  }

  return withSessionLayout(document, command.session, (widgets) => {
    requireKnownWidgetIds(widgets, command.widgetIds, command.type);
    const idSet = new Set(command.widgetIds);
    const ordered = normalizeWidgetOrder(widgets);
    const copies: WidgetInstanceV3[] = [];

    for (let index = 0; index < command.widgetIds.length; index += 1) {
      const sourceId = command.widgetIds[index];
      const newId = command.newIds[index];
      if (ordered.some((widget) => widget.id === newId)) {
        throw new StudioCommandError(command.type, `duplicate widget id: ${newId}`);
      }
      const source = ordered.find((widget) => widget.id === sourceId);
      if (!source) {
        throw new StudioCommandError(command.type, `unknown widget id: ${sourceId}`);
      }
      copies.push({
        ...structuredClone(source),
        id: newId,
        layout: {
          ...source.layout,
          x: source.layout.x + DUPLICATE_OFFSET,
          y: source.layout.y + DUPLICATE_OFFSET,
        },
      });
    }

    const next: WidgetInstanceV3[] = [];
    for (const widget of ordered) {
      next.push(widget);
      if (idSet.has(widget.id)) {
        const copy = copies.find((entry) => {
          const sourceId = command.widgetIds[command.newIds.indexOf(entry.id)];
          return sourceId === widget.id;
        });
        if (copy) {
          next.push(copy);
        }
      }
    }

    return normalizeWidgetOrder(next);
  });
}

function applyWidgetDelete(document: ProfileDocumentV3, command: Extract<StudioCommand, { type: "widget/delete" }>) {
  return withSessionLayout(document, command.session, (widgets) => {
    requireKnownWidgetIds(widgets, command.widgetIds, command.type);
    const remove = new Set(command.widgetIds);
    return normalizeWidgetOrder(widgets.filter((widget) => !remove.has(widget.id)));
  });
}

function applyWidgetLayout(document: ProfileDocumentV3, command: Extract<StudioCommand, { type: "widget/layout" }>) {
  return withSessionLayout(document, command.session, (widgets) => {
    requireKnownWidgetIds(widgets, command.widgetIds, command.type);
    const targets = new Set(command.widgetIds);
    return widgets.map((widget) =>
      targets.has(widget.id) ? applyLayoutPatch(widget, command.patch) : widget,
    );
  });
}

function applyWidgetBehavior(
  document: ProfileDocumentV3,
  command: Extract<StudioCommand, { type: "widget/behavior" }>,
) {
  return withSessionLayout(document, command.session, (widgets) => {
    requireKnownWidgetIds(widgets, command.widgetIds, command.type);
    const targets = new Set(command.widgetIds);
    return widgets.map((widget) =>
      targets.has(widget.id) ? applyBehaviorPatch(widget, command.patch) : widget,
    );
  });
}

function applyWidgetContent(document: ProfileDocumentV3, command: Extract<StudioCommand, { type: "widget/content" }>) {
  return withSessionLayout(document, command.session, (widgets) => {
    requireKnownWidgetIds(widgets, command.widgetIds, command.type);
    const targets = new Set(command.widgetIds);
    const content = structuredClone(command.content);
    return widgets.map((widget) => (targets.has(widget.id) ? { ...widget, content } : widget));
  });
}

function applyWidgetVisual(document: ProfileDocumentV3, command: Extract<StudioCommand, { type: "widget/visual" }>) {
  return withSessionLayout(document, command.session, (widgets) => {
    requireKnownWidgetIds(widgets, command.widgetIds, command.type);
    const targets = new Set(command.widgetIds);
    const visual = structuredClone(command.visual);
    return widgets.map((widget) => (targets.has(widget.id) ? { ...widget, visual } : widget));
  });
}

function applyWidgetOrder(document: ProfileDocumentV3, command: Extract<StudioCommand, { type: "widget/order" }>) {
  return withSessionLayout(document, command.session, (widgets) => {
    requireKnownWidgetIds(widgets, command.widgetIds, command.type);
    return reorderWidgets(widgets, command.widgetIds, command.direction);
  });
}

function applyWidgetResetSection(
  document: ProfileDocumentV3,
  command: Extract<StudioCommand, { type: "widget/reset-section" }>,
) {
  return withSessionLayout(document, command.session, (widgets) => {
    requireKnownWidgetIds(widgets, command.widgetIds, command.type);
    const targets = new Set(command.widgetIds);
    return widgets.map((widget) => {
      if (!targets.has(widget.id)) {
        return widget;
      }
      const savedWidget = findSavedWidget(command.saved, command.session, widget.id);
      if (!savedWidget) {
        return widget;
      }
      return applyResetSection(widget, command.section, savedWidget);
    });
  });
}

function applyWidgetRestoreDefaults(
  document: ProfileDocumentV3,
  command: Extract<StudioCommand, { type: "widget/restore-defaults" }>,
) {
  const defaultsById = new Map(command.defaults.map((widget) => [widget.id, widget]));
  return withSessionLayout(document, command.session, (widgets) => {
    requireKnownWidgetIds(widgets, command.widgetIds, command.type);
    const targets = new Set(command.widgetIds);
    return widgets.map((widget) => {
      if (!targets.has(widget.id)) {
        return widget;
      }
      const defaults = defaultsById.get(widget.id);
      if (!defaults) {
        throw new StudioCommandError(command.type, `missing defaults for widget id: ${widget.id}`);
      }
      return structuredClone(defaults);
    });
  });
}

function applyWidgetApplyDesign(
  document: ProfileDocumentV3,
  command: Extract<StudioCommand, { type: "widget/apply-design" }>,
) {
  return withSessionLayout(document, command.session, (widgets) => {
    requireKnownWidgetIds(widgets, command.widgetIds, command.type);
    const targets = new Set(command.widgetIds);
    return widgets.map((widget) => {
      if (!targets.has(widget.id)) {
        return widget;
      }
      return applyWidgetDesign(widget, command.design, command.appliedAt);
    });
  });
}

function applySessionCopy(document: ProfileDocumentV3, command: Extract<StudioCommand, { type: "session/copy" }>) {
  return copySessionLayout(structuredClone(document), command.source, command.target);
}

export function applyStudioCommand(document: ProfileDocumentV3, command: StudioCommand): ProfileDocumentV3 {
  let next: ProfileDocumentV3;
  switch (command.type) {
    case "widget/add":
      next = applyWidgetAdd(document, command);
      break;
    case "widget/duplicate":
      next = applyWidgetDuplicate(document, command);
      break;
    case "widget/delete":
      next = applyWidgetDelete(document, command);
      break;
    case "widget/layout":
      next = applyWidgetLayout(document, command);
      break;
    case "widget/behavior":
      next = applyWidgetBehavior(document, command);
      break;
    case "widget/content":
      next = applyWidgetContent(document, command);
      break;
    case "widget/visual":
      next = applyWidgetVisual(document, command);
      break;
    case "widget/order":
      next = applyWidgetOrder(document, command);
      break;
    case "widget/reset-section":
      next = applyWidgetResetSection(document, command);
      break;
    case "widget/restore-defaults":
      next = applyWidgetRestoreDefaults(document, command);
      break;
    case "widget/apply-design":
      next = applyWidgetApplyDesign(document, command);
      break;
    case "session/copy":
      next = applySessionCopy(document, command);
      break;
  }
  assertValidResult(next);
  return next;
}