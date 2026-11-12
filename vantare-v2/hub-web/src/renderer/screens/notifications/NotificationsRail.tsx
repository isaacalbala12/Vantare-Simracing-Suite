import { useQuery } from "@tanstack/react-query";
import type { LauncherView } from "../../../contract/generated/launcher";
import { coreKey, offline, useHost } from "../../app/Host";
import { useUi } from "../../app/UiState";
import { NotificationsRailLayout } from "../../ui/NotificationsRailLayout";

/** The frozen GPUI's operational context; reads the existing launcher snapshot. */
export function NotificationsRail() {
  const { client } = useHost();
  const collapsed = useUi((s) => s.railCollapsed);
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const allowed = core.access.verified && !core.access.blocked;
  const profiles = useQuery<LauncherView>({
    queryKey: ["launcher"],
    enabled: !!client && allowed && !collapsed && !core.live,
    retry: false,
    queryFn: async () => {
      if (!client) throw new Error("Host unavailable");
      const reply = await client.request({ method: "launcher.get" });
      if (reply.method !== "launcher.get")
        throw new Error("Unexpected launcher reply");
      return reply.value;
    },
  });
  return (
    <NotificationsRailLayout
      tester={allowed && core.access.tester}
      allowed={allowed}
      view={allowed ? profiles.data : undefined}
      failed={profiles.isError}
      retry={() => void profiles.refetch()}
    />
  );
}
