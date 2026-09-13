import {
  isFeatureAllowed,
  isWidgetTypeAllowed,
  type WidgetPolicyWire,
} from '../../../overlay/core/widget-policy';
import {
  STUDIO_PREMIUM_SAVE_DENIED_KEY,
  STUDIO_WIDGET_ACCESS_MESSAGE_KEY,
} from '../studio-v3-i18n';
import type {
  ProfileDocumentV3,
  SessionLayoutType,
  WidgetInstanceV3,
} from '../../../overlay/core/profile-document';
import {
  resolveDesignRequiredFeature,
  type WidgetDesignV1,
} from '../../../overlay/core/widget-design';
import { getWidgetRequiredFeature } from '../../../overlay/core/widget-definition';
import type { FeatureGate, FeatureId } from '../../../lib/access-policy';
import type { StudioCommand } from '../state/studio-command';
import { resolveSessionLayout } from '../state/session-layouts';

export type StudioMutation =
  | 'add'
  | 'duplicate'
  | 'delete'
  | 'layout'
  | 'behavior'
  | 'content'
  | 'visual'
  | 'apply-design'
  | 'apply-all'
  | 'save';

export class StudioAccessError extends Error {
  readonly mutation: StudioMutation;
  readonly widgetIds: readonly string[];

  constructor(mutation: StudioMutation, widgetIds: readonly string[], message: string) {
    super(message);
    this.name = 'StudioAccessError';
    this.mutation = mutation;
    this.widgetIds = widgetIds;
  }
}

/**
 * Live widget policy in Studio. It is the native snapshot
 * (`WidgetPolicyWire`) or null before the first snapshot: without a valid
 * decision the basic Free matrix applies, with no legacy license fallback.
 */
export type StudioPolicy = WidgetPolicyWire | null;

const SESSION_LAYOUT_TYPES: readonly SessionLayoutType[] = [
  'general',
  'practice',
  'qualifying',
  'race',
  'endurance',
];

function collectRequiredFeatures(widget?: WidgetInstanceV3, design?: WidgetDesignV1): FeatureId[] {
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

function hasFullWidgetAccess(policy: StudioPolicy, widget: WidgetInstanceV3): boolean {
  return isWidgetTypeAllowed(policy, widget.type);
}

function widgetNonLayoutEqual(left: WidgetInstanceV3, right: WidgetInstanceV3): boolean {
  const { layout: leftLayout, ...leftRest } = left;
  const { layout: rightLayout, ...rightRest } = right;
  void leftLayout;
  void rightLayout;
  return JSON.stringify(leftRest) === JSON.stringify(rightRest);
}

export function getStudioMutationGate(input: {
  policy: StudioPolicy;
  mutation: StudioMutation;
  widget?: WidgetInstanceV3;
  design?: WidgetDesignV1;
}): FeatureGate {
  // Moving, keeping and deleting blocked widgets is always allowed: the
  // document stays whole and settings come back when rights return. Saving
  // also passes the gate; the draft content check validates the rest.
  if (input.mutation === 'save' || input.mutation === 'layout' || input.mutation === 'delete') {
    return { allowed: true };
  }

  for (const feature of collectRequiredFeatures(input.widget, input.design)) {
    if (!isFeatureAllowed(input.policy, feature)) {
      return { allowed: false, reason: 'upgrade' };
    }
  }

  return { allowed: true };
}

export function canMutateWidget(policy: StudioPolicy, widget: WidgetInstanceV3): boolean {
  return getStudioMutationGate({ policy, mutation: 'layout', widget }).allowed;
}

function widgetsEqual(left: WidgetInstanceV3, right: WidgetInstanceV3): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateDraftAccess(
  policy: StudioPolicy,
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
        if (!hasFullWidgetAccess(policy, widget)) {
          blockedIds.add(widget.id);
        }
        continue;
      }
      if (widgetsEqual(widget, savedWidget)) {
        continue;
      }
      if (hasFullWidgetAccess(policy, widget)) {
        continue;
      }
      if (widgetNonLayoutEqual(widget, savedWidget)) {
        continue;
      }
      blockedIds.add(widget.id);
    }

  }

  if (blockedIds.size === 0) {
    return { allowed: true };
  }

  return {
    allowed: false,
    widgetIds: [...blockedIds],
    reason: STUDIO_PREMIUM_SAVE_DENIED_KEY,
  };
}

function resolveResetSectionMutation(
  section: Extract<StudioCommand, { type: 'widget/reset-section' }>['section'],
): StudioMutation {
  switch (section) {
    case 'design':
      return 'apply-design';
    case 'appearance':
      return 'visual';
    case 'content':
      return 'content';
    case 'behavior':
      return 'behavior';
    case 'layout':
      return 'layout';
  }
}

export function resolveCommandMutations(command: StudioCommand): StudioMutation[] {
  switch (command.type) {
    case 'document/layout-viewport':
    case 'document/monitor':
      return ['layout'];
    case 'widget/add':
      return ['add'];
    case 'widget/duplicate':
      return ['duplicate'];
    case 'widget/delete':
      return ['delete'];
    case 'widget/layout':
    case 'widget/order':
      return ['layout'];
    case 'widget/behavior':
      return ['behavior'];
    case 'widget/content':
      return ['content'];
    case 'widget/visual':
      return ['visual'];
    case 'widget/apply-design':
      return command.widgetIds.length > 1 ? ['apply-all'] : ['apply-design'];
    case 'widget/reset-section':
      return [resolveResetSectionMutation(command.section)];
    case 'widget/restore-defaults':
      return ['content', 'visual', 'behavior'];
    case 'session/copy':
      return ['layout', 'behavior', 'content', 'visual', 'apply-design'];
  }
}

function findWidgetsForCommand(
  document: ProfileDocumentV3,
  command: StudioCommand,
): WidgetInstanceV3[] {
  switch (command.type) {
    case 'document/layout-viewport':
    case 'document/monitor': {
      const widgets = Object.values(document.layouts).flatMap((layout) => layout?.widgets ?? []);
      return [
        ...new Map(widgets.map((widget) => [`${widget.type}:${widget.id}`, widget])).values(),
      ];
    }
    case 'widget/add':
      return [command.widget];
    case 'session/copy': {
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
  policy: StudioPolicy,
  command: StudioCommand,
  document: ProfileDocumentV3,
  design?: WidgetDesignV1,
): void {
  const widgets = findWidgetsForCommand(document, command);
  const widgetIds = [...new Set(widgets.map((widget) => widget.id))];
  const mutations = resolveCommandMutations(command);

  for (const mutation of mutations) {
    for (const widget of widgets) {
      const gate = getStudioMutationGate({ policy, mutation, widget, design });
      if (!gate.allowed) {
        throw new StudioAccessError(mutation, widgetIds, STUDIO_WIDGET_ACCESS_MESSAGE_KEY);
      }
    }
  }
}
