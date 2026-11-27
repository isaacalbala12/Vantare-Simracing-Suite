import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { coreKey, offline } from "../app/Host";
import { visible } from "../app/navigation";
import { useSettings } from "../app/SettingsState";
import { useUi } from "../app/UiState";
export default function AnalysisNavigate() {
  const navigate = useUi((s) => s.navigate);
  const settings = useSettings();
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const canOpen = visible(
    "analysis",
    core.access,
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
