import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import type { MockSessionScenario } from "../../overlay/widgets/mock-telemetry";
import { WidgetSandboxPreview } from "./WidgetSandboxPreview";

type WidgetPreviewPanelProps = {
  profile: ProfileConfig;
  activeWidget: WidgetConfig | null;
  mockSessionScenario?: MockSessionScenario;
};

export function WidgetPreviewPanel({ profile, activeWidget, mockSessionScenario }: WidgetPreviewPanelProps) {
  return <WidgetSandboxPreview profile={profile} activeWidget={activeWidget} mockSessionScenario={mockSessionScenario} />;
}
