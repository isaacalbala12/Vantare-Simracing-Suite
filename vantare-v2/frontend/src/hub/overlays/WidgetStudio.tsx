import { useState } from "react";
import { I18nProvider, useI18n } from "../../i18n/I18nProvider";
import type { ProfileConfig } from "../../lib/profile";
import type { MockSessionScenario } from "../../overlay/widgets/mock-telemetry";
import type { SaveState } from "./useOverlayStudioState";
import { StudioWidgetList } from "./StudioWidgetList";
import { WidgetPreviewPanel } from "./WidgetPreviewPanel";
import { WidgetSettingsPanel } from "./WidgetSettingsPanel";
import {
  applyOfficialDesignToProfile,
  getOfficialDesign,
  listOfficialDesigns,
  getActiveOfficialDesignId,
  resetWidgetDesignToBase,
} from "../widgets/widget-design-gallery";

type WidgetStudioProps = {
  profile: ProfileConfig;
  selectedWidgetId: string | null;
  dirty: boolean;
  saveState: SaveState;
  onSelectWidget: (id: string) => void;
  onChangeProfile: (profile: ProfileConfig) => void;
  onSave: () => void;
  onBack: () => void;
};

function WidgetStudioInner({
  profile,
  selectedWidgetId,
  dirty,
  saveState,
  onSelectWidget,
  onChangeProfile,
  onSave,
  onBack,
}: WidgetStudioProps) {
  const { t } = useI18n();
  const selectedWidget = profile.widgets.find((widget) => widget.id === selectedWidgetId) ?? profile.widgets[0] ?? null;
  const [mockSessionScenario, setMockSessionScenario] = useState<MockSessionScenario>("race");
  const activeDesignId = selectedWidget ? getActiveOfficialDesignId(selectedWidget) : null;

  const saveLabel =
    saveState === "saving"
      ? t("studio.saveLabel.saving")
      : saveState === "saved"
        ? t("studio.saveLabel.saved")
        : saveState === "error"
          ? t("studio.saveLabel.error")
          : dirty
            ? t("studio.saveLabel.dirty")
            : t("studio.saveLabel.idle");
  const saveAccent = saveState === "error" || (saveState === "idle" && dirty);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-vantare-bg px-4 py-3">
      <div className="mb-2 flex flex-none items-center justify-between gap-4 border-b border-white/5 pb-2">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-[10px] font-bold uppercase tracking-widest text-vantare-textMuted transition-colors hover:text-white cursor-pointer"
          >
            {t("studio.overlaysStudio")}
          </button>
          <span className="h-3 w-px bg-white/10" aria-hidden="true" />
          <h1 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-white">
            {t("studio.widgets")}
          </h1>
          <span className="hidden font-mono text-[10px] text-vantare-textDim sm:inline">
            {t("studio.internalEdit")}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest ${
              saveAccent ? "text-vantare-red-400" : "text-vantare-textMuted"
            }`}
            data-testid="widget-studio-save-state"
          >
            <span
              aria-hidden="true"
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                saveAccent
                  ? "bg-vantare-red-500 shadow-[0_0_6px_var(--v-red-500)]"
                  : saveState === "saved"
                    ? "bg-emerald-400"
                    : "bg-vantare-textDim"
              }`}
            />
            {saveLabel}
          </span>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saveState === "saving"}
            data-testid="widget-studio-save-btn"
            className="btn-secondary rounded-md px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {t("studio.save")}
          </button>
        </div>
      </div>
      <div className="flex flex-none items-center gap-2 border-b border-white/5 px-3 py-2" data-testid="design-system-selector">
        <label
          htmlFor="design-system-select"
          className="font-mono text-[10px] font-bold uppercase tracking-widest text-vantare-textDim"
        >
          {t("studio.designLabel")}
        </label>
        <select
          id="design-system-select"
          value={activeDesignId ?? "base"}
          onChange={(e) => {
            const value = e.target.value;
            if (!selectedWidget) return;
            if (value === "base") {
              onChangeProfile(resetWidgetDesignToBase(profile, selectedWidget.id));
              return;
            }
            const design = getOfficialDesign(value);
            if (design) onChangeProfile(applyOfficialDesignToProfile(profile, selectedWidget.id, design));
          }}
          className="rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[10px] text-white cursor-pointer"
        >
          <option value="base">Base</option>
          {selectedWidget
            ? listOfficialDesigns(selectedWidget.type).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))
            : null}
        </select>
      </div>

      <div
        data-testid="widget-studio-grid"
        className="grid min-h-0 flex-1 gap-3 overflow-y-auto lg:grid-cols-[260px_1fr_360px] lg:grid-rows-[1fr] lg:overflow-hidden"
      >
        <StudioWidgetList
          widgets={profile.widgets}
          selectedWidgetId={selectedWidget?.id ?? null}
          onSelectWidget={onSelectWidget}
        />
        <div className="flex min-h-0 flex-col gap-2">
          {selectedWidget?.type === "standings" ? (
            <div
              className="flex items-center gap-2 border-b border-white/5 pb-2"
              data-testid="mock-session-selector"
            >
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-vantare-textDim">
                {t("studio.mock")}
              </span>
              <div className="flex overflow-hidden rounded-md border border-white/10 bg-black/40">
                {[
                  ["practice", t("studio.mockPractice")],
                  ["qual", t("studio.mockQualy")],
                  ["race", t("studio.mockRace")],
                ].map(([value, label]) => {
                  const active = value === mockSessionScenario;
                  return (
                    <button
                      key={value}
                      type="button"
                      data-testid={`mock-session-${value}`}
                      aria-pressed={active}
                      onClick={() => setMockSessionScenario(value as MockSessionScenario)}
                      className={`border-r border-white/5 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors last:border-r-0 cursor-pointer ${
                        active
                          ? "bg-white/10 text-white"
                          : "text-vantare-textMuted hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <WidgetPreviewPanel profile={profile} activeWidget={selectedWidget} mockSessionScenario={mockSessionScenario} />
        </div>
        <WidgetSettingsPanel
          profile={profile}
          widget={selectedWidget}
          onChangeProfile={onChangeProfile}
        />
      </div>
    </div>
  );
}

export function WidgetStudio(props: WidgetStudioProps) {
  return (
    <I18nProvider>
      <WidgetStudioInner {...props} />
    </I18nProvider>
  );
}
