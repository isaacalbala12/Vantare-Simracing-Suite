import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { coreKey, offline, useHost } from "../../app/Host";
import { strategyOpen } from "../../app/navigation";
import { useSettings } from "../../app/SettingsState";
import { StrategyEntry } from "../../qa/strategy-entry";
import { Upcoming } from "../upcoming/Upcoming";

// Loaded when the section opens, never at start-up.
const Strategy = lazy(() => import("./StrategyReal"));

export default function Screen() {
  const { client } = useHost();
  const settings = useSettings();
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const fallback = <Upcoming module="strategy" />;
  if (client && strategyOpen(core.access, settings.view?.general.analisisBeta))
    return (
      <Suspense fallback={fallback}>
        <Strategy client={client} />
      </Suspense>
    );
  return <StrategyEntry fallback={fallback} />;
}
