import { useEffect, useRef } from "react";
import { useSettings } from "../app/SettingsState";
import { useUi } from "../app/UiState";
export default function AnalysisNavigate() {
  const navigate = useUi((s) => s.navigate);
  useEffect(() => navigate("analysis"), [navigate]);
  const settings = useSettings();
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
