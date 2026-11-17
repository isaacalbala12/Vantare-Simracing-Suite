import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AnalysisController } from "./AnalysisController";
import { coreKey, offline, useHost } from "./Host";
export function useAnalysis() {
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
};
const emptySnapshot = () => empty;
const noop = () => () => {};
