import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { AnalysisController } from "./AnalysisController";
import { coreKey, offline, useHost } from "./Host";
import { useUi } from "./UiState";
export function useAnalysis() {
  useAnalysisRail();
  const { client } = useHost();
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    enabled: false,
    queryFn: async () => offline,
  });
  const allowed =
    core.access.verified && !core.access.blocked && core.access.analysis;
  const controller = useMemo(
    () => (client && allowed ? new AnalysisController(client) : undefined),
    [client, allowed],
  );
  useEffect(() => {
    controller?.load();
    return () => controller?.dispose();
  }, [controller]);
  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? noop,
    controller?.snapshot ?? emptySnapshot,
  );
  return { ...snapshot, controller, access: core.access };
}
const empty = {
  rows: [],
  inspections: {},
  rowErrors: {},
  loading: false,
  opening: false,
};
const emptySnapshot = () => empty;
const noop = () => () => {};

// The analysis layout borrows the existing collapsed rail while narrow, then
// restores the preference it found on entry, like the Studio canvas sidebar.
function useAnalysisRail() {
  const collapsed = useUi((s) => s.railCollapsed);
  const toggle = useUi((s) => s.toggleRail);
  const initial = useRef(collapsed);
  const current = useRef(collapsed);
  current.current = collapsed;
  useEffect(() => {
    const body = document.querySelector(".v-shell-body");
    if (!body || typeof ResizeObserver === "undefined") return;
    const set = (value: boolean) => {
      if (current.current !== value) {
        current.current = value;
        toggle();
      }
    };
    const adapt = () => set(body.clientWidth < 1100 || initial.current);
    const observer = new ResizeObserver(adapt);
    observer.observe(body);
    adapt();
    return () => {
      observer.disconnect();
      set(initial.current);
    };
  }, [toggle]);
}
