import { Tabs } from "@base-ui/react/tabs";
import { studioText as t } from "../../i18n/studio";
import { AppearanceInspector } from "./AppearanceInspector";
import { DisabledHint } from "./DisabledHint";
import { TrackInspector } from "./TrackInspector";

export function StudioInspector({
  item,
}: {
  item: import("../../../contract/generated/contract").OverlayInstance;
}) {
  return (
    <Tabs.Root key={item.id} defaultValue="track">
      <Tabs.List className="v-studio-tabs" aria-label={t.inspectorTabs}>
        <DisabledHint label={t.soonTooltip}>
          <Tabs.Tab value="content" disabled>
            {t.content}
          </Tabs.Tab>
        </DisabledHint>
        {item.settings ? (
          <Tabs.Tab value="appearance">{t.appearance}</Tabs.Tab>
        ) : (
          <DisabledHint label={t.soonTooltip}>
            <Tabs.Tab value="appearance" disabled>
              {t.appearance}
            </Tabs.Tab>
          </DisabledHint>
        )}
        <Tabs.Tab value="track">{t.track}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="appearance">
        <AppearanceInspector item={item} />
      </Tabs.Panel>
      <Tabs.Panel value="track">
        <TrackInspector key={item.id} item={item} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}
