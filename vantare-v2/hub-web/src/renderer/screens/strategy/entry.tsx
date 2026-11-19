import { lazy, Suspense } from "react";
import { useHost } from "../../app/Host";
import { strategyOpen } from "../../app/navigation";
import { useSettings } from "../../app/SettingsState";
import { useUpdates } from "../../app/UpdatesState";
import { StrategyEntry } from "../../qa/strategy-entry";
import { Upcoming } from "../upcoming/Upcoming";

// Loaded when the section opens, never at start-up.
const Strategy = lazy(() => import("./StrategyReal"));

export default function Screen() {
  const { client } = useHost();
  const settings = useSettings();
  const updates = useUpdates();
  const channel = updates.isError ? undefined : updates.data?.channel;
  const fallback = <Upcoming module="strategy" />;
  if (client && strategyOpen(channel, settings.view?.general.analisisBeta))
    return (
      <Suspense fallback={fallback}>
        <Strategy client={client} />
      </Suspense>
    );
  return <StrategyEntry fallback={fallback} />;
}
