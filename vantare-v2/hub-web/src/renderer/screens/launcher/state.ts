import { useQuery } from "@tanstack/react-query";
import type { LauncherView } from "../../../contract/generated/contract";
export const launcherKey = ["launcher"] as const;
export const launcherSelectionKey = ["launcher", "selection"] as const;
export function useLauncherSnapshot() {
  const { data: view } = useQuery<LauncherView>({
    queryKey: launcherKey,
    enabled: false,
  });
  const { data: selected } = useQuery<string>({
    queryKey: launcherSelectionKey,
    enabled: false,
  });
  return { view, selected };
}
