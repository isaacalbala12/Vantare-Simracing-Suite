import { useQuery } from "@tanstack/react-query";
import { coreKey, offline, useHost } from "../../app/Host";
import { lock } from "../../app/navigation";
import { useUi } from "../../app/UiState";
import { t } from "../../i18n/es";
import { Button } from "../../ui/Button";
import { Callout, Card, Keycap, SettingRow, Skeleton } from "../../ui/Data";
import { ActionGroup } from "../../ui/ShellLayout";
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
    ["shell.favorite", "shortcuts.ctrlL"],
    ["shell.commands", "shell.ctrlK"],
    ["shell.sidebar", "shell.ctrlB"],
    ["shell.railToggle", "shell.ctrlAltB"],
    ["general.zoom", "shell.ctrlZoom"],
    ["shell.notices", "shortcuts.ctrlShiftN"],
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
      <Card
        title={t("shortcuts.global")}
        actions={
          <ActionGroup>
            <Button onClick={() => void query.refetch()}>
              {t("settings.reload")}
            </Button>
            <Button
              disabled={Boolean(launcherLock)}
              aria-description={launcherLock}
              onClick={() => navigate("launcher")}
            >
              {t("shortcuts.edit")}
            </Button>
          </ActionGroup>
        }
      >
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
              key={profile.name + profile.hotkey}
              label={profile.name}
              description={t(`shortcuts.${profile.state}`)}
            >
              <Keycap>{profile.hotkey}</Keycap>
            </SettingRow>
          ))
        ) : (
          <Callout title={t("shortcuts.empty")} />
        )}
      </Card>
      <Card title={t("shortcuts.hub")}>
        {hub.map(([label, key]) => (
          <SettingRow
            key={label}
            label={t(label)}
            description={t("shortcuts.hubHelp")}
          >
            <Keycap>{t(key)}</Keycap>
          </SettingRow>
        ))}
      </Card>
      <Card title={t("shortcuts.studio")}>
        {studio.map(([label, key]) => (
          <SettingRow
            key={label}
            label={t(label)}
            description={t("shortcuts.studioHelp")}
          >
            <Keycap>{t(key)}</Keycap>
          </SettingRow>
        ))}
      </Card>
    </>
  );
}
