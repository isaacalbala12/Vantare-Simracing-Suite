import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { PreviewInspector } from "../preview/PreviewInspector";
import { RelativeSettingsSection } from "./RelativeSettingsSection";
import { StandingsSettingsSection } from "./StandingsSettingsSection";

type WidgetSettingsPanelProps = {
  profile: ProfileConfig;
  widget: WidgetConfig | null;
  onChangeProfile: (profile: ProfileConfig) => void;
};

function statusLabel(enabled: boolean): string {
  return enabled ? "Activo" : "Oculto";
}


function WidgetHeader({ widget }: { widget: WidgetConfig }) {
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
        {statusLabel(widget.enabled)}
      </span>
    </div>
  );
}

export function WidgetSettingsPanel({ profile, widget, onChangeProfile }: WidgetSettingsPanelProps) {
  return (
    <div data-testid="widget-settings-panel" className="flex h-full min-h-0 flex-col overflow-y-auto">
      {widget ? <WidgetHeader widget={widget} /> : null}
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
        </div>
      )}
    </div>
  );
}
