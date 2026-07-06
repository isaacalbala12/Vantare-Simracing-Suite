import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { ProfileConfig, WidgetConfig, SlotConfig, ColumnConfig, ColumnGroupConfig } from "../../lib/profile";
import { PreviewInspector } from "../preview/PreviewInspector";
import { RelativeSettingsSection } from "./RelativeSettingsSection";
import { StandingsSettingsSection } from "./StandingsSettingsSection";
import { PedalsSettingsSection } from "./PedalsSettingsSection";
import { WidgetPresetSection } from "./WidgetPresetSection";
import { WidgetConfigSections } from "./WidgetConfigSections";
import { WidgetDesignGallery } from "../widgets/WidgetDesignGallery";
import { applyOfficialDesignToProfile, getActiveOfficialDesignId, type OfficialDesign } from "../widgets/widget-design-gallery";
import { WidgetVariantManager } from "./WidgetVariantManager";
import { useAccess } from "../../lib/access";
import { canApplyWidget } from "./widget-catalog";
import { resolveEffectiveWidgetVariant } from "./widget-config-model";

type WidgetSettingsPanelProps = {
  profile: ProfileConfig;
  widget: WidgetConfig | null;
  onChangeProfile: (profile: ProfileConfig) => void;
};

type DraftConfig = {
  slots: SlotConfig[];
  columns: ColumnConfig[];
  columnGroups: ColumnGroupConfig[];
};

function WidgetHeader({ widget }: { widget: WidgetConfig }) {
  const { t } = useI18n();
  const widgetName = widget.name || widget.id;
  return (
    <div
      className="sticky top-0 z-10 -mx-1 flex flex-none items-center justify-between gap-3 border-b border-white/5 bg-vantare-bg/95 px-3 py-2 backdrop-blur"
      data-testid="widget-settings-header"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="font-display text-sm font-bold uppercase tracking-[0.18em] text-white truncate">
          {widgetName}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-vantare-textDim">
          {widget.type}
        </span>
      </div>
      <span
        className={`shrink-0 font-mono text-[10px] font-bold uppercase tracking-widest ${
          widget.enabled ? "text-emerald-400" : "text-vantare-textDim"
        }`}
      >
        {widget.enabled ? t("studio.widgetStatus.active") : t("studio.widgetStatus.hidden")}
      </span>
    </div>
  );
}

function isDraftDirty(draft: DraftConfig, effective: DraftConfig): boolean {
  return (
    JSON.stringify(draft.slots) !== JSON.stringify(effective.slots) ||
    JSON.stringify(draft.columns) !== JSON.stringify(effective.columns) ||
    JSON.stringify(draft.columnGroups) !== JSON.stringify(effective.columnGroups)
  );
}

export function WidgetSettingsPanel({ profile, widget, onChangeProfile }: WidgetSettingsPanelProps) {
  const access = useAccess();
  const canApply = widget ? canApplyWidget(widget.type, access) : false;
  const { t } = useI18n();

  const effective = useMemo(
    () => widget
      ? resolveEffectiveWidgetVariant(widget, profile)
      : { slots: [], columns: [], columnGroups: [] },
    [widget, profile],
  );

  const [draft, setDraft] = useState<DraftConfig>({
    slots: effective.slots,
    columns: effective.columns,
    columnGroups: effective.columnGroups,
  });

  // Reset draft when widget changes
  const prevWidgetId = useRef(widget?.id);
  useEffect(() => {
    if (widget?.id !== prevWidgetId.current) {
      prevWidgetId.current = widget?.id;
      setDraft({
        slots: effective.slots,
        columns: effective.columns,
        columnGroups: effective.columnGroups,
      });
    }
  }, [widget?.id, effective.slots, effective.columns, effective.columnGroups]);

  const dirty = isDraftDirty(draft, effective);

  const handleDraftChange = useCallback(
    (changes: { slots?: SlotConfig[]; columns?: ColumnConfig[]; columnGroups?: ColumnGroupConfig[] }) => {
      setDraft((prev) => ({
        ...prev,
        ...(changes.slots !== undefined ? { slots: changes.slots } : {}),
        ...(changes.columns !== undefined ? { columns: changes.columns } : {}),
        ...(changes.columnGroups !== undefined ? { columnGroups: changes.columnGroups } : {}),
      }));
    },
    [],
  );

  const handleSaveToWidget = useCallback(() => {
    if (!widget || !canApply) return;
    const updatedWidgets = profile.widgets.map((w) => {
      if (w.id !== widget.id) return w;
      return {
        ...w,
        props: {
          ...w.props,
          slots: draft.slots,
          columns: draft.columns,
          columnGroups: draft.columnGroups,
        },
      };
    });
    onChangeProfile({ ...profile, widgets: updatedWidgets });
  }, [widget, canApply, profile, draft, onChangeProfile]);

  const handleDiscard = useCallback(() => {
    setDraft({
      slots: effective.slots,
      columns: effective.columns,
      columnGroups: effective.columnGroups,
    });
  }, [effective]);

  const handleApplyOfficialDesign = (design: OfficialDesign) => {
    if (!widget || !canApply) return;
    onChangeProfile(applyOfficialDesignToProfile(profile, widget.id, design));
  };

  return (
    <div data-testid="widget-settings-panel" className="flex h-full min-h-0 flex-col overflow-y-auto">
      {widget ? <WidgetHeader widget={widget} /> : null}
      {widget && !canApply && (
        <div
          className="mx-2 mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-widest text-amber-400"
          data-testid="pro-upgrade-notice"
        >
          {t("studio.proUpgrade")}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <PreviewInspector
          profile={profile}
          widget={widget}
          onChangeProfile={onChangeProfile}
          disabled={false}
          showPositionControls={false}
          showDangerActions={false}
        />
      </div>
      {widget && (
        <div className="shrink-0">
          <WidgetDesignGallery widget={widget} activeDesignId={getActiveOfficialDesignId(widget)} onApplyDesign={handleApplyOfficialDesign} />
          <WidgetVariantManager
            profile={profile}
            widget={widget}
            onChangeProfile={onChangeProfile}
            canApply={canApply}
            draft={dirty ? draft : undefined}
          />

          {/* Draft actions */}
          {dirty && canApply && (
            <div className="flex items-center gap-2 border-t border-white/5 px-3 py-2" data-testid="draft-actions">
              <button
                type="button"
                onClick={handleSaveToWidget}
                data-testid="save-to-widget-btn"
                className="rounded bg-vantare-accent/80 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white hover:bg-vantare-accent cursor-pointer"
              >
                {t("studio.saveToWidget")}
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                data-testid="discard-changes-btn"
                className="rounded border border-white/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-vantare-textMuted hover:bg-white/5 cursor-pointer"
              >
                {t("studio.discard")}
              </button>
            </div>
          )}

          <WidgetConfigSections
            slots={draft.slots}
            columns={draft.columns}
            columnGroups={draft.columnGroups}
            widgetType={widget.type}
            canApply={canApply}
            onDraftChange={handleDraftChange}
          />
          <RelativeSettingsSection
            profile={profile}
            widget={widget}
            onChangeProfile={onChangeProfile}
          />
          <StandingsSettingsSection
            profile={profile}
            widget={widget}
            onChangeProfile={onChangeProfile}
          />
          <PedalsSettingsSection
            profile={profile}
            widget={widget}
            onChangeProfile={onChangeProfile}
          />
          <WidgetPresetSection
            profile={profile}
            widget={widget}
            onChangeProfile={onChangeProfile}
          />
        </div>
      )}
    </div>
  );
}
