import { useQuery } from "@tanstack/react-query";
import { coreKey, offline } from "../../app/Host";
import { lock } from "../../app/navigation";
import { useSettings } from "../../app/SettingsState";
import { useUi } from "../../app/UiState";
import { t } from "../../i18n/es";
import { Callout } from "../../ui/Data";
import { PerformancePanel } from "../../ui/PerformanceLevels";
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
    !track.exists ||
    state.view.protected ||
    track.protected ||
    Boolean(state.error);
  return (
    <>
      {!track.exists && (
        <Callout title={t("track.waiting")}>{t("track.waitingHelp")}</Callout>
      )}
      {track.protected && <Callout tone="warn" title={t("track.protected")} />}
      <PerformancePanel
        track={track}
        disabled={disabled}
        pending={state.pending}
        studioLock={studioLock}
        onChange={(value) => state.update({ field: "performance", value })}
        onStudio={() => navigate("studio")}
      />
    </>
  );
}
