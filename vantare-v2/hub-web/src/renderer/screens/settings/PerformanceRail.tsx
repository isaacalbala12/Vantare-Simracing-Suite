import { useSettings } from "../../app/SettingsState";
import { performanceText as text } from "../../i18n/performance.es";
import { RailBlock } from "../../ui/Frame";
import { PerformanceStatus } from "../../ui/PerformanceLevels";
export function PerformanceRail() {
  const { view } = useSettings();
  return (
    <RailBlock title={text.now} icon="v-gauge">
      <p>{text.help}</p>
      {view && <PerformanceStatus track={view.track} />}
    </RailBlock>
  );
}
