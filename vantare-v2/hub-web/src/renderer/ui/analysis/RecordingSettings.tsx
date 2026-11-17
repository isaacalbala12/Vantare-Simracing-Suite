import { useSettings } from "../../app/SettingsState";
import { analysisText as t } from "../../i18n/analysis.es";
import { Button } from "../Button";
import { Badge, Callout, SettingGroup, SettingRow } from "../Data";
import { Switch } from "../Forms";
import { ActionGroup } from "../ShellLayout";
export function RecordingSettings() {
  const state = useSettings();
  const initial = state.recordingAtStart;
  const value = state.view?.general.grabacion;
  return (
    <SettingGroup number={2} title={t.recordingGroup}>
      <SettingRow label={t.record} description={t.recordHelp}>
        <Switch
          hideLabel
          label={t.record}
          checked={value ?? true}
          disabled={!state.view || state.view.protected || !!state.error}
          pending={state.pending}
          onCheckedChange={(value) =>
            state.update({ field: "grabacion", value })
          }
        />
      </SettingRow>
      {value !== initial && initial !== undefined && (
        <Callout
          tone="warn"
          title={value ? t.pendingOn : t.pendingOff}
          actions={
            <ActionGroup>
              <Button
                disabled={
                  state.pending || state.view?.protected || !!state.error
                }
                onClick={() =>
                  state.update({ field: "grabacion", value: initial })
                }
              >
                {t.undo}
              </Button>
            </ActionGroup>
          }
        />
      )}
      <SettingRow label={t.when} description={t.restart}>
        <Badge>{t.restartBadge}</Badge>
      </SettingRow>
    </SettingGroup>
  );
}
