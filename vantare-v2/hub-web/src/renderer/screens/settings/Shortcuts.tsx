import { useQuery } from "@tanstack/react-query";
import { coreKey, offline, useHost } from "../../app/Host";
import { lock } from "../../app/navigation";
import { useUi } from "../../app/UiState";
import { t } from "../../i18n/es";
import { Button } from "../../ui/Button";
import {
  Callout,
  Keycap,
  SettingGroup,
  SettingRow,
  Skeleton,
} from "../../ui/Data";
import { SettingActions } from "../../ui/SettingActions";
import { shortcutsText } from "./shortcuts.es";
export function Shortcuts() {
  const { client } = useHost();
  const navigate = useUi((ui) => ui.navigate);
  const core =
    useQuery({
      queryKey: coreKey,
      queryFn: async () => offline,
      enabled: false,
    }).data ?? offline;
  const launcherLock = lock("launcher", core.access);
  const query = useQuery({
    queryKey: ["shortcuts"],
    enabled: !!client,
    queryFn: async () => {
      const reply = await client?.request({ method: "shortcuts.get" });
      if (reply?.method !== "shortcuts.get")
        throw new Error("Shortcuts unavailable");
      return reply.value;
    },
  });
  const hub = [
    ["favorite", "shortcuts.ctrlL"],
    ["search", "shell.ctrlK"],
    ["sidebar", "shell.ctrlB"],
    ["rail", "shell.ctrlAltB"],
  ] as const;
  const studio = [
    ["shortcuts.save", "shortcuts.keysSave"],
    ["shortcuts.undo", "shortcuts.keysUndo"],
    ["shortcuts.redo", "shortcuts.keysRedo"],
    ["shortcuts.duplicate", "shortcuts.keysDuplicate"],
    ["shortcuts.delete", "shortcuts.keysDelete"],
    ["shortcuts.move", "shortcuts.keysMove"],
  ] as const;
  return (
    <>
      <SettingGroup number={1} title={t("shortcuts.global")}>
        {query.isPending ? (
          <Skeleton label={t("settings.loading")} />
        ) : query.isError || query.data?.protected ? (
          <Callout
            tone="warn"
            title={t("shortcuts.protected")}
            actions={
              <Button onClick={() => void query.refetch()}>
                {t("settings.reload")}
              </Button>
            }
          />
        ) : query.data?.profiles.length ? (
          query.data.profiles.map((profile) => (
            <SettingRow
              key={profile.id}
              label={profile.name}
              description={t(`shortcuts.${profile.state}`)}
            >
              <Keycap>{profile.hotkey}</Keycap>
            </SettingRow>
          ))
        ) : (
          <SettingRow
            label={shortcutsText.profiles}
            description={t("shortcuts.empty")}
          >
            <Button
              size="sm"
              disabled={Boolean(launcherLock)}
              aria-description={launcherLock}
              onClick={() => navigate("launcher")}
            >
              {t("shortcuts.edit")}
            </Button>
          </SettingRow>
        )}
        {Boolean(query.data?.profiles.length) && !query.data?.protected && (
          <SettingActions>
            <Button
              size="sm"
              disabled={Boolean(launcherLock)}
              aria-description={launcherLock}
              onClick={() => navigate("launcher")}
            >
              {t("shortcuts.edit")}
            </Button>
          </SettingActions>
        )}
      </SettingGroup>
      <SettingGroup number={2} title={t("shortcuts.hub")}>
        {hub.map(([label, key]) => (
          <SettingRow
            key={label}
            label={shortcutsText[label]}
            description={t("shortcuts.hubHelp")}
          >
            <Keycap>{t(key)}</Keycap>
          </SettingRow>
        ))}
      </SettingGroup>
      <SettingGroup number={3} title={t("shortcuts.studio")}>
        {studio.map(([label, key]) => (
          <SettingRow
            key={label}
            label={t(label)}
            description={t("shortcuts.studioHelp")}
          >
            <Keycap>{t(key)}</Keycap>
          </SettingRow>
        ))}
      </SettingGroup>
    </>
  );
}
