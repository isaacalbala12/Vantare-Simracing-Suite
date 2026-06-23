import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { PreviewInspector } from "../preview/PreviewInspector";
import { RelativeSettingsSection } from "./RelativeSettingsSection";
import { StandingsSettingsSection } from "./StandingsSettingsSection";

type WidgetSettingsPanelProps = {
  profile: ProfileConfig;
  widget: WidgetConfig | null;
  onChangeProfile: (profile: ProfileConfig) => void;
};

export function WidgetSettingsPanel({ profile, widget, onChangeProfile }: WidgetSettingsPanelProps) {
  return (
    <div data-testid="widget-settings-panel" className="flex h-full min-h-0 flex-col overflow-y-auto">
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
