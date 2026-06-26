import type {
  ColumnConfig,
  ProfileConfig,
  WidgetAppearance,
  WidgetConfig,
  WidgetVariantConfig,
} from "./profile";
import { findWidgetVariant } from "./widget-variants";

export type WidgetPreset = {
  id: string;
  name: string;
  widgetType: string;
  appearance: WidgetAppearance;
  variant?: {
    templateId?: string;
    themeId?: string;
    name?: string;
    columns?: ColumnConfig[];
    columnGroups?: WidgetVariantConfig["columnGroups"];
    filters?: Record<string, unknown>;
    formats?: Record<string, unknown>;
    slots?: WidgetVariantConfig["slots"];
  };
  props?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

const FORBIDDEN_PROP_KEYS = new Set([
  "appearance",
  "style",
  "__previewFillHost",
  "__engineerTransport",
  "mockSessionScenario",
  "telemetryMode",
]);

export type ExtractedPreset = Omit<WidgetPreset, "id" | "createdAt" | "updatedAt">;

export function extractPreset(widget: WidgetConfig, profile: ProfileConfig): ExtractedPreset {
  const appearance: WidgetAppearance = {};
  if (widget.props?.appearance && typeof widget.props.appearance === "object") {
    Object.assign(appearance, widget.props.appearance);
  }

  const internalProps: Record<string, unknown> = {};
  if (widget.props) {
    for (const [key, value] of Object.entries(widget.props)) {
      if (!FORBIDDEN_PROP_KEYS.has(key)) {
        internalProps[key] = structuredClone(value);
      }
    }
  }

  let variant: WidgetPreset["variant"];
  if (widget.variantId) {
    const v = findWidgetVariant(profile, widget);
    if (v) {
      const clone = structuredClone(v);
      variant = {
        templateId: clone.templateId,
        themeId: clone.themeId,
        name: clone.name,
        columns: clone.columns,
        columnGroups: clone.columnGroups,
        filters: clone.filters,
        formats: clone.formats,
        slots: clone.slots,
      };
    }
  }

  return {
    name: widget.name ?? widget.id,
    widgetType: widget.type,
    appearance,
    variant,
    props: Object.keys(internalProps).length > 0 ? internalProps : undefined,
  };
}

export type ApplyPresetResult = {
  widget: WidgetConfig;
  variant?: WidgetVariantConfig;
};

export function applyPreset(widget: WidgetConfig, preset: WidgetPreset): ApplyPresetResult {
  if (preset.widgetType !== widget.type) {
    throw new Error(
      `Preset type "${preset.widgetType}" does not match widget type "${widget.type}"`,
    );
  }

  const newProps: Record<string, unknown> = {};
  if (preset.props) {
    for (const [key, value] of Object.entries(preset.props)) {
      if (!FORBIDDEN_PROP_KEYS.has(key)) {
        newProps[key] = structuredClone(value);
      }
    }
  }
  newProps.appearance = { ...preset.appearance };
  if (widget.props?.style) {
    newProps.style = widget.props.style;
  }

  const newWidget: WidgetConfig = {
    ...widget,
    props: newProps,
  };

  let newVariant: WidgetVariantConfig | undefined;
  if (preset.variant) {
    const variantId = `preset-${preset.id}-${widget.id}`;
    newWidget.variantId = variantId;
    const clonedVariant = structuredClone(preset.variant);
    newVariant = {
      ...clonedVariant,
      id: variantId,
      widgetType: preset.widgetType,
      name: preset.name,
    };
  }

  return { widget: newWidget, variant: newVariant };
}

export function generatePresetId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
