import type { ColumnConfig, ProfileConfig, WidgetConfig, WidgetPropsMap, WidgetVariantConfig } from "./profile";
import { RELATIVE_DEFAULT_TEMPLATE_ID, createDefaultRelativeColumns, getRelativeColumn } from "../overlay/widgets/relative-catalog";
import { DEFAULT_RELATIVE_FILTERS } from "../overlay/widgets/relative-filters";
import { createDefaultStandingsColumns, getStandingsColumn } from "../overlay/widgets/standings-catalog";

const STANDINGS_DEFAULT_TEMPLATE_ID = "standings-vantare-default";

type RenderVariant = {
  id: string;
  templateId?: string;
  themeId?: string;
  columns: ColumnConfig[];
  filters?: Record<string, unknown>;
};

export type WidgetPropsWithVariant = WidgetPropsMap & {
  variant?: RenderVariant;
};

export function findWidgetVariant(profile: ProfileConfig, widget: WidgetConfig): WidgetVariantConfig | undefined {
  if (!widget.variantId) return undefined;
  return profile.variants?.find((variant) => variant.id === widget.variantId && variant.widgetType === widget.type);
}

export function withDefaultWidgetVariants(profile: ProfileConfig): ProfileConfig {
  const widgets = [...profile.widgets];
  const variants = [...(profile.variants ?? [])];
  let changed = false;

  for (let i = 0; i < widgets.length; i++) {
    const widget = widgets[i];
    if (widget.type !== "relative" && widget.type !== "standings") continue;

    let variantId = widget.variantId;
    if (!variantId) {
      variantId = `variant-${widget.id}-default`;
      widgets[i] = { ...widget, variantId };
      changed = true;
    }

    const index = variants.findIndex((variant) => variant.id === variantId);
    if (index === -1) {
      const createdVariant =
        widget.type === "relative"
          ? createDefaultRelativeVariant(variantId)
          : createDefaultStandingsVariant(variantId);
      variants.push(createdVariant);
      changed = true;
      continue;
    }
    const current = variants[index];
    const normalized =
      widget.type === "relative"
        ? normalizeRelativeVariant(current)
        : normalizeStandingsVariant(current);
    if (!deepEqual(current, normalized)) {
      variants[index] = normalized;
      changed = true;
    }
  }

  return changed ? { ...profile, widgets, variants } : profile;
}

export function toggleRelativeColumn(
  profile: ProfileConfig,
  widgetId: string,
  columnId: string,
  enabled: boolean,
): ProfileConfig {
  if (!getRelativeColumn(columnId)) return profile;

  const base = withDefaultWidgetVariants(profile);
  const widget = base.widgets.find((item) => item.id === widgetId && item.type === "relative");
  if (!widget?.variantId) return profile;

  const variants = (base.variants ?? []).map((variant) => {
    if (variant.id !== widget.variantId || variant.widgetType !== "relative") return variant;
    const normalized = normalizeRelativeVariant(variant);
    return {
      ...normalized,
      columns: normalized.columns?.map((column) =>
        column.id === columnId ? { ...column, enabled } : column,
      ),
    };
  });

  return { ...base, variants };
}

export function toggleStandingsColumn(
  profile: ProfileConfig,
  widgetId: string,
  columnId: string,
  enabled: boolean,
): ProfileConfig {
  if (!getStandingsColumn(columnId)) return profile;

  const base = withDefaultWidgetVariants(profile);
  const widget = base.widgets.find((item) => item.id === widgetId && item.type === "standings");
  if (!widget?.variantId) return profile;

  const variants = (base.variants ?? []).map((variant) => {
    if (variant.id !== widget.variantId || variant.widgetType !== "standings") return variant;
    const normalized = normalizeStandingsVariant(variant);
    return {
      ...normalized,
      columns: normalized.columns?.map((column) =>
        column.id === columnId ? { ...column, enabled } : column,
      ),
    };
  });

  return { ...base, variants };
}

export function enrichWidgetPropsWithVariant(profile: ProfileConfig | null | undefined, widget: WidgetConfig): WidgetPropsWithVariant {
  const props: WidgetPropsWithVariant = {
    ...(widget.props ?? {}),
    style: widget.style ?? widget.props?.style,
  };
  if (!profile) return props;

  const normalized = withDefaultWidgetVariants(profile);
  const normalizedWidget = normalized.widgets.find((w) => w.id === widget.id) ?? widget;
  const variant = findWidgetVariant(normalized, normalizedWidget);
  if (!variant) return props;

  const renderVariant =
    widget.type === "relative"
      ? normalizeRelativeVariant(variant)
      : widget.type === "standings"
        ? normalizeStandingsVariant(variant)
        : variant;

  const templateId =
    widget.type === "relative"
      ? renderVariant.templateId ?? RELATIVE_DEFAULT_TEMPLATE_ID
      : widget.type === "standings"
        ? renderVariant.templateId ?? STANDINGS_DEFAULT_TEMPLATE_ID
        : renderVariant.templateId;

  return {
    ...props,
    variant: {
      id: renderVariant.id,
      templateId,
      themeId: renderVariant.themeId,
      columns: renderVariant.columns ?? [],
      filters: renderVariant.filters,
    },
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a === null || b === null) return false;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!bKeys.includes(key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }

  return true;
}

function createDefaultRelativeVariant(id: string): WidgetVariantConfig {
  return {
    id,
    widgetType: "relative",
    templateId: RELATIVE_DEFAULT_TEMPLATE_ID,
    themeId: "vantare-racing",
    name: "Relative Default",
    columns: createDefaultRelativeColumns(),
    filters: { ...DEFAULT_RELATIVE_FILTERS },
  };
}

function normalizeRelativeFilters(filters?: Record<string, unknown>): Record<string, unknown> {
  return {
    ...DEFAULT_RELATIVE_FILTERS,
    ...(filters ?? {}),
  };
}

function normalizeRelativeVariant(variant: WidgetVariantConfig): WidgetVariantConfig {
  const defaults = createDefaultRelativeColumns();
  const current = variant.columns ?? [];
  const columns = defaults.map((defaultColumn) => {
    const existing = current.find((column) => column.id === defaultColumn.id);
    if (!existing) return defaultColumn;

    const mergedFormat = { ...(defaultColumn.format ?? {}), ...(existing.format ?? {}) };
    const mergedStyle = { ...(defaultColumn.style ?? {}), ...(existing.style ?? {}) };
    const result: ColumnConfig = {
      ...defaultColumn,
      ...existing,
    };
    if (Object.keys(mergedFormat).length > 0) {
      result.format = mergedFormat;
    }
    if (Object.keys(mergedStyle).length > 0) {
      result.style = mergedStyle;
    }
    return result;
  });

  return {
    ...variant,
    widgetType: "relative",
    templateId: variant.templateId ?? RELATIVE_DEFAULT_TEMPLATE_ID,
    columns,
    filters: normalizeRelativeFilters(variant.filters),
  };
}

function createDefaultStandingsVariant(id: string): WidgetVariantConfig {
  return {
    id,
    widgetType: "standings",
    templateId: STANDINGS_DEFAULT_TEMPLATE_ID,
    themeId: "vantare-racing",
    name: "Standings Default",
    columns: createDefaultStandingsColumns(),
  };
}

function normalizeStandingsVariant(variant: WidgetVariantConfig): WidgetVariantConfig {
  const defaults = createDefaultStandingsColumns();
  const current = variant.columns ?? [];
  const columns = defaults.map((defaultColumn) => {
    const existing = current.find((column) => column.id === defaultColumn.id);
    if (!existing) return defaultColumn;

    const mergedFormat = { ...(defaultColumn.format ?? {}), ...(existing.format ?? {}) };
    const mergedStyle = { ...(defaultColumn.style ?? {}), ...(existing.style ?? {}) };
    const result: ColumnConfig = {
      ...defaultColumn,
      ...existing,
    };
    if (Object.keys(mergedFormat).length > 0) {
      result.format = mergedFormat;
    }
    if (Object.keys(mergedStyle).length > 0) {
      result.style = mergedStyle;
    }
    return result;
  });

  return {
    ...variant,
    widgetType: "standings",
    templateId: variant.templateId ?? STANDINGS_DEFAULT_TEMPLATE_ID,
    columns,
  };
}
