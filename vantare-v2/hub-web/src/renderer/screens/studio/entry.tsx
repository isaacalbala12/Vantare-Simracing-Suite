import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { studioText as t } from "../../i18n/studio";
import { StudioFocus } from "../../ui/studio/StudioFocus";
import { StudioProvider } from "./state";
import "../../ui/studio/studio.css";
export default function StudioEntry() {
  return (
    <StudioProvider>
      <SectionChrome title={t.title} rail={false} />
      <SectionPanel activeTab="studio">
        <StudioFocus />
      </SectionPanel>
    </StudioProvider>
  );
}
