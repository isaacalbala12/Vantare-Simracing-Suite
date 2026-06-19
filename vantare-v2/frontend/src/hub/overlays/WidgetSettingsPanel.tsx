import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { PreviewInspector } from "../preview/PreviewInspector";

type WidgetSettingsPanelProps = {
  profile: ProfileConfig;
  widget: WidgetConfig | null;
  onChangeProfile: (profile: ProfileConfig) => void;
};

export function WidgetSettingsPanel({ profile, widget, onChangeProfile }: WidgetSettingsPanelProps) {
  return (
    <PreviewInspector
      profile={profile}
      widget={widget}
      onChangeProfile={onChangeProfile}
      disabled={false}
      showPositionControls={false}
      showDangerActions={false}
    />
  );
}
