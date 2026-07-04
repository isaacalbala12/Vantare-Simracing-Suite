/* eslint-disable react-refresh/only-export-components */

import { useState } from "react";
import type { ProfileConfig, WidgetConfig, WidgetVariantConfig, SlotConfig, ColumnConfig, ColumnGroupConfig } from "../../lib/profile";
import type { AccessContext } from "../../lib/access-policy";
import { canApplyWidget } from "./widget-catalog";
import {
  buildDefaultSlots,
  buildDefaultColumns,
  buildDefaultColumnGroups,
} from "./widget-config-model";

// ---------------------------------------------------------------------------
// Logic helpers (exported for testing)
// ---------------------------------------------------------------------------

export function saveVariant(
  profile: ProfileConfig,
  widget: WidgetConfig,
  variantName: string,
  access?: AccessContext,
  draft?: { slots?: SlotConfig[]; columns?: ColumnConfig[]; columnGroups?: ColumnGroupConfig[] },
): ProfileConfig {
  // Access guard: block save if user cannot apply this widget type
  if (access && !canApplyWidget(widget.type, access)) {
    return profile;
  }
  const variantId = `variant-${widget.type}-${Date.now()}`;

  // Preserve config from the currently-applied variant (if any), otherwise defaults
  const existingVariant = profile.variants?.find((v) => v.id === widget.variantId);

  const newVariant: WidgetVariantConfig = {
    id: variantId,
    widgetType: widget.type,
    themeId: widget.style,
    name: variantName,
    slots: draft?.slots ?? existingVariant?.slots ?? buildDefaultSlots(widget.type, widget.style),
    columns: draft?.columns ?? existingVariant?.columns ?? buildDefaultColumns(widget.type, widget.style),
    columnGroups: draft?.columnGroups ?? existingVariant?.columnGroups ?? buildDefaultColumnGroups(widget.type, widget.style),
  };

  return {
    ...profile,
    variants: [...(profile.variants ?? []), newVariant],
  };
}

export function applyVariant(
  profile: ProfileConfig,
  widgetId: string,
  variantId: string,
  access?: AccessContext,
): ProfileConfig {
  const variant = profile.variants?.find((v) => v.id === variantId);
  if (!variant) return profile;

  // Access guard: block apply if user cannot apply this widget type
  if (access) {
    const targetWidget = profile.widgets.find((w) => w.id === widgetId);
    if (targetWidget && !canApplyWidget(targetWidget.type, access)) {
      return profile;
    }
  }

  const widgets = profile.widgets.map((w) => {
    if (w.id !== widgetId) return w;
    return {
      ...w,
      variantId: variant.id,
      props: {
        ...w.props,
        ...(variant.slots !== undefined ? { slots: variant.slots } : {}),
        ...(variant.columns !== undefined ? { columns: variant.columns } : {}),
        ...(variant.columnGroups !== undefined ? { columnGroups: variant.columnGroups } : {}),
      },
    };
  });

  return { ...profile, widgets };
}

export function deleteVariant(
  profile: ProfileConfig,
  variantId: string,
): ProfileConfig {
  return {
    ...profile,
    variants: (profile.variants ?? []).filter((v) => v.id !== variantId),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type WidgetVariantManagerProps = {
  profile: ProfileConfig;
  widget: WidgetConfig;
  onChangeProfile: (p: ProfileConfig) => void;
  canApply?: boolean;
  draft?: { slots?: SlotConfig[]; columns?: ColumnConfig[]; columnGroups?: ColumnGroupConfig[] };
};
export function WidgetVariantManager({
  profile,
  widget,
  onChangeProfile,
  canApply = true,
  draft,
}: WidgetVariantManagerProps) {
  const [variantName, setVariantName] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    widget.variantId ?? "",
  );

  const variantsForType = (profile.variants ?? []).filter(
    (v) => v.widgetType === widget.type,
  );

  const handleSave = () => {
    if (!variantName.trim() || !canApply) return;
    const next = saveVariant(profile, widget, variantName.trim(), undefined, draft);
    onChangeProfile(next);
    setVariantName("");
  };

  const handleApply = () => {
    if (!selectedVariantId || !canApply) return;
    const next = applyVariant(profile, widget.id, selectedVariantId);
    onChangeProfile(next);
  };

  const handleDelete = (id: string) => {
    if (!canApply) return;
    const next = deleteVariant(profile, id);
    onChangeProfile(next);
    if (selectedVariantId === id) setSelectedVariantId("");
  };

  return (
    <div data-testid="widget-variant-manager" className="border-t border-white/5 px-3 py-2">
      <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-vantare-textMuted">
        Variants
      </div>

      {/* Save as Variant */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={variantName}
          onChange={(e) => setVariantName(e.target.value)}
          placeholder="Variant name…"
          className="min-w-0 flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-white placeholder:text-vantare-textDim"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!variantName.trim() || !canApply}
          data-testid="save-variant-btn"
          className="shrink-0 rounded bg-vantare-accent/80 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white hover:bg-vantare-accent disabled:opacity-40"
        >
          Save as Variant
        </button>
      </div>

      {/* Variant selector + apply / delete */}
      {variantsForType.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <select
            value={selectedVariantId}
            onChange={(e) => setSelectedVariantId(e.target.value)}
            className="min-w-0 flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-white"
          >
            <option value="">Select variant…</option>
            {variantsForType.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name ?? v.id}
                {v.themeId ? ` (${v.themeId})` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleApply}
            disabled={!selectedVariantId || !canApply}
            data-testid="apply-variant-btn"
            className="shrink-0 rounded border border-white/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white hover:bg-white/10 disabled:opacity-40"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedVariantId) handleDelete(selectedVariantId);
            }}
            disabled={!selectedVariantId || !canApply}
            data-testid="delete-variant-btn"
            className="shrink-0 rounded border border-red-500/30 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/10 disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
