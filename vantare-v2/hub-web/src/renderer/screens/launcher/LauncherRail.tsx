import { LauncherApplicationsRail } from "../../ui/launcher/ApplicationsRail";
import { useLauncherSnapshot } from "./state";
export function LauncherRail() {
  const { view, selected } = useLauncherSnapshot();
  if (!view) return null;
  return <LauncherApplicationsRail view={view} selected={selected} />;
}
