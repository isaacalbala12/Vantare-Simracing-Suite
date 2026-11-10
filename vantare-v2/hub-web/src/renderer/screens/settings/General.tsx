import { useMutation } from "@tanstack/react-query";
import {
  densities,
  type SettingsPatch,
} from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import { useSettings } from "../../app/SettingsState";
import { t } from "../../i18n/es";
import { Button } from "../../ui/Button";
import { Card, Pill, SettingRow } from "../../ui/Data";
import { Segmented, Switch } from "../../ui/Forms";
import { useToastManager } from "../../ui/Layers";
import { ZoomControl } from "../../ui/ZoomControl";
export function General() {
  const state = useSettings();
  const { client } = useHost();
  const toast = useToastManager();
  const notice = useMutation({
    mutationFn: async () => {
      const result = await client?.request({ method: "notifications.test" });
      return result?.method === "notifications.test" && result.accepted;
    },
    onError: () =>
      toast.add({ title: t("general.noticeUnavailable"), type: "err" }),
    onSuccess: (accepted) =>
      toast.add({
        title: t(accepted ? "general.noticeSent" : "general.noticeUnavailable"),
      }),
  });
  if (!state.view) return null;
  const view = state.view;
  const disabled = state.pending || view.protected;
  const options = densities.map((value) => ({
    value,
    label: t(`general.${value}`),
  }));
  function toggle(
    field: Extract<SettingsPatch, { value: boolean }>["field"],
    label: string,
    checked: boolean,
  ) {
    return (
      <Switch
        label={label}
        checked={checked}
        hideLabel
        disabled={disabled}
        pending={state.pending && state.field === field}
        onCheckedChange={(value) => state.update({ field, value })}
      />
    );
  }
  return (
    <>
      <Card title={t("general.interface")}>
        <SettingRow
          label={t("general.language")}
          description={t("general.languageHelp")}
        >
          <Pill>{t("general.spanish")}</Pill>
        </SettingRow>
        <SettingRow
          label={t("general.zoom")}
          description={t("general.zoomHelp")}
        >
          <ZoomControl
            value={view.zoom}
            disabled={disabled}
            onChange={(value) => state.update({ field: "zoom", value })}
            label={t("general.zoom")}
            less={t("general.zoomLess")}
            more={t("general.zoomMore")}
            reset={t("general.zoomReset")}
          />
        </SettingRow>
        <SettingRow
          label={t("general.density")}
          description={t("general.densityHelp")}
        >
          <Segmented
            label={t("general.density")}
            options={options}
            value={view.general.density}
            disabled={disabled}
            onChange={(next) => {
              const value = densities.find((value) => value === next);
              if (value) state.update({ field: "density", value });
            }}
          />
        </SettingRow>
      </Card>
      <Card title={t("general.start")}>
        <SettingRow
          label={t("general.startup")}
          description={t(
            view.startup.supported
              ? "general.startupHelp"
              : "general.startupUnavailable",
          )}
        >
          <Switch
            label={t("general.startup")}
            hideLabel
            checked={view.startup.enabled}
            disabled={disabled || !view.startup.supported}
            pending={state.pending && state.field === "startup"}
            onCheckedChange={(value) =>
              state.update({ field: "startup", value })
            }
          />
        </SettingRow>
        <SettingRow
          label={t("general.minimized")}
          description={t("general.minimizedHelp")}
        >
          {toggle("minimized", t("general.minimized"), view.general.minimized)}
        </SettingRow>
      </Card>
      <Card title={t("general.notices")}>
        <SettingRow
          label={t("general.updates")}
          description={t("general.updatesHelp")}
        >
          {toggle("updates", t("general.updates"), view.general.updates)}
        </SettingRow>
        <SettingRow
          label={t("general.launcher")}
          description={t("general.launcherHelp")}
        >
          {toggle("launcher", t("general.launcher"), view.general.launcher)}
        </SettingRow>
        <SettingRow
          label={t("general.toasts")}
          description={t("general.toastsHelp")}
        >
          {toggle("toasts", t("general.toasts"), view.general.toasts)}
        </SettingRow>
        {view.general.toasts && (
          <Button
            disabled={window.vantare?.platform !== "win32"}
            busy={notice.isPending}
            onClick={() => notice.mutate()}
          >
            {t("general.testNotice")}
          </Button>
        )}
      </Card>
    </>
  );
}
