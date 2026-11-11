import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { coreKey, offline, useHost } from "../../app/Host";
import { lock } from "../../app/navigation";
import { useSettings } from "../../app/SettingsState";
import { useUi } from "../../app/UiState";
import { appearanceText as text } from "../../i18n/appearance.es";
import { t } from "../../i18n/es";
import { AppearancePreview } from "../../ui/AppearancePreview";
import { Button } from "../../ui/Button";
import { RailBlock } from "../../ui/Frame";
import { launcherKey } from "../launcher/state";
import { previewProfile } from "./appearance-profile";
export function AppearanceRail() {
  const { client } = useHost();
  const cache = useQueryClient();
  const state = useSettings();
  const navigate = useUi((value) => value.navigate);
  const core =
    useQuery({
      queryKey: coreKey,
      queryFn: async () => offline,
      enabled: false,
    }).data ?? offline;
  const studioLock = lock("studio", core.access);
  const query = useQuery({
    queryKey: launcherKey,
    enabled: !!client,
    queryFn: async () => {
      const reply = await client?.request({ method: "launcher.get" });
      if (reply?.method !== "launcher.get")
        throw new Error("Launcher snapshot unavailable");
      return reply.value;
    },
  });
  useEffect(() => {
    if (!client) return;
    const off = client.listen((message) => {
      if (message.kind === "event" && message.event.topic === "launcher")
        cache.setQueryData(launcherKey, message.event.value);
    });
    const unsubscribe = client.subscribe("launcher");
    return () => {
      off();
      unsubscribe();
    };
  }, [client, cache]);
  const profile =
    query.data && !query.data.protected
      ? previewProfile(query.data.profiles)
      : undefined;
  return (
    <>
      <RailBlock title={text.overlays} icon="v-studio">
        <p>{text.overlaysHelp}</p>
        <Button
          size="sm"
          disabled={Boolean(studioLock)}
          aria-description={studioLock}
          onClick={() => navigate("studio")}
        >
          {text.openStudio}
        </Button>
      </RailBlock>
      <RailBlock title={text.preview} icon="v-palette">
        <AppearancePreview
          palette={
            state.view ? t(`appearance.${state.view.appearance.palette}`) : ""
          }
          profile={profile?.name}
          applications={profile?.apps.length}
          live={core.live}
        />
      </RailBlock>
    </>
  );
}
