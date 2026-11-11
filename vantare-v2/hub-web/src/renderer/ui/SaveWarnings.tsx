import { usePilot } from "../app/PilotState";
import { useSettings } from "../app/SettingsState";
import { t } from "../i18n/es";
import { Button } from "./Button";
import { Callout } from "./Data";
import { ActionGroup } from "./ShellLayout";
/** Persistent frame feedback when an asynchronous save fails after leaving Settings. */
export function SaveWarnings({ onSettings }: { onSettings: () => void }) {
  const settings = useSettings();
  const pilot = usePilot();
  return (
    <>
      {settings.error && (
        <Callout
          tone="err"
          title={t("settings.failed")}
          actions={
            <ActionGroup>
              <Button busy={settings.pending} onClick={settings.retry}>
                {t("settings.retry")}
              </Button>
              <Button
                disabled={settings.pending}
                variant="ghost"
                onClick={settings.discard}
              >
                {t("settings.discard")}
              </Button>
            </ActionGroup>
          }
        >
          {t("settings.failedHelp")}
        </Callout>
      )}
      {(pilot.error || pilot.closeVeto) && (
        <Callout
          tone={pilot.error ? "err" : "warn"}
          title={t(pilot.error ? "pilot.failed" : "pilot.unsaved")}
          actions={
            <ActionGroup>
              <Button onClick={onSettings}>{t("settings.account")}</Button>
              <Button disabled={pilot.busy} onClick={pilot.discard}>
                {t("pilot.discard")}
              </Button>
            </ActionGroup>
          }
        >
          {pilot.error ? t("pilot.failedHelp") : undefined}
        </Callout>
      )}
    </>
  );
}
