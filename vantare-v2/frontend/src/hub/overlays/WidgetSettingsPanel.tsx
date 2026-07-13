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
import { applyOfficialDesignToProfile, getActiveOfficialDesignId, getOfficialDesign, type OfficialDesign } from "../widgets/widget-design-gallery";
import { WidgetVariantManager } from "./WidgetVariantManager";
import { useAccess } from "../../lib/access";
import { canApplyWidget } from "./widget-catalog";
import { resolveEffectiveWidgetVariant } from "./widget-config-model";
import { SubNavRail } from "./SubNavRail";
import { SubNavContent } from "./SubNavContent";
import { getSectionsForWidget, type SubNavSectionId } from "./sub-nav-config";

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

  // Sub-nav state
  const sections = widget ? getSectionsForWidget(widget.type) : [];
  const [activeSectionId, setActiveSectionId] = useState<SubNavSectionId | null>(
    () => sections.length > 0 ? sections[0].id : null
  );

  // Derive the effective active section — if the stored id doesn't belong to
  // the current sections, fall back to the first section
  const effectiveSectionId = (() => {
    if (activeSectionId && sections.some((s) => s.id === activeSectionId)) {
      return activeSectionId;
    }
    return sections.length > 0 ? sections[0].id : null;
  })();

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

  const handleToggleVisibility = useCallback(() => {
    if (!widget) return;
    const updatedWidgets = profile.widgets.map((w) =>
      w.id === widget.id ? { ...w, enabled: !w.enabled } : w
    );
    onChangeProfile({ ...profile, widgets: updatedWidgets });
  }, [widget, profile, onChangeProfile]);

  const activeDesignId = widget ? getActiveOfficialDesignId(widget) : null;
  const selectedDesign = activeDesignId ? getOfficialDesign(activeDesignId) : null;
  const sameTypeWidgets = widget
    ? profile.widgets.filter((w) => w.type === widget.type)
    : [];



  if (!widget) {
    return (
      <div data-testid="widget-settings-panel" className="glass-panel flex h-full items-center justify-center rounded-xl text-sm text-vantare-textMuted">
        Selecciona un widget para editar
      </div>
    );
  }

  // Pro upgrade notice (rendered above the sub-nav for visibility)
  const proNotice = !canApply ? (
    <div
      className="mx-2 mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-widest text-amber-400"
      data-testid="pro-upgrade-notice"
    >
      {t("studio.proUpgrade")}
    </div>
  ) : null;

  return (
    <div data-testid="widget-settings-panel" className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl">
      {proNotice}
      <div className="flex min-h-0 flex-1">
        {/* Sub-nav rail */}
        <SubNavRail
          widgetName={widget.name || widget.id}
          widgetEnabled={widget.enabled}
          sections={sections}
          activeSectionId={effectiveSectionId ?? ""}
          onSelectSection={(id) => setActiveSectionId(id as SubNavSectionId)}
          onToggleVisibility={handleToggleVisibility}
          dirty={dirty}
          onReset={handleDiscard}
        />

        {/* Sub-nav content */}
        <SubNavContent
          sections={sections}
          activeSectionId={effectiveSectionId ?? ""}
          onResetSection={handleDiscard}
        >
          {/* Diseño section */}
          {effectiveSectionId === "diseno" && (
            <div className="sn-section space-y-3">
              <WidgetDesignGallery
                widget={widget}
                activeDesignId={activeDesignId}
                onApplyDesign={handleApplyOfficialDesign}
              />
              {selectedDesign && sameTypeWidgets.length > 1 && (
                <button
                  type="button"
                  data-testid="apply-design-to-all"
                  onClick={() => {
                    let updated = profile;
                    for (const w of sameTypeWidgets) {
                      updated = applyOfficialDesignToProfile(updated, w.id, selectedDesign);
                    }
                    onChangeProfile(updated);
                  }}
                  className="w-full rounded bg-vantare-red-500/20 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-vantare-red-400 hover:bg-vantare-red-500/30 cursor-pointer transition-colors"
                >
                  Aplicar a todos
                </button>
              )}
              <WidgetVariantManager
                profile={profile}
                widget={widget}
                onChangeProfile={onChangeProfile}
                canApply={canApply}
                draft={dirty ? draft : undefined}
              />
              <WidgetPresetSection
                profile={profile}
                widget={widget}
                onChangeProfile={onChangeProfile}
              />
            </div>
          )}

          {/* Apariencia section */}
          {effectiveSectionId === "apariencia" && (
            <div className="sn-section">
              <PreviewInspector
                profile={profile}
                widget={widget}
                onChangeProfile={onChangeProfile}
                disabled={false}
                showPositionControls={false}
                showDangerActions={false}
                showAppearanceControls={true}
              />
            </div>
          )}

          {/* Columnas section (relative/standings) */}
          {effectiveSectionId === "columnas" && (
            <div className="sn-section space-y-3">
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
              {dirty && canApply && (
                <div className="flex items-center gap-2 border-t border-white/5 pt-3" data-testid="draft-actions">
                  <button
                    type="button"
                    onClick={handleSaveToWidget}
                    data-testid="save-to-widget-btn"
                    className="rounded bg-vantare-red-500/80 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white hover:bg-vantare-red-500 cursor-pointer"
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
            </div>
          )}

          {/* Slots section (non-relative/standings) */}
          {effectiveSectionId === "slots" && (
            <div className="sn-section space-y-3">
              <WidgetConfigSections
                slots={draft.slots}
                columns={draft.columns}
                columnGroups={draft.columnGroups}
                widgetType={widget.type}
                canApply={canApply}
                onDraftChange={handleDraftChange}
              />
              {dirty && canApply && (
                <div className="flex items-center gap-2 border-t border-white/5 pt-3" data-testid="draft-actions">
                  <button
                    type="button"
                    onClick={handleSaveToWidget}
                    data-testid="save-to-widget-btn"
                    className="rounded bg-vantare-red-500/80 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white hover:bg-vantare-red-500 cursor-pointer"
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
            </div>
          )}

          {/* Colores section (pedals) */}
          {effectiveSectionId === "colores" && (
            <div className="sn-section">
              <PedalsSettingsSection
                profile={profile}
                widget={widget}
                onChangeProfile={onChangeProfile}
              />
            </div>
          )}

          {/* Visibilidad section */}
          {effectiveSectionId === "visibilidad" && (
            <div className="sn-section">
              <PreviewInspector
                profile={profile}
                widget={widget}
                onChangeProfile={onChangeProfile}
                disabled={false}
                showPositionControls={false}
                showDangerActions={false}
                showAppearanceControls={false}
              />
            </div>
          )}

          {/* General section */}
          {effectiveSectionId === "general" && (
            <div className="sn-section">
              <PreviewInspector
                profile={profile}
                widget={widget}
                onChangeProfile={onChangeProfile}
                disabled={false}
                showPositionControls={false}
                showDangerActions={false}
                showAppearanceControls={false}
              />
            </div>
          )}
        </SubNavContent>
      </div>
    </div>
  );
}
