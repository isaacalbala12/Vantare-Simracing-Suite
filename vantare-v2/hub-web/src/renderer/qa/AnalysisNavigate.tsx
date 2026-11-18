import { useEffect, useRef } from "react";
import { offline } from "../app/Host";
import { visible } from "../app/navigation";
import { useSettings } from "../app/SettingsState";
import { useUi } from "../app/UiState";
import { useUpdatesChannel } from "../app/UpdatesState";
export default function AnalysisNavigate() {
  const navigate = useUi((s) => s.navigate);
  const settings = useSettings();
  const channel = useUpdatesChannel();
  const canOpen = visible(
    "analysis",
    offline.access,
    channel,
    settings.view?.general.analisisBeta,
  );
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !canOpen) return;
    opened.current = true;
    navigate("analysis");
  }, [canOpen, navigate]);
  const applied = useRef(false);
  useEffect(() => {
    const scene = new URLSearchParams(location.search).get("escena");
    if (
      applied.current ||
      settings.recordingAtStart === undefined ||
      (scene !== "analysis-qa-status-pendingOff" &&
        scene !== "analysis-qa-status-pendingOn")
    )
      return;
    applied.current = true;
    settings.update({
      field: "grabacion",
      value: scene === "analysis-qa-status-pendingOn",
    });
  }, [settings]);
  return null;
}
