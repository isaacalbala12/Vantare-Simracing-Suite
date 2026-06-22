import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { WidgetSandboxPreview } from "./WidgetSandboxPreview";

type WidgetPreviewPanelProps = {
  profile: ProfileConfig;
  activeWidget: WidgetConfig | null;
};

export function WidgetPreviewPanel({ profile, activeWidget }: WidgetPreviewPanelProps) {
  return <WidgetSandboxPreview profile={profile} activeWidget={activeWidget} />;
}
