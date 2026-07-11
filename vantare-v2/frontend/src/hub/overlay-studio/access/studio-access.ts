import {
  getFeatureGate,
  type AccessContext,
  type FeatureGate,
  type FeatureId,
} from "../../../lib/access-policy";

export const DEFAULT_STUDIO_ACCESS: AccessContext = {
  planLabel: "free",
  planStatus: "active",
  roles: [],
  isBlocked: false,
  isUnconfigured: false,
};
import type { ProfileDocumentV3, SessionLayoutType, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { resolveDesignRequiredFeature, type WidgetDesignV1 } from "../../../overlay/core/widget-design";
import { getWidgetRequiredFeature } from "../../../overlay/core/widget-definition";
import type { StudioCommand } from "../state/studio-command";
import { resolveSessionLayout } from "../state/session-layouts";

export type StudioMutation =
  | "add"
  | "duplicate"
  | "delete"
  | "layout"
  | "behavior"
  | "content"
  | "visual"
  | "apply-design"
  | "apply-all"
  | "save";

export const STUDIO_WIDGET_ACCESS_MESSAGE = "No tienes acceso para modificar este widget.";

export class StudioAccessError extends Error {
  readonly mutation: StudioMutation;
  readonly widgetIds: readonly string[];

  constructor(mutation: StudioMutation, widgetIds: readonly string[], message: string) {
    super(message);
    this.name = "StudioAccessError";
    this.mutation = mutation;
    this.widgetIds = widgetIds;
  }
}

const SESSION_LAYOUT_TYPES: readonly SessionLayoutType[] = [
  "general",
  "practice",
  "qualifying",
  "race",
  "endurance",
];

function collectRequiredFeatures(
  widget?: WidgetInstanceV3,
  design?: WidgetDesignV1,
): FeatureId[] {
  const features = new Set<FeatureId>();
  if (widget) {
    features.add(getWidgetRequiredFeature(widget.type));
  }
  const designFeature = design ? resolveDesignRequiredFeature(design) : undefined;
  if (designFeature) {
    features.add(designFeature);
  }
  return [...features];
}

function hasFullWidgetAccess(access: AccessContext, widget: WidgetInstanceV3): boolean {
  return getFeatureGate(access, getWidgetRequiredFeature(widget.type)).allowed;
}

function widgetNonLayoutEqual(left: WidgetInstanceV3, right: WidgetInstanceV3): boolean {
  const { layout: _leftLayout, ...leftRest } = left;
  const { layout: _rightLayout, ...rightRest } = right;
  return JSON.stringify(leftRest) === JSON.stringify(rightRest);
}

export function getStudioMutationGate(input: {
  access: AccessContext;
  mutation: StudioMutation;
  widget?: WidgetInstanceV3;
  design?: WidgetDesignV1;
}): FeatureGate {
  if (input.mutation === "save" || input.mutation === "layout") {
    return { allowed: true };
  }

  for (const feature of collectRequiredFeatures(input.widget, input.design)) {
    const gate = getFeatureGate(input.access, feature);
    if (!gate.allowed) {
      return gate;
    }
  }

  return { allowed: true };
}

export function canMutateWidget(access: AccessContext, widget: WidgetInstanceV3): boolean {
  return getStudioMutationGate({ access, mutation: "layout", widget }).allowed;
}

function widgetsEqual(left: WidgetInstanceV3, right: WidgetInstanceV3): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateDraftAccess(
  access: AccessContext,
  saved: ProfileDocumentV3,
  draft: ProfileDocumentV3,
): { allowed: true } | { allowed: false; widgetIds: string[]; reason: string } {
  const blockedIds = new Set<string>();

  for (const session of SESSION_LAYOUT_TYPES) {
    const draftLayout = resolveSessionLayout(draft, session);
    const savedLayout = resolveSessionLayout(saved, session);

    for (const widget of draftLayout.widgets) {
      const savedWidget = savedLayout.widgets.find((entry) => entry.id === widget.id);
      if (!savedWidget) {
        if (!hasFullWidgetAccess(access, widget)) {
          blockedIds.add(widget.id);
        }
        continue;
      }
      if (widgetsEqual(widget, savedWidget)) {
        continue;
      }
      if (hasFullWidgetAccess(access, widget)) {
        continue;
      }
      if (widgetNonLayoutEqual(widget, savedWidget)) {
        continue;
      }
      blockedIds.add(widget.id);
    }

    for (const widget of savedLayout.widgets) {
      const draftWidget = draftLayout.widgets.find((entry) => entry.id === widget.id);
      if (draftWidget) {
        continue;
      }
      if (!hasFullWidgetAccess(access, widget)) {
        blockedIds.add(widget.id);
      }
    }
  }

  if (blockedIds.size === 0) {
    return { allowed: true };
  }

  return {
    allowed: false,
    widgetIds: [...blockedIds],
    reason: "No puedes guardar cambios en widgets premium sin la licencia adecuada.",
  };
}

function resolveResetSectionMutation(
  section: Extract<StudioCommand, { type: "widget/reset-section" }>["section"],
): StudioMutation {
  switch (section) {
    case "design":
      return "apply-design";
    case "appearance":
      return "visual";
    case "content":
      return "content";
    case "behavior":
      return "behavior";
    case "layout":
      return "layout";
  }
}

export function resolveCommandMutations(command: StudioCommand): StudioMutation[] {
  switch (command.type) {
    case "widget/add":
      return ["add"];
    case "widget/duplicate":
      return ["duplicate"];
    case "widget/delete":
      return ["delete"];
    case "widget/layout":
    case "widget/order":
      return ["layout"];
    case "widget/behavior":
      return ["behavior"];
    case "widget/content":
      return ["content"];
    case "widget/visual":
      return ["visual"];
    case "widget/apply-design":
      return command.widgetIds.length > 1 ? ["apply-all"] : ["apply-design"];
    case "widget/reset-section":
      return [resolveResetSectionMutation(command.section)];
    case "widget/restore-defaults":
      return ["content", "visual", "behavior"];
    case "session/copy":
      return ["layout", "behavior", "content", "visual", "apply-design"];
  }
}

function findWidgetsForCommand(
  document: ProfileDocumentV3,
  command: StudioCommand,
): WidgetInstanceV3[] {
  switch (command.type) {
    case "widget/add":
      return [command.widget];
    case "session/copy": {
      const sourceLayout = resolveSessionLayout(document, command.source);
      return [...sourceLayout.widgets];
    }
    default: {
      const layout = resolveSessionLayout(document, command.session);
      return command.widgetIds
        .map((widgetId) => layout.widgets.find((widget) => widget.id === widgetId))
        .filter((widget): widget is WidgetInstanceV3 => widget !== undefined);
    }
  }
}

export function assertCommandAccess(
  access: AccessContext,
  command: StudioCommand,
  document: ProfileDocumentV3,
  design?: WidgetDesignV1,
): void {
  const widgets = findWidgetsForCommand(document, command);
  const widgetIds = widgets.map((widget) => widget.id);
  const mutations = resolveCommandMutations(command);

  for (const mutation of mutations) {
    for (const widget of widgets) {
      const gate = getStudioMutationGate({ access, mutation, widget, design });
      if (!gate.allowed) {
        throw new StudioAccessError(
          mutation,
          widgetIds,
          STUDIO_WIDGET_ACCESS_MESSAGE,
        );
      }
    }
  }
}