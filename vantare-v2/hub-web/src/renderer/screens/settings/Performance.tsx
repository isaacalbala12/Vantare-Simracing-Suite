import { useQuery } from "@tanstack/react-query";
import {
  performanceLevels,
  tableHz,
  widgetHz,
} from "../../../contract/generated/contract";
import { coreKey, offline } from "../../app/Host";
import { lock } from "../../app/navigation";
import { useSettings } from "../../app/SettingsState";
import { useUi } from "../../app/UiState";
import { t } from "../../i18n/es";
import { Button } from "../../ui/Button";
import { Callout, Card, Pill, SettingRow, Table } from "../../ui/Data";
import { RadioGroup } from "../../ui/Forms";

const levels = performanceLevels;
export function Performance() {
  const state = useSettings();
  const navigate = useUi((ui) => ui.navigate);
  const core =
    useQuery({
      queryKey: coreKey,
      queryFn: async () => offline,
      enabled: false,
    }).data ?? offline;
  const studioLock = lock("studio", core.access);
  if (!state.view) return null;
  const { track } = state.view;
  const disabled =
    state.view.protected || track.protected || Boolean(state.error);
  return (
    <>
      {track.protected && <Callout tone="warn" title={t("track.protected")} />}
      <Card title={t("track.level")}>
        {track.customized && <Pill>{t("track.custom")}</Pill>}
        <SettingRow label={t("track.automatic")}>
          <Pill>{t("track.soon")}</Pill>
        </SettingRow>
        <RadioGroup
          pending={state.pending}
          label={t("track.level")}
          value={track.level}
          options={levels.map((value) => ({
            value,
            label: t(`track.${value}`),
            disabled,
          }))}
          onChange={(value) => {
            const level = levels.find((level) => level === value);
            if (level) state.update({ field: "performance", value: level });
          }}
        />
        <SettingRow
          label={t("track.custom")}
          description={t("track.customHelp")}
        >
          <Button
            disabled={Boolean(studioLock)}
            aria-description={studioLock}
            onClick={() => navigate("studio")}
          >
            {t("track.openStudio")}
          </Button>
        </SettingRow>
      </Card>
      <Card title={t("track.table")}>
        <Table
          caption={t("track.table")}
          empty={t("track.empty")}
          columns={[
            { key: "kind", label: t("track.table") },
            ...levels.map((key) => ({ key, label: t(`track.${key}`) })),
          ]}
          rows={[
            {
              id: "widgets",
              cells: [
                t("track.widgets"),
                ...widgetHz.map((hz) =>
                  hz === 0 ? t("track.photo") : `${hz} Hz`,
                ),
              ],
            },
            {
              id: "tables",
              cells: [t("track.tables"), ...tableHz.map((hz) => `${hz} Hz`)],
            },
            {
              id: "flags",
              cells: [
                t("track.flags"),
                ...levels.map(() => t("track.instant")),
              ],
            },
          ]}
        />
      </Card>
    </>
  );
}
